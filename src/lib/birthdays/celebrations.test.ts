import { test } from "node:test";
import assert from "node:assert/strict";
import {
  birthdayInYear,
  findBirthdays,
  occursOn,
  type BirthdayPlayer,
  type CelebrationSession,
} from "./celebrations";

// October 2026: Sat 3, Sun 4, Mon 5, Tue 6, Wed 7, Thu 8, Fri 9, Sat 10, Sun 11, Mon 12

function player(over: Partial<BirthdayPlayer> = {}): BirthdayPlayer {
  return { id: "p1", firstName: "Ahmed", lastName: "Fathy", avatarUrl: null, dateOfBirth: "2002-10-05", phone: null, ...over };
}

/** Group A trains Mon + Thu at 18:00; the two weekdays are separate schedule rows */
function session(over: Partial<CelebrationSession> = {}): CelebrationSession {
  return {
    id: "a-mon",
    kind: "group",
    dayOfWeek: 1,
    startTime: "18:00",
    startsOn: null,
    endDate: null,
    label: "Group A",
    playerIds: ["p1"],
    ...over,
  };
}

const aMon = session();
const aThu = session({ id: "a-thu", dayOfWeek: 4 });

function run(over: Partial<Parameters<typeof findBirthdays>[0]> = {}) {
  return findBirthdays({
    players: [player()],
    sessions: [aMon, aThu],
    cancelled: new Set(),
    from: "2026-10-03",
    to: "2026-10-10",
    ...over,
  });
}

// ── birthdayInYear ──

test("birthdayInYear moves the birthday to the given year", () => {
  assert.equal(birthdayInYear("2002-10-05", 2026), "2026-10-05");
});

test("birthdayInYear: a Feb 29 birthday is Feb 28 in a non-leap year", () => {
  assert.equal(birthdayInYear("2004-02-29", 2027), "2027-02-28");
  assert.equal(birthdayInYear("2004-02-29", 2028), "2028-02-29");
});

// ── occursOn ──

test("occursOn: a weekly session runs on its weekday", () => {
  assert.equal(occursOn(aMon, "2026-10-05", new Set()), true);
  assert.equal(occursOn(aMon, "2026-10-06", new Set()), false);
});

test("occursOn: a weekly session doesn't run before it was created", () => {
  const s = session({ startsOn: "2026-10-06" });
  assert.equal(occursOn(s, "2026-10-05", new Set()), false);
  assert.equal(occursOn(s, "2026-10-12", new Set()), true);
});

test("occursOn: a weekly session runs on its end date but not after it", () => {
  const s = session({ endDate: "2026-10-05" });
  assert.equal(occursOn(s, "2026-10-05", new Set()), true);
  assert.equal(occursOn(s, "2026-10-12", new Set()), false);
});

test("occursOn: a cancelled date doesn't run", () => {
  assert.equal(occursOn(aMon, "2026-10-05", new Set(["a-mon_2026-10-05"])), false);
});

test("occursOn: a private session runs only on its one date", () => {
  const s = session({ id: "priv", kind: "private", dayOfWeek: 3, endDate: "2026-10-07" });
  assert.equal(occursOn(s, "2026-10-07", new Set()), true);
  assert.equal(occursOn(s, "2026-10-14", new Set()), false);
});

// ── findBirthdays ──

test("a birthday on a training day is celebrated at that day's session", () => {
  const [entry] = run();
  assert.deepEqual(entry, {
    player: player(),
    birthday: "2026-10-05",
    age: 24,
    session: { id: "a-mon", date: "2026-10-05", startTime: "18:00", label: "Group A" },
  });
});

test("a birthday on a rest day is celebrated at the next session", () => {
  const [entry] = run({ players: [player({ dateOfBirth: "2002-10-06" })] });
  assert.deepEqual(entry.session, { id: "a-thu", date: "2026-10-08", startTime: "18:00", label: "Group A" });
});

test("across groups, the earliest session after the birthday wins", () => {
  const bSat = session({ id: "b-sat", dayOfWeek: 6, startTime: "10:00", label: "Group B" });
  const [entry] = run({ players: [player({ dateOfBirth: "2002-10-09" })], sessions: [aMon, aThu, bSat] });
  assert.equal(entry.session?.id, "b-sat");
  assert.equal(entry.session?.date, "2026-10-10");
});

test("two sessions on the birthday: the earlier start time wins", () => {
  const bMonMorning = session({ id: "b-mon", startTime: "08:00", label: "Group B" });
  const [entry] = run({ sessions: [aMon, bMonMorning] });
  assert.equal(entry.session?.id, "b-mon");
});

test("a cancelled session is skipped for the next one", () => {
  const [entry] = run({ cancelled: new Set(["a-mon_2026-10-05"]) });
  assert.equal(entry.session?.id, "a-thu");
  assert.equal(entry.session?.date, "2026-10-08");
});

test("a private session the player is booked into counts", () => {
  const priv = session({ id: "priv", kind: "private", dayOfWeek: 2, endDate: "2026-10-06", label: "Private" });
  const [entry] = run({ players: [player({ dateOfBirth: "2002-10-06" })], sessions: [aMon, aThu, priv] });
  assert.equal(entry.session?.id, "priv");
});

test("only sessions the player is in count", () => {
  const someoneElses = session({ id: "b-tue", dayOfWeek: 2, playerIds: ["p2"] });
  const [entry] = run({ players: [player({ dateOfBirth: "2002-10-06" })], sessions: [aMon, aThu, someoneElses] });
  assert.equal(entry.session?.id, "a-thu");
});

test("a session exactly 7 days after the birthday still counts", () => {
  // Mon only: birthday Mon 5 is cancelled, so the celebration moves to Mon 12
  const [entry] = run({ sessions: [aMon], cancelled: new Set(["a-mon_2026-10-05"]), to: "2026-10-12" });
  assert.equal(entry.session?.date, "2026-10-12");
});

test("no session within 7 days: the birthday is listed without a session", () => {
  // Birthday Tue 6; the only session is Wed 14, eight days later
  const wed = session({ id: "a-wed", dayOfWeek: 3, startsOn: "2026-10-08" });
  const [entry] = run({ players: [player({ dateOfBirth: "2002-10-06" })], sessions: [wed], to: "2026-10-20" });
  assert.equal(entry.birthday, "2026-10-06");
  assert.equal(entry.session, null);
});

test("a birthday just before the window is listed when its session falls inside it", () => {
  // Birthday Fri 2, celebrated Mon 5
  const [entry] = run({ players: [player({ dateOfBirth: "2002-10-02" })] });
  assert.equal(entry.birthday, "2026-10-02");
  assert.equal(entry.session?.date, "2026-10-05");
});

test("a birthday already celebrated before the window is left out", () => {
  // Birthday Wed 30 Sep, celebrated Thu 1 Oct
  assert.deepEqual(run({ players: [player({ dateOfBirth: "2002-09-30" })] }), []);
});

test("a birthday inside the window is listed even when its session falls after it", () => {
  // Birthday Fri 9, celebrated Mon 12, window ends Sat 10
  const [entry] = run({ players: [player({ dateOfBirth: "2002-10-09" })] });
  assert.equal(entry.session?.date, "2026-10-12");
});

test("a birthday outside the window with no session in it is left out", () => {
  assert.deepEqual(run({ players: [player({ dateOfBirth: "2002-10-20" })] }), []);
});

test("a late-December birthday is celebrated at a January session", () => {
  const sat = session({ id: "b-sat", dayOfWeek: 6 });
  const [entry] = findBirthdays({
    players: [player({ dateOfBirth: "2002-12-30" })],
    sessions: [sat],
    cancelled: new Set(),
    from: "2027-01-02",
    to: "2027-01-02",
  });
  assert.equal(entry.birthday, "2026-12-30");
  assert.equal(entry.age, 24);
  assert.equal(entry.session?.date, "2027-01-02");
});

test("a player in no session at all is skipped", () => {
  assert.deepEqual(run({ sessions: [session({ playerIds: ["p2"] })] }), []);
});

test("a date of birth in the birthday's own year is ignored", () => {
  assert.deepEqual(run({ players: [player({ dateOfBirth: "2026-10-05" })] }), []);
});

test("entries are ordered by celebration date, then birthday when there's no session", () => {
  const mona = player({ id: "p2", firstName: "Mona", dateOfBirth: "2001-10-03" });
  const omar = player({ id: "p3", firstName: "Omar", dateOfBirth: "2001-10-04" });
  const loner = player({ id: "p4", firstName: "Laila", dateOfBirth: "2001-10-07" });
  const lonerSession = session({ id: "far", dayOfWeek: 0, startsOn: "2026-10-30", playerIds: ["p4"] });
  const entries = run({
    players: [player({ dateOfBirth: "2002-10-08" }), mona, omar, loner],
    sessions: [session({ playerIds: ["p1", "p2", "p3"] }), session({ id: "a-thu", dayOfWeek: 4, playerIds: ["p1", "p2", "p3"] }), lonerSession],
  });
  // Mona and Omar both celebrate Mon 5 (Mona's birthday first), Laila has none (Wed 7), Ahmed Thu 8
  assert.deepEqual(
    entries.map((e) => e.player.firstName),
    ["Mona", "Omar", "Laila", "Ahmed"]
  );
});
