/**
 * Copies storage bucket contents from production to staging.
 *
 *   npm run db:copy-storage
 *
 * The database clone brings over the `storage.buckets` and `storage.objects` rows,
 * but the files those rows point at live in object storage, not Postgres — without
 * this step every screenshot and photo URL in staging resolves to a 404.
 *
 * Reads its configuration from scripts/db/.env.db.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Config = {
  prodUrl: string;
  prodKey: string;
  stagingUrl: string;
  stagingKey: string;
};

function loadConfig(): Config {
  const path = resolve(__dirname, ".env.db");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`missing ${path} — copy .env.db.example to .env.db and fill it in`);
  }

  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }

  const required = [
    "PROD_SUPABASE_URL",
    "PROD_SERVICE_ROLE_KEY",
    "STAGING_SUPABASE_URL",
    "STAGING_SERVICE_ROLE_KEY",
  ] as const;
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`${path} is missing: ${missing.join(", ")}`);
  }

  if (env.PROD_SUPABASE_URL === env.STAGING_SUPABASE_URL) {
    throw new Error("PROD_SUPABASE_URL and STAGING_SUPABASE_URL are the same project. Refusing to continue.");
  }

  return {
    prodUrl: env.PROD_SUPABASE_URL,
    prodKey: env.PROD_SERVICE_ROLE_KEY,
    stagingUrl: env.STAGING_SUPABASE_URL,
    stagingKey: env.STAGING_SERVICE_ROLE_KEY,
  };
}

const admin = (url: string, key: string): SupabaseClient =>
  createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

/** Storage listing is one directory at a time, so walk the tree. */
async function listAllPaths(client: SupabaseClient, bucket: string, prefix = ""): Promise<string[]> {
  const paths: string[] = [];
  const pageSize = 100;
  let offset = 0;

  for (;;) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(prefix, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`listing ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Folders come back as rows with a null id.
      if (entry.id === null) {
        paths.push(...(await listAllPaths(client, bucket, path)));
      } else {
        paths.push(path);
      }
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return paths;
}

async function main() {
  const config = loadConfig();
  const prod = admin(config.prodUrl, config.prodKey);
  const staging = admin(config.stagingUrl, config.stagingKey);

  console.log(`source      ${config.prodUrl}`);
  console.log(`destination ${config.stagingUrl}\n`);

  const { data: buckets, error: bucketsError } = await prod.storage.listBuckets();
  if (bucketsError) throw new Error(`listing production buckets: ${bucketsError.message}`);
  if (!buckets?.length) {
    console.log("No buckets on production — nothing to copy.");
    return;
  }

  let copied = 0;
  let failed = 0;

  for (const bucket of buckets) {
    // The clone normally brings the bucket row across; create it if it did not.
    const { error: getError } = await staging.storage.getBucket(bucket.id);
    if (getError) {
      const { error: createError } = await staging.storage.createBucket(bucket.id, {
        public: bucket.public,
        fileSizeLimit: bucket.file_size_limit ?? undefined,
        allowedMimeTypes: bucket.allowed_mime_types ?? undefined,
      });
      if (createError) throw new Error(`creating bucket ${bucket.id}: ${createError.message}`);
      console.log(`created bucket ${bucket.id}`);
    }

    const paths = await listAllPaths(prod, bucket.id);
    console.log(`${bucket.id}: ${paths.length} file(s)`);

    for (const path of paths) {
      const { data: file, error: downloadError } = await prod.storage.from(bucket.id).download(path);
      if (downloadError || !file) {
        console.warn(`  ! download ${bucket.id}/${path}: ${downloadError?.message ?? "empty response"}`);
        failed += 1;
        continue;
      }

      const { error: uploadError } = await staging.storage
        .from(bucket.id)
        .upload(path, file, { contentType: file.type || undefined, upsert: true });
      if (uploadError) {
        console.warn(`  ! upload ${bucket.id}/${path}: ${uploadError.message}`);
        failed += 1;
        continue;
      }

      copied += 1;
      if (copied % 25 === 0) console.log(`  ${copied} copied ...`);
    }
  }

  console.log(`\nDone. ${copied} file(s) copied, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
