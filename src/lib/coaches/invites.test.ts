import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INVITE_DAYS,
  alreadyRegistered,
  escapeLike,
  expiryLabel,
  inviteExpiry,
  inviteMessage,
  inviteProblem,
  inviteState,
  inviteUrl,
  originFrom,
  signupProblem,
} from "./invites";

const NOW = new Date("2026-10-03T12:00:00Z");

test("inviteExpiry: seven days after it's made", () => {
  assert.equal(INVITE_DAYS, 7);
  assert.equal(inviteExpiry(NOW).toISOString(), "2026-10-10T12:00:00.000Z");
});

test("inviteState: open until the moment it expires", () => {
  const open = { expires_at: "2026-10-10T12:00:00Z", accepted_at: null, revoked_at: null };
  assert.equal(inviteState(open, NOW), "pending");
  assert.equal(inviteState(open, new Date("2026-10-10T11:59:59Z")), "pending");
  assert.equal(inviteState(open, new Date("2026-10-10T12:00:00Z")), "expired");
});

test("inviteState: accepted beats revoked beats expired", () => {
  const past = "2026-10-01T00:00:00Z";
  assert.equal(inviteState({ expires_at: past, accepted_at: past, revoked_at: past }, NOW), "accepted");
  assert.equal(inviteState({ expires_at: past, accepted_at: null, revoked_at: past }, NOW), "revoked");
  assert.equal(inviteState({ expires_at: past, accepted_at: null, revoked_at: null }, NOW), "expired");
});

test("inviteUrl: the invite page under the site's address", () => {
  assert.equal(inviteUrl("https://app.beachamp.com", "abc_123"), "https://app.beachamp.com/invite/abc_123");
  assert.equal(inviteUrl("https://app.beachamp.com/", "abc"), "https://app.beachamp.com/invite/abc");
});

test("originFrom: host and protocol from the request", () => {
  assert.equal(originFrom("app.beachamp.com", "https"), "https://app.beachamp.com");
  assert.equal(originFrom("app.beachamp.com", "https,http"), "https://app.beachamp.com");
  assert.equal(originFrom("app.beachamp.com", null), "https://app.beachamp.com");
  assert.equal(originFrom("localhost:3000", null), "http://localhost:3000");
  assert.equal(originFrom(null, "https"), null);
});

test("expiryLabel: the Cairo calendar day, not the server's", () => {
  assert.equal(expiryLabel("2026-10-10T12:00:00Z"), "Sat 10 Oct");
  // 22:30 UTC on Fri 9 Oct is already Sat 10 Oct in Cairo
  assert.equal(expiryLabel("2026-10-09T22:30:00Z"), "Sat 10 Oct");
});

test("inviteMessage: name, link and the last day it works", () => {
  const text = inviteMessage("Omar", "https://x.test/invite/abc", "2026-10-10T12:00:00Z");
  assert.match(text, /^Hi Omar, you're invited to join .+ as a coach\./);
  assert.match(text, /\nhttps:\/\/x\.test\/invite\/abc\n/);
  assert.match(text, /expires on Sat 10 Oct\.$/);
});

test("escapeLike: an email with _ or % matches only itself", () => {
  assert.equal(escapeLike("omar_adel@example.com"), "omar\\_adel@example.com");
  assert.equal(escapeLike("100%@x.com"), "100\\%@x.com");
  assert.equal(escapeLike("back\\slash@x.com"), "back\\\\slash@x.com");
  assert.equal(escapeLike("plain@x.com"), "plain@x.com");
});

test("alreadyRegistered: both ways Supabase says the email has an account", () => {
  assert.equal(alreadyRegistered({ message: "User already registered" }, null), true);
  assert.equal(alreadyRegistered(null, { identities: [] }), true);
});

test("alreadyRegistered: a new account, or a different failure", () => {
  assert.equal(alreadyRegistered(null, { identities: [{ provider: "email" }] }), false);
  assert.equal(alreadyRegistered(null, { identities: null }), false);
  assert.equal(alreadyRegistered(null, null), false);
  assert.equal(alreadyRegistered({ message: "Email rate limit exceeded" }, null), false);
});

test("inviteProblem: names and phone are required, an email is optional but must look right", () => {
  const ok = { first_name: "Omar", last_name: "Adel", phone: "01000000000", email: "" };
  assert.equal(inviteProblem(ok), null);
  assert.equal(inviteProblem({ ...ok, email: "omar@example.com" }), null);
  assert.equal(inviteProblem({ ...ok, first_name: " " }), "First and last name are required");
  assert.equal(inviteProblem({ ...ok, last_name: "" }), "First and last name are required");
  assert.equal(inviteProblem({ ...ok, phone: "  " }), "Phone is required");
  assert.equal(inviteProblem({ ...ok, email: "omar@" }), "Please enter a valid email");
});

test("signupProblem: the coach also needs an email and a 6-character password", () => {
  const ok = { first_name: "Omar", last_name: "Adel", phone: "01000000000", email: "omar@example.com", password: "secret" };
  assert.equal(signupProblem(ok), null);
  assert.equal(signupProblem({ ...ok, first_name: "" }), "First and last name are required");
  assert.equal(signupProblem({ ...ok, email: "" }), "Email is required");
  assert.equal(signupProblem({ ...ok, email: "nope" }), "Please enter a valid email");
  assert.equal(signupProblem({ ...ok, password: "12345" }), "Password must be at least 6 characters");
});
