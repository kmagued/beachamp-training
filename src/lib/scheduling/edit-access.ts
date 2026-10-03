// Who may change the schedule: admins anything; a group's primary coach only that group's
// sessions, and never which coach runs them.

export interface ScheduleEditor {
  id: string;
  isAdmin: boolean;
  /** Groups this person is the active primary coach of */
  primaryGroupIds: ReadonlySet<string>;
}

/** Admins change any session; a primary coach only their own group's. A private session has
 *  no group, so only admins change it. */
export function canEditGroupSchedule(editor: ScheduleEditor, groupId: string | null): boolean {
  if (editor.isAdmin) return true;
  return groupId !== null && editor.primaryGroupIds.has(groupId);
}

/** The coach a saved session gets: admins choose; a primary coach can't change it, so an
 *  existing session keeps its coach and a new one is theirs */
export function sessionCoachId(
  editor: ScheduleEditor,
  requested: string | null,
  existing?: { coach_id: string | null }
): string | null {
  if (editor.isAdmin) return requested;
  return existing ? existing.coach_id : editor.id;
}
