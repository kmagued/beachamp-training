import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountOf,
  canCoach,
  coachOrAdmin,
  homePath,
  isPlayer,
  isPrefetch,
  portalOfPath,
  portalsFor,
  switchesFor,
  viewToRemember,
  type Account,
} from "./portals";

const player: Account = { role: "player", is_coach: false, is_player: false };
const playerCoach: Account = { role: "player", is_coach: true, is_player: false };
const coach: Account = { role: "coach", is_coach: true, is_player: false };
const admin: Account = { role: "admin", is_coach: false, is_player: false };
const adminCoach: Account = { role: "admin", is_coach: true, is_player: false };
const adminPlayer: Account = { role: "admin", is_coach: false, is_player: true };
const adminPlayerCoach: Account = { role: "admin", is_coach: true, is_player: true };

test("accountOf: a profile row as an account", () => {
  assert.deepEqual(accountOf({ role: "player", is_coach: true }), playerCoach);
  assert.deepEqual(accountOf({ role: "coach", is_coach: true }), coach);
  assert.deepEqual(accountOf({ role: "admin" }), admin);
});

test("accountOf: no profile, or a role it doesn't know, is a plain player", () => {
  assert.deepEqual(accountOf(null), player);
  assert.deepEqual(accountOf(undefined), player);
  assert.deepEqual(accountOf({ role: "superuser", is_coach: null }), player);
});

test("accountOf: reads player access", () => {
  assert.deepEqual(accountOf({ role: "admin", is_player: true }), adminPlayer);
  assert.equal(accountOf({ role: "admin", is_player: null }).is_player, false);
});

test("isPlayer: player accounts, and admins who also play", () => {
  assert.equal(isPlayer(player), true);
  assert.equal(isPlayer(playerCoach), true);
  assert.equal(isPlayer(adminPlayer), true);
  assert.equal(isPlayer(admin), false);
  assert.equal(isPlayer(adminCoach), false);
  assert.equal(isPlayer(coach), false);
});

test("canCoach: coach accounts, and players or admins with coach access", () => {
  assert.equal(canCoach(coach), true);
  assert.equal(canCoach(playerCoach), true);
  assert.equal(canCoach(adminCoach), true);
  assert.equal(canCoach(player), false);
  assert.equal(canCoach(admin), false);
});

test("coachOrAdmin: every admin, coaching or not, and anyone who coaches", () => {
  assert.equal(coachOrAdmin(admin), true);
  assert.equal(coachOrAdmin(adminCoach), true);
  assert.equal(coachOrAdmin(coach), true);
  assert.equal(coachOrAdmin(playerCoach), true);
  assert.equal(coachOrAdmin(player), false);
});

test("portalsFor: only a player who coaches has two views, player first", () => {
  assert.deepEqual(portalsFor(player), ["player"]);
  assert.deepEqual(portalsFor(playerCoach), ["player", "coach"]);
  assert.deepEqual(portalsFor(coach), ["coach"]);
  assert.deepEqual(portalsFor(admin), ["admin"]);
  assert.deepEqual(portalsFor(adminCoach), ["admin"]);
});

test("portalsFor: an admin who plays has the admin view and the player view", () => {
  assert.deepEqual(portalsFor(adminPlayer), ["admin", "player"]);
  assert.deepEqual(portalsFor(adminPlayerCoach), ["admin", "player"]);
});

test("portalOfPath: the first path segment, matched exactly", () => {
  assert.equal(portalOfPath("/coach"), "coach");
  assert.equal(portalOfPath("/coach/groups/1"), "coach");
  assert.equal(portalOfPath("/player/dashboard"), "player");
  assert.equal(portalOfPath("/admin/coaches"), "admin");
  assert.equal(portalOfPath("/"), null);
  assert.equal(portalOfPath("/login"), null);
  assert.equal(portalOfPath("/coaching"), null);
  assert.equal(portalOfPath("/admin-setup"), null);
});

test("homePath: a player who coaches lands in the view they used last", () => {
  assert.equal(homePath(playerCoach, "coach"), "/coach/dashboard");
  assert.equal(homePath(playerCoach, "player"), "/player/dashboard");
});

test("homePath: the first time, or with a cookie it doesn't recognise, the player view", () => {
  assert.equal(homePath(playerCoach, undefined), "/player/dashboard");
  assert.equal(homePath(playerCoach, "admin"), "/player/dashboard");
  assert.equal(homePath(playerCoach, "nonsense"), "/player/dashboard");
});

test("homePath: a remembered view the account doesn't have is ignored", () => {
  assert.equal(homePath(player, "coach"), "/player/dashboard");
  assert.equal(homePath(coach, "player"), "/coach/dashboard");
  assert.equal(homePath(admin, "coach"), "/admin/dashboard");
  assert.equal(homePath(adminCoach, "coach"), "/admin/dashboard");
});

test("homePath: an admin who plays lands in the view they used last, admin the first time", () => {
  assert.equal(homePath(adminPlayer, "player"), "/player/dashboard");
  assert.equal(homePath(adminPlayer, undefined), "/admin/dashboard");
  assert.equal(homePath(admin, "player"), "/admin/dashboard");
});

const visit = new Headers({ rsc: "1" });

test("viewToRemember: an admin who plays opening the player view", () => {
  assert.equal(viewToRemember(adminPlayer, "/player/dashboard", "admin", visit), "player");
  assert.equal(viewToRemember(adminPlayer, "/coach/dashboard", "admin", visit), null);
});

test("viewToRemember: a player who coaches opening the other view", () => {
  assert.equal(viewToRemember(playerCoach, "/coach/schedule", "player", visit), "coach");
  assert.equal(viewToRemember(playerCoach, "/player/dashboard", "coach", visit), "player");
  assert.equal(viewToRemember(playerCoach, "/coach/dashboard", undefined, new Headers()), "coach");
});

test("viewToRemember: nothing to write when unchanged, not their view, or not a portal", () => {
  assert.equal(viewToRemember(playerCoach, "/coach/schedule", "coach", visit), null);
  assert.equal(viewToRemember(playerCoach, "/admin/dashboard", "player", visit), null);
  assert.equal(viewToRemember(playerCoach, "/invite/abc", "player", visit), null);
});

test("viewToRemember: accounts with one view never get the cookie", () => {
  assert.equal(viewToRemember(player, "/player/dashboard", undefined, visit), null);
  assert.equal(viewToRemember(coach, "/coach/dashboard", undefined, visit), null);
  assert.equal(viewToRemember(admin, "/coach/dashboard", undefined, visit), null);
});

test("viewToRemember: a prefetch of the other view (the bell's link in the coach view) changes nothing", () => {
  const prefetch = new Headers({ rsc: "1", "next-router-prefetch": "1" });
  assert.equal(viewToRemember(playerCoach, "/player/notifications", "coach", prefetch), null);
  assert.equal(viewToRemember(playerCoach, "/coach/dashboard", "player", new Headers({ "sec-purpose": "prefetch" })), null);
});

test("switchesFor: only admins get the three-portal switcher, and only in development", () => {
  assert.deepEqual(switchesFor("admin", portalsFor(admin), true), { devPortals: true, views: false });
  assert.deepEqual(switchesFor("admin", portalsFor(admin), false), { devPortals: false, views: false });
  assert.deepEqual(switchesFor("player", portalsFor(player), true), { devPortals: false, views: false });
  assert.deepEqual(switchesFor("coach", portalsFor(coach), true), { devPortals: false, views: false });
});

test("switchesFor: a player who coaches always gets the Player | Coach switch", () => {
  assert.deepEqual(switchesFor("player", portalsFor(playerCoach), false), { devPortals: false, views: true });
  assert.deepEqual(switchesFor("player", portalsFor(playerCoach), true), { devPortals: false, views: true });
});

test("switchesFor: an admin who plays gets the Admin | Player switch", () => {
  assert.deepEqual(switchesFor("admin", portalsFor(adminPlayer), false), { devPortals: false, views: true });
  assert.deepEqual(switchesFor("admin", portalsFor(adminPlayer), true), { devPortals: true, views: true });
});

test("isPrefetch: Next.js link prefetches and browser prefetch hints", () => {
  assert.equal(isPrefetch(new Headers({ "next-router-prefetch": "1" })), true);
  assert.equal(isPrefetch(new Headers({ purpose: "prefetch" })), true);
  assert.equal(isPrefetch(new Headers({ "sec-purpose": "prefetch;prerender" })), true);
  assert.equal(isPrefetch(new Headers({ rsc: "1" })), false);
  assert.equal(isPrefetch(new Headers()), false);
});
