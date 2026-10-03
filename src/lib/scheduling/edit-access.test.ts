import { test } from "node:test";
import assert from "node:assert/strict";
import { canEditGroupSchedule, sessionCoachId, type ScheduleEditor } from "./edit-access";

const admin: ScheduleEditor = { id: "admin-1", isAdmin: true, primaryGroupIds: new Set() };
const primaryCoach: ScheduleEditor = { id: "coach-1", isAdmin: false, primaryGroupIds: new Set(["group-a"]) };
const assistantCoach: ScheduleEditor = { id: "coach-2", isAdmin: false, primaryGroupIds: new Set() };

test("canEditGroupSchedule: admins change any group's sessions and private ones", () => {
  assert.equal(canEditGroupSchedule(admin, "group-a"), true);
  assert.equal(canEditGroupSchedule(admin, "group-b"), true);
  assert.equal(canEditGroupSchedule(admin, null), true);
});

test("canEditGroupSchedule: a primary coach changes only their own group's sessions", () => {
  assert.equal(canEditGroupSchedule(primaryCoach, "group-a"), true);
  assert.equal(canEditGroupSchedule(primaryCoach, "group-b"), false);
});

test("canEditGroupSchedule: private sessions have no group, so only admins change them", () => {
  assert.equal(canEditGroupSchedule(primaryCoach, null), false);
});

test("canEditGroupSchedule: a coach who isn't a group's primary coach changes nothing", () => {
  assert.equal(canEditGroupSchedule(assistantCoach, "group-a"), false);
});

test("sessionCoachId: admins choose the coach, including none", () => {
  assert.equal(sessionCoachId(admin, "coach-9"), "coach-9");
  assert.equal(sessionCoachId(admin, null), null);
  assert.equal(sessionCoachId(admin, "coach-9", { coach_id: "coach-1" }), "coach-9");
});

test("sessionCoachId: a primary coach's new session is theirs, whatever was sent", () => {
  assert.equal(sessionCoachId(primaryCoach, "coach-9"), "coach-1");
  assert.equal(sessionCoachId(primaryCoach, null), "coach-1");
});

test("sessionCoachId: a primary coach's edit keeps the session's coach, even none", () => {
  assert.equal(sessionCoachId(primaryCoach, "coach-9", { coach_id: "coach-3" }), "coach-3");
  assert.equal(sessionCoachId(primaryCoach, "coach-9", { coach_id: null }), null);
});
