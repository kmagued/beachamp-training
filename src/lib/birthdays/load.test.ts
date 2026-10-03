import { test } from "node:test";
import assert from "node:assert/strict";
import { isLoadableRange, toBirthdayPlayer, toCelebrationSessions, type RawProfile, type RawSession } from "./load";

function raw(over: Partial<RawSession> = {}): RawSession {
  return {
    id: "s1",
    session_type: "group",
    group_id: "g1",
    player_id: null,
    day_of_week: 1,
    start_time: "18:00:00",
    end_date: null,
    created_at: "2026-09-01T10:00:00+00:00",
    groups: { name: "Group A" },
    schedule_session_players: [],
    ...over,
  };
}

test("toCelebrationSessions: a group session takes its players from the group's members", () => {
  const members = [
    { group_id: "g1", player_id: "p1" },
    { group_id: "g1", player_id: "p2" },
    { group_id: "g2", player_id: "p3" },
  ];
  assert.deepEqual(toCelebrationSessions([raw()], members), [
    {
      id: "s1",
      kind: "group",
      dayOfWeek: 1,
      startTime: "18:00",
      startsOn: "2026-09-01",
      endDate: null,
      label: "Group A",
      playerIds: ["p1", "p2"],
    },
  ]);
});

test("toCelebrationSessions: a weekly session starts on the Cairo day it was created", () => {
  // 00:30 on 3 Oct in Cairo is still 2 Oct in UTC
  const [s] = toCelebrationSessions([raw({ created_at: "2026-10-02T21:30:00+00:00" })], []);
  assert.equal(s.startsOn, "2026-10-03");
});

test("toCelebrationSessions: a private session takes its booked players, plus the legacy player column", () => {
  const [s] = toCelebrationSessions(
    [
      raw({
        session_type: "private",
        group_id: null,
        player_id: "p1",
        end_date: "2026-10-07",
        groups: null,
        schedule_session_players: [{ player_id: "p1" }, { player_id: "p2" }],
      }),
    ],
    []
  );
  assert.equal(s.kind, "private");
  assert.equal(s.label, "Private");
  assert.deepEqual(s.playerIds, ["p1", "p2"]);
});

test("toBirthdayPlayer maps a profile row", () => {
  const profile: RawProfile = {
    id: "p1",
    first_name: "Ahmed",
    last_name: "Fathy",
    avatar_url: null,
    date_of_birth: "2002-10-05",
  };
  assert.deepEqual(toBirthdayPlayer(profile), {
    id: "p1",
    firstName: "Ahmed",
    lastName: "Fathy",
    avatarUrl: null,
    dateOfBirth: "2002-10-05",
  });
});

test("isLoadableRange accepts a week, or a single day", () => {
  assert.equal(isLoadableRange("2026-10-03", "2026-10-10"), true);
  assert.equal(isLoadableRange("2026-10-05", "2026-10-05"), true);
});

test("isLoadableRange rejects malformed or backwards dates, and anything longer than a month", () => {
  assert.equal(isLoadableRange("2026-10-3", "2026-10-10"), false);
  assert.equal(isLoadableRange("2026-10-10", "2026-10-03"), false);
  assert.equal(isLoadableRange("2026-10-01", "2026-11-15"), false);
});

test("toBirthdayPlayer trims stray spaces around names", () => {
  const p = toBirthdayPlayer({ id: "p1", first_name: "Rital ", last_name: " Adel", avatar_url: null, date_of_birth: "2008-10-01" });
  assert.equal(p.firstName, "Rital");
  assert.equal(p.lastName, "Adel");
});
