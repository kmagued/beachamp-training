# Coach Pay Export — Design

**Date:** 2026-10-03
**Status:** Approved (design and spec)
**Branch:** `feat/coach-pay-export`, cut from `main` at `c4f6030c`

## Summary

On **People → Coaches** (`/admin/coaches`), an admin selects coaches and clicks **Export**.
A drawer then shows each selected coach's days and hours worked in a chosen month. The
admin enters a rate for each coach, either hourly or daily, sees the totals, and downloads
an Excel pay sheet.

- Days and hours come from coach attendance logged on the Daily Report. Only sessions
  marked **present** count.
- Rates are typed in at export time and **never stored**.
- The Excel file has a **Summary** sheet, followed by **one sheet per coach**.
- One new migration snapshots each attendance row's **hours** when it is first saved. After
  that, editing a session's time doesn't rewrite pay for past months.

## Decisions (settled during brainstorming)

1. **Rates are entered at export time and nothing is stored.** The drawer has a rate box
   for each coach. Rates last while the drawer is open, including across month changes,
   and are cleared when it closes. There are no database columns or settings for rates.
2. **Each coach has their own pay type.** Each row has an **Hourly / Daily** toggle
   (default Hourly), so coaches can be paid differently in the same file.
   - Hourly total = paid hours × rate.
   - Daily total = days worked × rate.
3. **Only present attendance is paid.** Absent and excused rows still appear on the
   coach's sheet, with 0 hours.
   - **Days worked** is the number of distinct `session_date`s on which the coach has at
     least one present row. Two sessions on one day count as 1 day.
   - **Paid hours** is the sum of `hours` over present rows.
4. **Hours are snapshotted on the attendance row.** The hours a coach is paid for a session
   are its length when the attendance was first saved, not its length today. See
   [Data model](#data-model).
5. **File layout:** a Summary sheet, then one sheet per coach.
6. **Approach: the browser loads the data and writes the file.** This matches the existing
   coaches page, which uses the browser Supabase client, and the existing Payments and
   Finances exports, which use SheetJS in the browser. Pay logic lives in pure functions in
   `src/lib/coach-pay/`.
   - Rejected: a server action that summarizes the data. It adds a round trip and puts pay
     logic in a second place.
   - Rejected: a server-generated file through an API route. It would need a new dependency
     and a new pattern, and its only benefit would be cell styling.

## Existing context

- **`coach_attendance`** (`20260925000000_coach_attendance.sql`):
  `coach_id`, `schedule_session_id` (NOT NULL, cascades), `session_date DATE`, `status`
  (`present | absent | excused`), `notes`, `marked_by`. The unique key is
  `(coach_id, schedule_session_id, session_date)`.
  - RLS: admins have full access; coaches can read their own rows.
  - The table has no hours or duration column.
- **The only writer** is `submitCoachAttendance` in `src/app/_actions/training.ts`. It
  upserts `coach_id, schedule_session_id, session_date, status, notes, marked_by` with
  `onConflict: "coach_id,schedule_session_id,session_date"`. PostgREST's upsert updates only
  the columns in the payload.
- **Session length comes from `schedule_sessions.start_time` and `end_time`.** These are
  TIME columns. An end at or before the start, such as an end of `00:00`, means the session
  runs past midnight. The same rule appears in `getSessionHours` in
  `admin/finances/_components/expense-drawer.tsx`.
  - `updateScheduleSession` edits these times in place, which is why hours are snapshotted.
- **Private sessions** have `session_type = 'private'`, `group_id` NULL and `player_id` set.
  The player's name is available as `player:profiles!schedule_sessions_player_id_fkey(first_name, last_name)`.
- **The coaches page** (`admin/coaches/page.tsx`) is a client component.
  - It keeps a `selectedIds: Set<string>` that survives pagination.
  - It renders `<SelectionBar>`, which currently holds only **Delete**.
  - Coach rows (`CoachRow`) are already loaded with names.
- **Month helpers:** `shiftMonth` and `monthRange` in `src/lib/king-of-court/month.ts`,
  `formatMonth` and `formatDay` in `src/lib/king-of-court/format.ts`, and `cairoMonthKey`
  in `src/lib/utils/cairo-time.ts`.
- **Excel:** `xlsx` (SheetJS 0.18.5, the community build) is already a dependency. It can
  set column widths (`!cols`) but cannot style cells.
  `src/lib/utils/export-excel.ts#exportToExcel` writes a single sheet.
- **Tests:** `node:test` run through `tsx --test`. The `npm test` script lists each
  `src/lib/<domain>/*.test.ts` glob explicitly.
- **Migrations are applied to prod before merge.** Add new migration files; never edit an
  existing one.

## Data model

New migration: `supabase/migrations/20261003120000_coach_attendance_hours.sql`.

```sql
ALTER TABLE coach_attendance ADD COLUMN hours NUMERIC(5,2);

-- A session's length in hours; an end at or before the start runs past midnight
CREATE OR REPLACE FUNCTION session_length_hours(p_start TIME, p_end TIME)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT ROUND((EXTRACT(EPOCH FROM (p_end - p_start)) / 3600
    + CASE WHEN p_end <= p_start THEN 24 ELSE 0 END)::numeric, 2)
$$;

-- Snapshot the session's length on first save
CREATE OR REPLACE FUNCTION coach_attendance_set_hours() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.hours IS NULL THEN
    SELECT session_length_hours(s.start_time, s.end_time) INTO NEW.hours
    FROM schedule_sessions s WHERE s.id = NEW.schedule_session_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER coach_attendance_set_hours
  BEFORE INSERT ON coach_attendance
  FOR EACH ROW EXECUTE FUNCTION coach_attendance_set_hours();

-- Backfill existing rows from the sessions' current times
UPDATE coach_attendance ca
SET hours = session_length_hours(s.start_time, s.end_time)
FROM schedule_sessions s
WHERE s.id = ca.schedule_session_id AND ca.hours IS NULL;
```

Choose the timestamp when writing the migration so it sorts after the latest migration on
`main` (currently `20261003000000_badge_tiers.sql`).

**Why this works:**
- On a fresh insert, the trigger fills in `hours`.
- On a re-save, `submitCoachAttendance`'s upsert reaches `ON CONFLICT DO UPDATE` and updates
  only the columns in its payload. `hours` isn't one of them, so the first snapshot stays.
- A status change days later (for example absent → present) keeps the original length.
- `submitCoachAttendance` and the Daily Report don't change.
- Hours are stored on every row, whatever its status. Whether a row is paid is decided at
  read time.

**Known consequence:** if a session's time was simply entered wrong, fixing it won't change
attendance already logged. That needs a one-off `UPDATE`. This is the intended behaviour for
payroll.

**`database.ts` types are stale** and have no `coach_attendance`, so the code continues to
use the existing `as any` cast on the client. No type regeneration is needed.

**Post-apply check** (to run after you apply it on staging and prod):

```sql
SELECT count(*) FILTER (WHERE hours IS NULL) AS missing,
       min(hours), max(hours), count(*) AS total
FROM coach_attendance;
-- Expect missing = 0 and min/max to be plausible session lengths (e.g. 0.5–4)
```

## Pay logic: `src/lib/coach-pay/`

Pure TypeScript with no React or Supabase imports, so it can be unit tested.

- **`hours.ts`**
  - `sessionHours(start: string, end: string): number`. Times are `"HH:MM"` or
    `"HH:MM:SS"`. An end at or before the start wraps past midnight. The result is rounded
    to 2 decimal places.
  - It is used only as a fallback when a row's `hours` is null, which shouldn't happen after
    the migration.
- **`summary.ts`**
  - `type PayType = "hourly" | "daily"`.
  - `type CoachAttendanceRow = { date, status, hours: number | null, startTime, endTime, sessionLabel, location, notes }`.
  - `paidHours(row)` returns `row.hours ?? sessionHours(row.startTime, row.endTime)` for a
    present row, and 0 for any other status.
  - `summarize(rows): { days: number; hours: number }`. `days` counts distinct dates with a
    present row. `hours` is the sum of `paidHours`, rounded to 2 decimal places.
  - `payTotal(type, rate: number | null, s: { days, hours }): number | null` returns `null`
    when the rate is null, and otherwise `round2(hours × rate)` or `round2(days × rate)`.
- **`workbook.ts`**
  - `type Sheet = { name: string; rows: (string | number | null)[][]; cols: number[] }`.
    `cols` holds the column widths in characters.
  - `buildPaySheets(input: { month: string; coaches: { name; payType; rate; rows: CoachAttendanceRow[] }[] }): Sheet[]`.
    Coaches are sorted by name. See [Excel file](#excel-file) for the layout.
  - `uniqueSheetNames(names: string[]): string[]`:
    - Strips `[ ] : * ? / \` and trims whitespace.
    - Cuts names to 31 characters, leaving room for any suffix.
    - Falls back to `"Coach"` when a name ends up empty.
    - Gives duplicates (case-insensitive) a `" (2)"`, `" (3)"`, … suffix.
    - Treats `"Summary"` as already taken.
- **`load.ts`**
  - `loadCoachMonth(supabase, coachIds: string[], month: string): Promise<Record<coachId, CoachAttendanceRow[]>>`.
  - It queries `coach_attendance` with `.in("coach_id", coachIds)`,
    `.gte("session_date", from)` and `.lt("session_date", to)`, where `from` and `to` come
    from `monthRange(month)`. It joins
    `schedule_sessions(start_time, end_time, session_type, location, groups(name), player:profiles!schedule_sessions_player_id_fkey(first_name, last_name))`.
  - It pages with `.range()` in steps of 1000, ordered by `session_date` and `id` so pages
    stay stable.
  - It maps each row to a `CoachAttendanceRow`:
    - `sessionLabel` is the group name, `"Private – {first} {last}"` for a private session,
      or `"Session"` otherwise.
    - Times are cut to `HH:MM`.
  - It sorts each coach's rows by date, then start time.
  - It throws on a Supabase error, and the drawer shows that error.

## Export drawer (UI)

Code goes in a new file, `src/app/(portal)/admin/coaches/_components/export-pay-drawer.tsx`.
It is rendered from `page.tsx`.

**Opening it:**
- An **Export** button sits in the `SelectionBar` to the left of **Delete**. It uses the
  `Download` icon and is styled as a neutral (non-destructive) button that otherwise
  matches Delete's size.
- It opens `<Drawer width="max-w-2xl" title="Export coach pay">` with the selected coaches,
  taken from `coaches` filtered by `selectedIds`.

**Month stepper:**
- `◀ September 2026 ▶`, using `formatMonth(month, "long")`.
- It defaults to `shiftMonth(cairoMonthKey(new Date()), -1)`, meaning last month in Cairo
  time.
- **▶** is disabled at the current Cairo month, so the current, unfinished month can be
  chosen but no later one.

**Loading:**
- `loadCoachMonth` runs when the drawer opens and on each month change.
- It shows a spinner while loading. On failure it shows the error message with a **Retry**
  button.
- A request that finishes after the month has changed again is ignored.

**Coach rows (desktop table):**

| Coach | Days | Hours | Pay type | Rate (EGP) | Total (EGP) |
|---|---|---|---|---|---|

- **Pay type** is a two-button Hourly / Daily toggle.
- **Rate** is a numeric input with min 0 and step "any". Blank means no rate.
- **Total** is `payTotal(...)`, formatted with thousands separators. It shows "—" when the
  rate is blank.
- A coach with no attendance rows for the month shows a muted "No attendance logged" under
  their name, with 0 days and 0 hours.
- The footer row shows the **grand total**, the sum of the non-null totals.
- **Mobile:** each coach is a stacked card with the same fields.

**Rate state:**
- `Record<coachId, { payType, rate: string }>` lives in the drawer.
- It carries over across month changes and resets when the drawer closes.

**Drawer footer:**
- **Cancel** and **Download Excel** buttons.
- When any coach has a blank rate, a note next to the buttons reads "N coach(es) have no
  rate".
- Download is disabled while loading or after an error.
- Download calls `buildPaySheets`, then `exportSheetsToExcel(sheets, "coach-pay-YYYY-MM")`.

**Shared helper:** `src/lib/utils/export-excel.ts` gains
`exportSheetsToExcel(sheets: Sheet[], filename: string)`. It dynamically imports `xlsx`, and
for each sheet calls `aoa_to_sheet`, sets `!cols`, and calls `book_append_sheet`. It then
calls `writeFile`. The existing `exportToExcel` stays as it is.

## Excel file

Filename: `coach-pay-2026-09.xlsx`. Every number is written as a numeric cell, and dates are
written as `YYYY-MM-DD` text.

**Sheet "Summary":**

```
Coach pay — September 2026

Coach        | Days | Hours | Pay type | Rate (EGP) | Total (EGP)
Ahmed Ali    |  12  | 18.5  | Hourly   | 300        | 5550
Omar Hassan  |   4  |  6    | Hourly   |            |            ← blank rate
Sara Nabil   |   9  | 13    | Daily    | 800        | 7200
TOTAL        |  25  | 37.5  |          |            | 12750
```

The TOTAL row sums days and hours over every coach, and total pay over the coaches with a
rate.

**One sheet per coach**, named through `uniqueSheetNames`, in the same order as the
Summary:

```
Date       | Day | Session            | Time        | Location | Status  | Hours | Notes
2026-09-01 | Tue | U14 A              | 18:00–19:30 | Court 2  | present | 1.5   |
2026-09-03 | Thu | Private – Mona Adel| 20:00–21:00 | Court 1  | absent  | 0     | sick

Days worked | 12
Paid hours  | 18.5
Pay type    | Hourly
Rate (EGP)  | 300
Total (EGP) | 5550
```

- `Day` is the short weekday, worked out in UTC from the date string.
- `Hours` is `paidHours(row)`.
- A coach with no rows gets the header, one "No attendance logged" row, and the footer
  showing zeros.

## Error handling and edge cases

- **Nothing selected:** the SelectionBar is hidden, so Export can't be reached.
- **Many coaches or rows:** the load pages past the 1000-row cap. `.in()` over the selected
  IDs is fine at club scale, which is tens of coaches.
- **Attendance on a cancelled date:** it is paid as logged. Attendance is the source of
  truth, and the admin marked it present.
- **Deleted coach:** cascades remove their attendance. They can't be selected anyway.
- **Rate input:** negative or non-numeric input is treated as blank. The `min=0` attribute
  plus parsing with `Number()` and an `isFinite`/`>= 0` check handle this.
- **Non-admin:** the admin layout guards the route, and RLS on `coach_attendance` returns
  only admin-visible rows.

## Testing

**Unit tests** (`node:test`), with `src/lib/coach-pay/*.test.ts` added to the `npm test`
script:

- `sessionHours`:
  - 18:00–19:30 → 1.5
  - 22:00–00:00 → 2
  - 23:00–01:00 → 2
  - `HH:MM:SS` input
- `summarize`:
  - present only
  - two present sessions on one date → 1 day
  - absent and excused rows → 0 hours
  - `hours: null` falls back to the session times
  - rounding
- `payTotal`:
  - hourly
  - daily
  - null rate → null
  - rate 0 → 0
  - rounding to 2 decimal places
- `uniqueSheetNames`:
  - illegal characters
  - a name longer than 31 characters, with and without a suffix
  - case-insensitive duplicates
  - a coach called "Summary"
  - a name that ends up empty
- `buildPaySheets`:
  - Summary rows sorted by name
  - grand total leaves out blank rates
  - per-coach rows and footer
  - the no-attendance placeholder row

**Verification before claiming done:**
- `npm test`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

**Manual check (staging):**
1. Apply the migration and run the post-apply check.
2. Export last month for 2–3 coaches, using one hourly and one daily rate and leaving one
   rate blank.
3. Open the file and check the totals against the drawer.

## Out of scope

- Saving or remembering rates.
- Rate history.
- Editing hours per attendance row, for example when a coach left early.
- Creating a Salary expense from the export.
- Changing the Daily Report or `submitCoachAttendance`.
- Moving the expense drawer's local `getSessionHours` into `src/lib/coach-pay/hours.ts`.
- Styled cells, which would need exceljs.
