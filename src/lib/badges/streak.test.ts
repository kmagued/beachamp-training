import { test } from "node:test";
import assert from "node:assert/strict";
import { attendanceStreak, streakMessage, type AttendanceMark } from "./streak";

let order = 0;
const mark = (session_date: string, status: AttendanceMark["status"], session_time: string | null = null): AttendanceMark => ({
  session_date,
  session_time,
  status,
  created_at: `2026-01-01T00:00:${String(order++).padStart(2, "0")}Z`,
});

test("attendanceStreak: no attendance is no streak", () => {
  assert.deepEqual(attendanceStreak([]), { current: 0, best: 0, recent: [] });
});

test("attendanceStreak: present adds one, absent resets, excused is skipped", () => {
  const s = attendanceStreak([
    mark("2026-10-01", "present"),
    mark("2026-10-03", "present"),
    mark("2026-10-05", "absent"),
    mark("2026-10-08", "present"),
    mark("2026-10-10", "excused"),
    mark("2026-10-12", "present"),
  ]);
  assert.equal(s.current, 2, "present, excused, present after the absence");
  assert.equal(s.best, 2);
});

test("attendanceStreak: the best run is kept after it breaks", () => {
  const s = attendanceStreak([
    mark("2026-10-01", "present"),
    mark("2026-10-02", "present"),
    mark("2026-10-03", "present"),
    mark("2026-10-04", "absent"),
    mark("2026-10-05", "present"),
  ]);
  assert.deepEqual([s.current, s.best], [1, 3]);
});

test("attendanceStreak: rows are put in date order, then by session time, untimed last", () => {
  const s = attendanceStreak([
    mark("2026-10-05", "present", "18:00:00"),
    mark("2026-10-05", "absent", "08:00:00"),
    mark("2026-10-02", "present"),
    mark("2026-10-06", "present"),
  ]);
  // 2nd present, 5th 08:00 absent, 5th 18:00 present, 6th present
  assert.deepEqual([s.current, s.best], [2, 2]);
  assert.deepEqual(s.recent, ["present", "absent", "present", "present"]);
});

test("attendanceStreak: recent is the last 8 marks, oldest first", () => {
  const rows = Array.from({ length: 10 }, (_, i) =>
    mark(`2026-10-${String(i + 1).padStart(2, "0")}`, i === 0 || i === 1 ? "absent" : i === 5 ? "excused" : "present")
  );
  const s = attendanceStreak(rows);
  assert.equal(s.recent.length, 8);
  assert.deepEqual(s.recent, ["present", "present", "present", "excused", "present", "present", "present", "present"]);
  assert.equal(s.current, 7);
});

test("streakMessage: encourages from wherever the player is", () => {
  assert.equal(streakMessage(0, 0), "Attend your next session to start a streak.");
  assert.equal(streakMessage(0, 9), "Your best is 9 in a row. Start a new streak at your next session.");
  assert.equal(streakMessage(6, 9), "3 more to beat your best of 9.");
  assert.equal(streakMessage(8, 9), "1 more to beat your best of 9.");
  assert.equal(streakMessage(9, 9), "Your best ever. Keep it going!");
  assert.equal(streakMessage(1, 1), "You're on your way. Keep it going!");
});
