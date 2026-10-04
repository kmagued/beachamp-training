import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUpcoming, requestWhen, type RawSession } from "./load";

const booker = { player_id: "booker", profiles: { first_name: "Youssef", last_name: "Osama" } };
const partner = { player_id: "partner", profiles: { first_name: "Mona", last_name: "Adel" } };
const third = { player_id: "third", profiles: { first_name: "Omar", last_name: "Ali" } };
const coach = { first_name: "Karim", last_name: "Hassan" };
const packages = [
  { id: "solo-pkg", price: 1000, private_session_players: 1 },
  { id: "team-pkg", price: 1200, private_session_players: 2 },
];

function session(over: Partial<RawSession> = {}): RawSession {
  return {
    id: "s1",
    player_id: "booker",
    end_date: "2026-10-10",
    start_time: "20:00:00",
    coach,
    private_players: [booker],
    ...over,
  };
}

function build(sessions: RawSession[], playerId: string, extra: Partial<Parameters<typeof buildUpcoming>[0]> = {}) {
  return buildUpcoming({ sessions, cancelled: new Set(), linked: [], packages, playerId, limit: 3, ...extra });
}

test("buildUpcoming: the payer of an unpaid session gets a Pay button at the package price", () => {
  const [s] = build([session()], "booker");
  assert.equal(s.when, "Sat 10 Oct at 8:00 PM");
  assert.equal(s.coach, "Karim Hassan");
  assert.equal(s.youPay, true);
  assert.equal(s.state, "unpaid");
  assert.deepEqual(s.pay, { packageId: "solo-pkg", price: 1000 });
  assert.deepEqual(s.others, []);
});

test("buildUpcoming: a team session is the team price, and the partner sees who pays but no button", () => {
  const team = session({ private_players: [booker, partner] });
  const [mine] = build([team], "booker");
  assert.deepEqual(mine.pay, { packageId: "team-pkg", price: 1200 });
  assert.deepEqual(mine.others, ["Mona Adel"]);

  const [theirs] = build([team], "partner");
  assert.equal(theirs.youPay, false);
  assert.equal(theirs.pay, null);
  assert.equal(theirs.state, "unpaid");
  assert.equal(theirs.payerFirstName, "Youssef");
  assert.deepEqual(theirs.others, ["Youssef Osama"]);
});

test("buildUpcoming: a payment under review or confirmed has no Pay button", () => {
  const pending = build([session()], "booker", { linked: [{ private_session_id: "s1", status: "pending" }] })[0];
  assert.equal(pending.state, "pending");
  assert.equal(pending.pay, null);
  const paid = build([session()], "booker", { linked: [{ private_session_id: "s1", status: "active" }] })[0];
  assert.equal(paid.state, "paid");
  assert.equal(paid.pay, null);
});

test("buildUpcoming: another session's payment doesn't count", () => {
  const [s] = build([session()], "booker", { linked: [{ private_session_id: "other", status: "active" }] });
  assert.equal(s.state, "unpaid");
});

test("buildUpcoming: no payment state with no package for the size, or no payer", () => {
  const [big] = build([session({ private_players: [booker, partner, third] })], "booker");
  assert.equal(big.state, null);
  assert.equal(big.pay, null);
  const [noPayer] = build([session({ player_id: null })], "booker");
  assert.equal(noPayer.state, null);
  assert.equal(noPayer.pay, null);
});

test("buildUpcoming: a session cancelled for its date is left out, then the nearest few are kept", () => {
  const sessions = ["a", "b", "c", "d", "e"].map((id) => session({ id }));
  const kept = build(sessions, "booker", { cancelled: new Set(["b|2026-10-10"]) });
  assert.deepEqual(kept.map((s) => s.id), ["a", "c", "d"]);
});

test("requestWhen: the requested date when there is one, else the day of the week", () => {
  assert.equal(requestWhen({ requested_date: "2026-10-10", requested_day_of_week: 6, requested_time: "20:00:00" }), "Sat 10 Oct at 8:00 PM");
  assert.equal(requestWhen({ requested_date: null, requested_day_of_week: 2, requested_time: "18:30:00" }), "Tue at 6:30 PM");
});

test("buildUpcoming: when payments can't be read, there's no state and no Pay button", () => {
  const [s] = build([session()], "booker", { paymentsKnown: false });
  assert.equal(s.state, null);
  assert.equal(s.pay, null);
});
