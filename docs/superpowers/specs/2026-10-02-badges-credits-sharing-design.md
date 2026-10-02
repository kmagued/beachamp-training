# Badges, Beachamp Credits & Sharing Achievements — Design

**Date:** 2026-10-02
**Status:** Approved (design); spec awaiting review
**Branch:** `feat/badges-credits-sharing`, cut from `main` at `588757ce`
**Quotation:** SA-2026-002, Phase 2 — "Badges with admin-defined criteria", "Player
achievements page" and "Award card generation and social sharing"

## Summary

Admins create badges from a fixed set of measures. Players earn them automatically, and
each badge pays out **Beachamp Credits**, a balance that a later build will let players
spend on merch. The Achievements page is rebuilt to match the client's mockup: stat
tiles, monthly awards and badges. Players can share any monthly award or earned badge as
a branded card. The card carries the academy logo and, if the player wants, their own
photo.

- **Admin portal:** a new **Competitions → Badges** page to create, edit and delete
  badges.
- **Player portal:** the **Achievements** page gains stat tiles, a Badges section and
  Share buttons. The dashboard's Achievements card mixes in badges and shows the credit
  balance.
- **Notifications:** an in-app notification when a badge is earned. Production also
  emails it, through the existing webhook.
- **Sharing:** the card is drawn in the browser and handed to the phone's share sheet,
  or saved as an image on desktop. Nothing is uploaded.

## Decisions (settled during brainstorming)

1. **Badges are built in this round**, alongside sharing and the page redesign. The
   mockup's "Competitions won" tile is not built, because per-session competitions don't
   exist yet. Its place is taken by a Beachamp Credits tile.
2. **Four measures.** An admin picks one, plus a number:
   - sessions attended;
   - attendance streak;
   - points in one month;
   - monthly wins.
3. **Players are notified** when they earn a badge, in-app, and by email in production.
4. **Badges follow the data.** A player holds a badge only while they meet it.
   Correcting attendance, reopening a month or raising a badge's number can take it
   away. If they qualify again, it comes back with a new notification.
5. **Each badge counts from its own day.** Only activity on or after the day the admin
   created it counts. Nobody gets a badge for history from before it existed.
6. **Badge look:** the admin picks an icon from a fixed set of 12, shown in the gold
   circle from the mockup. Uploading artwork was rejected.
7. **Each badge pays Beachamp Credits**, an admin-set amount of 0 or more:
   - the credits are fixed when earned;
   - if the badge is lost, its credits are taken back;
   - spending credits on merch is a later build.
8. **The share card uses layout A, a full-bleed photo.** The photo fills the card, with
   navy fading up behind the text. Without a photo, the card uses the mockup's navy and
   gold background.
9. **The player's photo is used for that share only.** It is drawn in the browser and
   never uploaded, and remembered on that device for the next share.
10. **Awarding happens in the database (approach A).** A sync function, run by triggers
    on attendance, scores, awards and badges, keeps `player_badges` correct whichever
    screen wrote the data. Two approaches were rejected:
    - server-action syncing, because attendance is written from at least five places
      and missing one would silently skip badges;
    - computing badges on page load, because nothing would mark the moment of earning,
      so there would be nothing to notify on.

## Existing context (verified)

- **Monthly awards:** `leaderboard_month_closes` and `leaderboard_awards` (migration
  `20260930000000_leaderboard_month_close.sql`). Awards are inserted when an admin
  closes a month and cascade-deleted when it is reopened. `closeLeaderboardMonth` and
  `reopenLeaderboardMonth` are in `src/app/_actions/king-of-court.ts`.
- **Award loading and display:**
  - `loadPlayerAwards` and `loadLatestAwards` are in
    `src/lib/king-of-court/awards-load.ts`;
  - `AwardCard` is in `src/components/achievements/award-card.tsx`;
  - the page is `src/app/(portal)/player/achievements/page.tsx`, with `loading.tsx`;
  - the dashboard card is in `src/app/(portal)/player/dashboard/page.tsx`, which calls
    `loadLatestAwards(supabase, id, 3)`.
- **Attendance:**
  - `attendance(player_id, group_id, session_date, session_time, status)`, where
    `status` is `present`, `absent` or `excused`;
  - unique on `(player_id, group_id, session_date)`, and players can read their own
    rows;
  - written from the coach Attendance tab, the admin Daily Report, the
    `log_attendance_with_deduction` RPC and several actions in
    `src/app/_actions/training.ts`;
  - absences exist only where a coach marks them. An unmarked player has no row.
- **King of Court scores:**
  - `king_of_court_scores(player_id, group_id, session_date, points)`;
  - only admins can read or write them under row-level security;
  - a closed month's scores are locked by `kotc_refuse_closed_month`.
- **Notifications:**
  - `notifications(user_id, title, body, type, link, is_read)`; `type` is checked
    against `system`, `payment`, `subscription`, `session`, `private_session` and
    `reminder`;
  - database triggers already insert notifications (migration `20260416000000`);
  - every insert is emailed by `trigger_notification_email()` through `pg_net`. The
    request is queued in the same transaction, so a rolled-back insert sends nothing.
    Staging has no webhook URL and sends nothing.
- **UI kit** (`src/components/ui`): `Drawer` (`open`, `onClose`, `title`, `footer`,
  `width`), `ConfirmDialog`, `Card`, `Badge`, `Button`, `Toast`, `EmptyState`,
  `StatCard`, `Skeleton`, `Input`, `Select`.
- **Nav:** `src/components/layout/sidebar-layout.tsx` has `playerNav` and `adminNav`
  arrays with a Competitions section, and an `iconMap` keyed by nav key.
- **Fonts:** Bebas Neue and Montserrat are self-hosted in `public/fonts`. They're loaded
  through `next/font/local` in `src/app/layout.tsx`, whose family names are hashed, so
  a canvas can't refer to them by name.
- **Logos:**
  - `public/images/favicon.png` is the cream-and-gold logo on a transparent background
    (513 × 536, logo bounds 43,142 → 471,393);
  - `logo.png` is navy on transparent;
  - `teal-logo.png` is cream on an opaque navy square.
- **Icons:** `lucide-react` 0.468 includes `ShieldCheck`, `Star`, `Flame`, `Zap`,
  `Trophy`, `Crown`, `Medal`, `Award`, `Target`, `Sparkles`, `Rocket` and `Volleyball`.
- **Tests:**
  - `npm test` runs `tsx --test` over `src/lib/merch`, `src/lib/nav` and
    `src/lib/king-of-court`;
  - database tests run against staging inside a rolled-back transaction, e.g.
    `scripts/db/test-king-of-court.sh` / `.sql`.
- **Cairo dates:** always taken from the `Africa/Cairo` zone, in SQL with
  `(now() AT TIME ZONE 'Africa/Cairo')::date`, never from a fixed offset.

## Badge rules

A badge has a **name**, an **icon**, a **measure**, a **threshold** (the number), an
amount of **credits** and a **counts-from day**. The counts-from day is the Cairo date
on which it was created, and it never changes. Its **description** is generated from
the measure and the threshold, never typed:

| Measure (`measure`) | Description | Counts (only activity on or after counts-from) | Earned on |
|---|---|---|---|
| Sessions attended (`sessions_attended`) | "Attended 25 sessions" / "Attended 1 session" | Attendance rows with `status = 'present'`, any group or private session | The date of the Nth such session |
| Attendance streak (`attendance_streak`) | "8 sessions in a row" | Attendance rows in date order (`session_date`, then `session_time`, then `created_at`): `present` adds 1, `absent` resets the run to 0, `excused` is skipped. A session with no row doesn't exist as far as the system knows, so it doesn't break the run. | The date of the session where the run first reached N |
| Points in one month (`month_points`) | "100+ points in one month" | King of Court points summed per group per calendar month, live, without waiting for the month to close | The date of the session whose points took that group-month's total to N, taking the earliest across group-months |
| Monthly wins (`monthly_wins`) | "Won a monthly leaderboard" / "Won 3 monthly leaderboards" | 1st-place `leaderboard_awards` whose `month` is the counts-from month or later. A badge created on 2 Oct counts October's award. | The Cairo date the month giving the Nth win was closed (`leaderboard_month_closes.closed_at`) |

- **Each badge is earned once.** Several levels are several badges, e.g. "Court
  Regular" at 25 and "Court Veteran" at 50.
- **Thresholds:** 1 to 1000, except streaks, which start at 2. A streak of 1 is the
  same as attending once.
- **Credits:** a whole number from 0 to 10000. With 0, the badge gives no credits.
- **Names:** 1–40 characters, trimmed, and unique ignoring case.
- **Editing:** name, icon, threshold and credits can be edited. The measure can't, and
  neither can the counts-from day.
  - A new **threshold** re-checks everyone for that badge.
  - New **credits** apply only to future earners.
  - A new **name or icon** shows everywhere straight away. Notifications already sent
    keep the old name.

## Database

One migration: `supabase/migrations/20261002000000_badges_and_credits.sql`.

### Tables

```sql
CREATE TABLE badges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  icon        TEXT NOT NULL CHECK (icon IN ('shield-check','star','flame','zap','trophy','crown',
                                            'medal','award','target','sparkles','rocket','volleyball')),
  measure     TEXT NOT NULL CHECK (measure IN ('sessions_attended','attendance_streak','month_points','monthly_wins')),
  threshold   INTEGER NOT NULL CHECK (threshold BETWEEN 1 AND 1000
                                      AND (measure <> 'attendance_streak' OR threshold >= 2)),
  credits     INTEGER NOT NULL DEFAULT 0 CHECK (credits BETWEEN 0 AND 10000),
  -- Only activity on or after this Cairo date counts toward the badge
  counts_from DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Cairo')::date,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX badges_name_unique ON badges (lower(btrim(name)));
-- plus the existing update_updated_at() trigger

-- A badge a player currently holds. Written only by sync_player_badges().
CREATE TABLE player_badges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id        UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  earned_on       DATE NOT NULL,
  -- No foreign key, as with leaderboard_awards: losing the badge removes it if unread
  notification_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (badge_id, player_id)
);
CREATE INDEX idx_player_badges_player ON player_badges(player_id);

-- The Beachamp Credits ledger. Balance = SUM(amount). Merch spending will add negative rows.
CREATE TABLE credit_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount          INTEGER NOT NULL CHECK (amount <> 0),
  description     TEXT NOT NULL,                -- e.g. "Court Regular badge"
  -- Set for a badge's credits; the credits go when the badge does
  player_badge_id UUID REFERENCES player_badges(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_credit_transactions_player ON credit_transactions(player_id);
```

### Row-level security

| Table | Read | Write |
|---|---|---|
| `badges` | Any signed-in user, because players see locked badges | Admins |
| `player_badges` | The player's own rows; admins all | Nobody directly. Only the `SECURITY DEFINER` sync. |
| `credit_transactions` | The player's own rows; admins all | Nobody directly in this build |

### Functions

- **`badge_measure(p_player UUID, p_badge badges) RETURNS (value INT, current_run INT,
  earned_on DATE)`** is the one place a measure is calculated.
  - `value` is the player's figure for the measure: the count, the best run, the best
    month's points or the number of wins.
  - `current_run` is the streak's run as of the latest row (null for other measures).
  - `earned_on` is the date the threshold was reached, or null if it hasn't been.
  - Marked `STABLE`.
- **`sync_player_badges(p_player UUID, p_badge UUID DEFAULT NULL)`** is
  `SECURITY DEFINER` with `search_path = public`.
  - It returns at once if the player's profile no longer exists, i.e. during a cascading
    delete.
  - It covers every badge, or only `p_badge` when given, comparing `badge_measure` with
    the player's `player_badges` row:
    - **met, no row:** insert the `player_badges` row. If `credits > 0`, insert a
      `credit_transactions` row with `+credits` and the description "<name> badge".
      Insert the notification and store its id. The notification is:
      - title: "You earned the <name> badge";
      - body: "<description>. +<credits> Beachamp Credits." or, with 0 credits,
        "<description>.";
      - `type = 'system'`, `link = '/player/achievements'`.
    - **met, row exists:** update `earned_on` if it changed.
    - **not met, row exists:** delete the row. Its credits cascade away.
- **`player_badges_drop_notification()`** is an `AFTER DELETE` trigger on
  `player_badges` that deletes `notifications` where `id = OLD.notification_id AND
  is_read = false`. Every way of losing a badge passes through it:
  - the sync;
  - a badge being deleted;
  - a player being deleted.
- **`my_badge_progress() RETURNS TABLE (badge_id UUID, value INT, current_run INT)`** is
  `SECURITY DEFINER` and uses `auth.uid()` only, so a player can't ask about anyone
  else. It feeds the progress line on locked badges. It runs `badge_measure` for every
  badge for the calling player, which means King of Court scores, unreadable to players
  under row-level security, count correctly.

### Triggers that run the sync

| Table | Fires on | Syncs |
|---|---|---|
| `attendance` | `AFTER INSERT`, `DELETE`, `UPDATE OF status, session_date, session_time, player_id` | `NEW.player_id`, and `OLD.player_id` if different or deleted |
| `king_of_court_scores` | `AFTER INSERT`, `UPDATE`, `DELETE` | the same |
| `leaderboard_awards` | `AFTER INSERT`, `DELETE` | the same |
| `badges` | `AFTER INSERT`, `UPDATE OF threshold` | that badge, for every candidate player. A candidate has activity on or after `counts_from` (an attendance row, a score or an award), or already holds the badge. |

- The attendance, score and award triggers wrap the call in
  `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING … END`. A failing badge sync never
  undoes a coach's attendance save or an admin's month close.
  - The failed sync's subtransaction rolls back with its notifications, so nothing is
    emailed.
  - The player catches up on their next change, or when an admin next saves that
    badge's threshold.
- The `badges` trigger doesn't catch errors, so a create or edit that can't sync fails
  and the admin sees why.
- Deleting a badge needs no trigger. Its `player_badges` rows cascade, and
  `player_badges_drop_notification` removes the unread notifications.
- **Order with the closed-month lock:** these are `AFTER` triggers. The existing
  `BEFORE` refusal in a closed month stops the write before any badge work happens.

### Types

Add `badges`, `player_badges` and `credit_transactions` to `src/types/database.ts` by
hand, in the style of the existing entries, together with `Badge`, `PlayerBadge` and
`CreditTransaction` row type exports.

## Shared code — `src/lib/badges/`

Pure functions, unit-tested:

- **`measures.ts`**
  - `MEASURES`: each measure's label ("Sessions attended"), the label for its number
    field ("Sessions", "Sessions in a row", "Points", "Wins") and its minimum
    threshold;
  - `badgeDescription(measure, threshold)`, the descriptions in the rules table;
  - `progressLabel(measure, value, currentRun, threshold)`: "12 of 25 sessions",
    "Current run: 3 of 8", "Best month: 64 of 100 points", "1 of 3 wins", with
    singular forms.
- **`icons.ts`:** `BADGE_ICONS`, the 12 icon keys mapped to `lucide-react` components,
  in display order.
- **`validate.ts`:** `validateBadge(input, { editing })`, which returns the trimmed,
  checked fields or a field-level error. It mirrors the database checks, and rejects a
  measure change on edit.
- **`sort.ts`:** `sortBadges(badges, held)`. Earned badges come first, newest first;
  locked badges follow in creation order.
- **`credits.ts`:** `formatCredits(n)`, giving "1 credit" or "320 credits".

Loading lives in **`src/lib/badges/load.ts`** and uses the caller's own client, as
`awards-load.ts` does:

- `loadPlayerAchievements(supabase, playerId)` returns:
  - the awards;
  - every badge, with the player's `earned_on` if held and their progress from
    `my_badge_progress()`;
  - the credit balance;
  - the count of present sessions.
- `loadLatestAchievements(supabase, playerId, 3)` serves the dashboard. Like
  `loadLatestAwards`, it never throws.

## Admin — Competitions → Badges

- **Nav:** `{ key: "badges", label: "Badges", href: "/admin/badges", section:
  "Competitions" }` after Leaderboard in `adminNav`, with `Medal` in `iconMap`.
- **Page** `src/app/(portal)/admin/badges/page.tsx`, with `loading.tsx`:
  - The header reads "Badges", with the subtitle "Players earn these automatically.
    Each one counts from the day it's added." and a **New badge** button.
  - A grid of badge cards: 1 column on phones, 2 on tablets, 3 on desktop. Each card
    shows:
    - the gold icon circle, the name and the description;
    - "+50 credits" and "12 players hold it";
    - "Counting since 2 Oct 2026";
    - **Edit** and **Delete**.
  - Empty state: "No badges yet. Create one to start rewarding players."
- **Drawer:** the existing `Drawer`, titled "New badge" or "Edit badge".
  - A **live preview** of the badge tile at the top.
  - **Name.**
  - **Icon:** a 6 × 2 grid of the 12 icons, the chosen one ringed in gold.
  - **Measure:** a select. Read-only text when editing.
  - **Number:** the label follows the measure.
  - **Credits.**
  - When creating, a note reads: "Counts activity from today. Players who already meet
    it start from zero."
  - When editing, a hint shows once the number is raised: "Raising it takes the badge,
    and its credits, back from players who no longer qualify."
  - Field errors come from `validateBadge`. A duplicate name reads "There's already a
    badge called Court Regular".
- **Delete:** `ConfirmDialog`, worded "12 players hold Court Regular. Deleting it takes
  it away from them, with the 50 credits it gave each." With no holders: "Nobody holds
  Court Regular yet."
- **Actions** in `src/app/_actions/badges.ts`:
  - `createBadge`, `updateBadge` and `deleteBadge` are admin-only. They use the local
    `getCurrentUserRole` / `requireAdmin` pair that each action file in
    `src/app/_actions/` defines for itself (e.g. `king-of-court.ts`);
  - they validate with `validateBadge` and write with the admin client, setting
    `created_by`;
  - afterwards they revalidate `/admin/badges`, `/player/achievements` and
    `/player/dashboard`;
  - a duplicate name (code 23505) gets the friendly message above.

## Player — Achievements page

`src/app/(portal)/player/achievements/page.tsx` is rebuilt around
`loadPlayerAchievements`. Its `loading.tsx` follows the new layout.

- **Header:** unchanged in style. The subtitle reads "Everything you've won: monthly
  awards and badges."
- **Stat tiles:** 2 per row on phones, 4 on desktop, styled like the mockup.
  1. **Awards** (navy, highlighted): the count, then "Monthly leaderboard finishes".
  2. **Badges earned:** "4 of 6", then "2 still to unlock". When all are earned,
     "All unlocked".
  3. **Beachamp Credits:** the balance, then "From 4 badges". A negative balance is
     shown as is.
  4. **Sessions attended:** all present sessions, not limited by any counts-from day,
     then "All time".
- **Monthly awards:** the existing `AwardCard`, 2 per row on tablets and 3 on desktop.
  It gains a **Share this award** button: filled gold with a share icon for 1st place,
  outlined navy for 2nd, as in the mockup.
- **Badges** (`src/components/achievements/badge-tile.tsx`): 2 per row on phones, 4 on
  desktop, in `sortBadges` order.
  - **Earned:**
    - the gold gradient circle with the icon, the name and the description;
    - a green "Earned 25 Sep" pill and "+50 credits";
    - a small **Share** button.
  - **Locked:** a slate circle with a lock, the name and the description in muted
    text, then the `progressLabel` line and a thin progress bar.
  - The section is hidden when no badges exist.
- **Empty state:** when there are no awards and no earned badges, the existing
  `EmptyState` shows, titled "No achievements yet", with the description "Finish in the
  top 2 of your group's monthly leaderboard, or unlock a badge below." Locked badges
  still render beneath it.

**Dashboard card** (`player/dashboard/page.tsx`):

- It shows up to 3 achievements, awards and earned badges merged newest first. Awards
  are dated by `leaderboard_awards.created_at`, which is when the month was closed;
  badges by `earned_on`.
- A badge row shows the small icon tile, "<name> badge" and its description.
- The header gains a credits chip such as "320 credits" when the balance isn't 0.
- The card still renders only when the player holds an award or a badge.

## Sharing

### Flow — `src/components/achievements/share-drawer.tsx` (client)

1. **Share this award**, or a badge's **Share**, opens the `Drawer`, titled "Share your
   award" or "Share your badge".
2. The drawer shows:
   - the **card preview**, the canvas scaled to fit;
   - **Add your photo**, a hidden `<input type="file" accept="image/*">`. With a photo
     set it becomes **Change photo**, with a **Remove photo** link beside it.
   - the **primary button**:
     - **Share** when `navigator.canShare?.({ files: [testFile] })` is true;
     - otherwise **Save image**, mostly on desktop.
3. **Share** exports the canvas to a JPEG `File` and calls
   `navigator.share({ files, text })`.
   - If the player closes the share sheet (`AbortError`), nothing happens.
   - Any other failure shows a toast and falls back to saving the image.
4. **Save image** downloads the same JPEG through a temporary `<a download>`.

### The card — `src/components/achievements/draw-share-card.ts` (client)

- **Canvas:** 1080 × 1350, Instagram's 4:5 portrait size.
- **Background:**
  - **With a photo:** the photo, cropped to cover and centred. A navy gradient covers
    the top fifth, behind the logo, and a deeper one rises from the bottom, behind the
    text, as in mockup layout A.
  - **Without a photo:** a linear gradient from `#2A6577` through `#124B5D` to
    `#0C313A`, with a soft gold radial glow in the bottom right, as in the client's
    mockup.
- **Logo:** `public/images/logo-cream.png`, top left. It's a new file: `favicon.png`
  trimmed to its logo bounds.
- **Fonts:** `BebasNeue-Regular.ttf` and Montserrat Medium and SemiBold, loaded from
  `/fonts/…` with the `FontFace` API under canvas-only family names. They're awaited
  before every draw, so the card never falls back to a system font.
- **Award card text**, bottom-aligned:
  - "1ST PLACE" or "2ND PLACE" in gold Bebas;
  - the player's full name in cream Bebas;
  - "Women's Team · September 2026" in Montserrat;
  - a hairline, then "142 PTS" and "8 sessions".
- **Badge card text**, bottom-aligned:
  - "BADGE EARNED" in small gold letter-spaced type;
  - the badge icon in a gold circle;
  - the badge name in large Bebas;
  - the description;
  - the player's full name;
  - "Earned 25 September 2026".

  Credits are not on the card.
- **Badge icon:** the lucide icon is rendered to an SVG string and drawn as an image.
- **Long names:** text that's too wide is shrunk to fit by a pure helper,
  `fitFontSize(measure, maxWidth, start, min)`, in `src/lib/share/`.

### The photo

- It's decoded in the browser through an `<img>` from an object URL, which respects the
  phone's EXIF rotation. It's then shrunk to at most 1350 px on the long side.
- It's kept in `localStorage` under `beachamp.sharePhoto.<playerId>` as a JPEG data URL
  at quality 0.85. Reads and writes are wrapped in `try/catch`. If storage is blocked or
  full, the photo just isn't remembered.
- **Remove photo** clears it.
- A file the browser can't decode (e.g. HEIC on desktop Chrome) shows a toast: "That
  photo format isn't supported. Try a JPG or PNG." iPhones convert HEIC to JPEG when
  picking a photo.

### Text and file names — `src/lib/share/` (pure, unit-tested)

- **`shareText`:**
  - award: "1st place in the Women's Team King of Court for September 2026 · Beachamp
    Academy";
  - badge: "I earned the Court Regular badge at Beachamp Academy · Attended 25
    sessions".
- **`shareFileName`:**
  - award: `beachamp-1st-place-september-2026.jpg`;
  - badge: `beachamp-court-regular-badge.jpg`, slugified to lowercase ASCII.

Nothing in this section touches the server. There's no bucket, no API and no ongoing
cost.

## Edge cases

| Case | Behaviour |
|---|---|
| Attendance or a score dated before a badge's counts-from day, including a backfill entered later | Doesn't count toward that badge |
| A badge sync fails inside an attendance, score or award write | The write succeeds. A warning is logged and nothing is emailed. The player catches up on their next change, or when an admin next saves that badge's threshold. |
| A month is reopened | Its awards are deleted, so Monthly-wins badges that depended on them are lost, with their credits and unread notifications. Closing the month again re-awards them with new notifications. |
| A month close fails part-way, after its awards were inserted | The existing rollback deletes the close row and the awards. A Monthly-wins badge given in between is removed, but in production its email may already have been sent. This only happens when a close fails part-way. |
| An admin lowers a threshold | Newly qualifying players earn the badge straight away and are notified, and emailed in production |
| An admin raises a threshold | Holders who no longer qualify lose the badge and its credits |
| An admin changes credits | Current holders keep what they were given; future earners get the new amount |
| A player loses a badge after spending its credits (once spending exists) | The balance can go below zero. The future shop blocks purchases until it's positive. |
| One save crosses two badges | Two badges, two credit rows, two notifications |
| A badge is deleted | Holders lose it and its credits; unread notifications go too |
| A player is deleted | Their badges, credits and notifications cascade. The sync skips the vanishing profile. |
| Attendance is moved between players | Both players are re-checked |
| A coach doesn't mark an absent player | No row exists, so that player's streak isn't broken |
| Two sessions on the same day | Each attendance row counts; a streak orders them by session time |
| A player name or group name too long for the card | `fitFontSize` shrinks it, down to a minimum, then the text is cut with an ellipsis |
| Browser storage is blocked, full or cleared | The photo isn't remembered; sharing works |
| The browser can't share files | The button reads Save image |
| The code is deployed before the migration | The Achievements and Badges pages fail to load. The migration must go to production first. That's safe, because nothing changes until an admin creates a badge. |

## Testing

- **Unit tests**, added to the `npm test` glob as `src/lib/badges/*.test.ts` and
  `src/lib/share/*.test.ts`:
  - `badgeDescription` and `progressLabel` for every measure, including singular forms
    ("1 session", "a monthly leaderboard") and a run of 0;
  - `validateBadge`:
    - blank and over-long names, and trimming;
    - a threshold below the minimum, including a streak of 1;
    - credits out of range;
    - a measure change on edit refused;
  - `sortBadges`: earned newest first, then locked in creation order;
  - `formatCredits`: 1, many, 0 and a negative balance;
  - `shareText` and `shareFileName` for both places and for a badge whose name has
    spaces and punctuation;
  - `fitFontSize` with a fake measure function.
- **Database tests on staging:** `scripts/db/test-badges.sh` / `.sql`, in one
  rolled-back transaction like `test-king-of-court`.
  - **Sessions attended:** earned exactly at N, not at N−1. `earned_on` is the Nth
    date. Rows before `counts_from` are ignored.
  - **Streak:**
    - absent resets the run; excused doesn't;
    - `earned_on` is the day the run reached N;
    - `my_badge_progress` reports the current run.
  - **Points in one month:**
    - two groups in one month don't add together;
    - two months don't add together;
    - `earned_on` is the crossing session's date;
    - scores before `counts_from` are ignored.
  - **Monthly wins:**
    - a 1st place counts and a 2nd place doesn't;
    - an award for a month before the counts-from month is ignored;
    - reopening the month removes the badge.
  - **Losing a badge:**
    - changing attendance to absent removes the badge, its credit row and its unread
      notification;
    - a read notification stays;
    - earning it again creates a new notification.
  - **Credits:** the balance equals the sum of the badges held. Editing credits leaves
    holders' rows unchanged.
  - **Badge changes:**
    - creating a badge syncs players with activity after `counts_from`;
    - raising its threshold removes holders below it;
    - deleting it cascades and removes unread notifications.
  - **Row-level security:**
    - a player reads only their own `player_badges` and `credit_transactions`;
    - a player can't insert into, update or delete from `badges`, `player_badges` or
      `credit_transactions`;
    - `my_badge_progress()` returns only the caller's figures.
- **Manual check in the running app, on staging:**
  - **As an admin:** create, edit and delete badges. Check the preview, the field
    errors, the duplicate name message and the delete wording.
  - **As a coach:** mark a player present until they cross a badge. As that player,
    check the notification, the Achievements page at phone and desktop widths, the
    credits tile and the dashboard card.
  - **Sharing:**
    - an award and a badge, each with and without a photo;
    - on **iPhone Safari** and **Android Chrome**, through to a WhatsApp chat and an
      Instagram story;
    - on desktop, Save image;
    - photo add, change and remove, and that the photo is remembered after a reload.
  - **Reopen a month:** check that a Monthly-wins badge and its credits disappear.

## Out of scope

- Spending Beachamp Credits on merch, admin credit adjustments, and credits for monthly
  awards. The `credit_transactions` ledger is built to take all three later.
- Per-session competitions and the "Competitions won" tile.
- A list of who holds a badge (the admin page shows only the count), and showing badges
  or credits on admin or coach player pages.
- Measures beyond the four, uploading badge artwork, and badges with levels (use
  separate badges).
- Moving or zooming the photo on the card; it's centred and cropped to fit.
- Posting straight to Instagram or Facebook through their APIs.
- Storing photos or generated cards on the server.
