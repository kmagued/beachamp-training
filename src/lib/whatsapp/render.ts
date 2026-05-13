/**
 * Substitute {{key}} tokens in `body` using `vars`.
 * - If the key resolves to a non-empty string: substitute.
 * - Otherwise (unknown key, null, empty): leave the literal {{key}} in place
 *   so the admin sees what didn't resolve in the preview and can edit it.
 *
 * Tokens match /\{\{([a-z_][a-z0-9_]*)\}\}/ — no whitespace inside the braces.
 */
export function renderTemplate(body: string, vars: Map<string, string | null>): string {
  return body.replace(/\{\{([a-z_][a-z0-9_]*)\}\}/g, (full, key) => {
    const v = vars.get(key);
    if (v && v.trim().length > 0) return v;
    return full;
  });
}
