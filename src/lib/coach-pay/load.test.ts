import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByCoach, toCoachAttendanceRow, type RawCoachAttendance } from "./load";

function raw(over: Partial<RawCoachAttendance> = {}): RawCoachAttendance {
  return {
    coach_id: "c1",
    session_date: "2026-09-01",
    status: "present",
    hours: 1.5,
    notes: null,
    schedule_sessions: {
      start_time: "18:00:00",
      end_time: "19:30:00",
      session_type: "group",
      location: "Court 2",
      groups: { name: "U14 A" },
      player: null,
    },
    ...over,
  };
}

test("toCoachAttendanceRow maps a group session and trims times to HH:MM", () => {
  assert.deepEqual(toCoachAttendanceRow(raw()), {
    date: "2026-09-01",
    status: "present",
    hours: 1.5,
    startTime: "18:00",
    endTime: "19:30",
    sessionLabel: "U14 A",
    location: "Court 2",
    notes: null,
  });
});

test("toCoachAttendanceRow labels a private session with the player", () => {
  const r = toCoachAttendanceRow(
    raw({
      schedule_sessions: {
        start_time: "20:00:00",
        end_time: "21:00:00",
        session_type: "private",
        location: null,
        groups: null,
        player: { first_name: "Mona", last_name: "Adel" },
      },
    })
  );
  assert.equal(r.sessionLabel, "Private – Mona Adel");
});

test("toCoachAttendanceRow: a private session whose player is gone is just Private", () => {
  const base = raw().schedule_sessions!;
  const r = toCoachAttendanceRow(raw({ schedule_sessions: { ...base, session_type: "private", groups: null, player: null } }));
  assert.equal(r.sessionLabel, "Private");
});

test("toCoachAttendanceRow: numeric hours arriving as text become numbers, null stays null", () => {
  assert.equal(toCoachAttendanceRow(raw({ hours: "1.25" })).hours, 1.25);
  assert.equal(toCoachAttendanceRow(raw({ hours: null })).hours, null);
});

test("toCoachAttendanceRow: a missing session still gives a row", () => {
  const r = toCoachAttendanceRow(raw({ schedule_sessions: null }));
  assert.equal(r.sessionLabel, "Session");
  assert.equal(r.startTime, "00:00");
});

test("groupByCoach gives every selected coach an entry, even with no attendance", () => {
  const byCoach = groupByCoach([raw({ coach_id: "c1" }), raw({ coach_id: "c1", session_date: "2026-09-02" })], ["c1", "c2"]);
  assert.deepEqual(Object.keys(byCoach).sort(), ["c1", "c2"]);
  assert.equal(byCoach.c1.length, 2);
  assert.deepEqual(byCoach.c2, []);
});

test("groupByCoach ignores rows for coaches that weren't asked for", () => {
  const byCoach = groupByCoach([raw({ coach_id: "other" })], ["c1"]);
  assert.deepEqual(byCoach, { c1: [] });
});
