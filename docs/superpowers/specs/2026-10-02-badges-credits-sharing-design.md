# Badges, Beachamp Credits & Sharing Achievements — Design

**Date:** 2026-10-02 (revised the same day for badge tiers)
**Status:** Approved (design, including tiers)
**Branch:** `feat/badges-credits-sharing`, cut from `main` at `588757ce`
**Quotation:** SA-2026-002, Phase 2: "Badges with admin-defined criteria", "Player
achievements page" and "Award card generation and social sharing"

## Summary

Admins create badges from a fixed set of measures. Each badge has **one to five tiers**:
Bronze, Silver, Gold, Platinum and Diamond. Each tier has its own number and its own
credits. Players earn tiers automatically. Each tier pays out **Beachamp Credits**, a
balance that a later build will let players spend on merch.

The Achievements page is rebuilt to match the client's mockup: stat tiles, monthly awards
and badges. Players can share any monthly award or earned tier as a branded card. The
card carries the academy logo and, if the player wants, their own photo.

- **Admin portal:** a new **Competitions → Badges** page to create, edit and delete
  badges and their tiers.
- **Player portal:**
  - The **Achievements** page gains stat tiles, a Badges section with a tile for every
    tier, and Share buttons.
  - The dashboard's Achievements card mixes in earned tiers and shows the credit balance.
- **Notifications:** an in-app notification for each tier earned. Production also emails
  it, through the existing webhook.
- **Sharing:** the card is drawn in the browser and handed to the phone's share sheet,
  or saved as an image on desktop. Nothing is uploaded.

## Decisions (settled during brainstorming)

1. **Badges are built in this round**, alongside sharing and the page redesign.
   - The mockup's "Competitions won" tile is not built, because per-session competitions
     don't exist yet.
   - Its place is taken by a Beachamp Credits tile.
2. **Four measures.** An admin picks one per badge:
   - sessions attended;
   - attendance streak;
   - points in one month;
   - monthly wins.
3. **Tiers.**
   - A badge has 1 to 5 tiers, always in order from Bronze: Bronze, Silver, Gold,
     Platinum, Diamond.
   - Each tier has its own number and credits.
   - Numbers must rise from tier to tier.
   - All of a badge's tiers are set up together, in the same drawer.
4. **Each tier is earned on its own** and pays its own credits. A Gold holder has
   collected Bronze, Silver and Gold credits.
5. **Players are notified** of each tier they earn, in-app, and by email in production.
6. **Tiers follow the data.** A player holds a tier only while they meet it.
   - Correcting attendance, reopening a month, raising a number or removing a tier can
     take it away.
   - If they qualify again, it comes back with a new notification.
7. **Each badge counts from its own day.**
   - Only activity on or after the day the admin created the badge counts, for every
     tier, including tiers added later.
   - Nobody gets a tier for history from before the badge existed.
8. **Badge look:**
   - The admin picks an icon from a fixed set of 12.
   - It is shown in a medallion in the tier's metal: bronze, silver, gold, platinum
     (cool grey-blue) or diamond (ice blue).
   - Uploading artwork was rejected.
9. **Credits are fixed when earned.**
   - If a tier is lost, its credits are taken back.
   - Changing a tier's credits affects only future earners.
   - Spending credits on merch is a later build.
10. **Achievements page layout B: a tile for every tier.**
    - Each badge is a card with a row of its tier tiles.
    - One tile per badge was offered and declined.
11. **The share card uses layout A, a full-bleed photo.**
    - The photo fills the card, with navy fading up behind the text.
    - Without a photo, the card uses the mockup's navy and gold background.
    - A tier card names the tier and draws the medallion in its metal.
12. **The player's photo is used for that share only.**
    - It is drawn in the browser and never uploaded.
    - It is remembered on that device for the next share.
13. **Awarding happens in the database (approach A).**
    - A sync function keeps `player_badges` correct whichever screen wrote the data. It
      runs from triggers on attendance, scores and awards, and from the badge save
      function.
    - Two approaches were rejected:
      - server-action syncing, because attendance is written from at least five places
        and missing one would silently skip badges;
      - computing badges on page load, because nothing would mark the moment of
        earning, so there would be nothing to notify on.

## Existing context (verified)

- **Monthly awards:**
  - They live in `leaderboard_month_closes` and `leaderboard_awards` (migration
    `20260930000000_leaderboard_month_close.sql`).
  - Awards are inserted when an admin closes a month and cascade-deleted when it is
    reopened.
  - `closeLeaderboardMonth` and `reopenLeaderboardMonth` are in
    `src/app/_actions/king-of-court.ts`.
- **Award loading and display:**
  - `loadPlayerAwards` is in `src/lib/king-of-court/awards-load.ts`;
  - `AwardCard` is in `src/components/achievements/award-card.tsx`;
  - the page is `src/app/(portal)/player/achievements/page.tsx`, with `loading.tsx`;
  - the dashboard card is in `src/app/(portal)/player/dashboard/page.tsx`.
- **Attendance:**
  - Rows are `attendance(player_id, group_id, schedule_session_id, session_date,
    session_time, status)`, where `status` is `present`, `absent` or `excused`.
  - Players can read their own rows.
  - It is written from:
    - the coach Attendance tab;
    - the admin Daily Report;
    - the `log_attendance_with_deduction` RPC;
    - several actions in `src/app/_actions/training.ts`.
  - Absences exist only where a coach marks them. An unmarked player has no row.
- **King of Court scores:**
  - Rows are `king_of_court_scores(player_id, group_id, session_date, points)`, admin-only
    under RLS.
  - A closed month's scores are locked by `kotc_refuse_closed_month`, a BEFORE trigger.
  - `attendance_drop_kotc_score` deletes a score when its attendance stops being
    `present`.
- **Notifications:**
  - Rows are `notifications(user_id, title, body, type, link, is_read)`.
  - Database triggers already insert notifications (migration `20260416000000`).
  - Every insert is emailed by `trigger_notification_email()` through `pg_net`. The
    request is queued in the same transaction, so a rolled-back insert sends nothing.
  - Staging has no webhook URL and sends nothing.
- **UI kit** (`src/components/ui`): `Drawer` (`open`, `onClose`, `title`, `footer`,
  `width`), `ConfirmDialog`, `Card`, `Button`, `Toast`, `EmptyState`, `Skeleton`,
  `Input`, `Select`, `Label`.
- **Nav:**
  - `src/components/layout/sidebar-layout.tsx` has `playerNav` and `adminNav` arrays
    with a Competitions section.
  - It also has an `iconMap` keyed by nav key.
- **Fonts:**
  - Bebas Neue and Montserrat are self-hosted in `public/fonts`.
  - They are loaded through `next/font/local`, which hashes their family names, so a
    canvas loads its own copies with the `FontFace` API.
- **Logos:** `public/images/favicon.png` is the cream-and-gold logo on a transparent
  background.
- **Icons:** `lucide-react` 0.468 includes `ShieldCheck`, `Star`, `Flame`, `Zap`,
  `Trophy`, `Crown`, `Medal`, `Award`, `Target`, `Sparkles`, `Rocket` and `Volleyball`.
- **Tests:**
  - `npm test` runs `tsx --test` over the `src/lib` test globs.
  - Database tests run against staging in a rolled-back transaction, e.g.
    `scripts/db/test-king-of-court.sh` and `.sql`.
- **ESLint:** not configured in this repo. `npm run lint` only offers to set it up.
- **Cairo dates:** always from the `Africa/Cairo` zone, never a fixed offset.

## Badge rules

A badge has:

- a **name**;
- an **icon**;
- a **measure**;
- a **counts-from day**, the Cairo date on which it was created, which never changes;
- **1–5 tiers**.

Tier *n* is Bronze, Silver, Gold, Platinum or Diamond, for *n* = 1–5. Each tier has a
**number** (its threshold) and **credits**.

| Measure (`measure`) | Tier description (generated) | Short form on a tier tile | Counts (activity on or after counts-from) | A tier is earned on |
|---|---|---|---|---|
| Sessions attended (`sessions_attended`) | "Attended 25 sessions" / "Attended 1 session" | "25 sessions" | Attendance with `status = 'present'`, any group or private session | The date of the Nth such session |
| Attendance streak (`attendance_streak`) | "8 sessions in a row" | "8 in a row" | Attendance in date order (`session_date`, `session_time`, `created_at`): `present` adds 1, `absent` resets the run, `excused` is skipped. A session with no row doesn't exist as far as the system knows. | The date the run first reached N |
| Points in one month (`month_points`) | "100+ points in one month" | "100+ points" | King of Court points per group per calendar month, counted live | The date of the session whose points took a group-month to N (the earliest) |
| Monthly wins (`monthly_wins`) | "Won a monthly leaderboard" / "Won 3 monthly leaderboards" | "1 win" / "3 wins" | 1st-place `leaderboard_awards` whose month is the counts-from month or later | The Cairo date the month giving the Nth win was closed |

- **Numbers:**
  - 1 to 1000;
  - a streak tier starts at 2;
  - each tier's number is higher than the tier before it.
- **Credits:** a whole number from 0 to 10000 per tier.
- **Names:** 1–40 characters, trimmed, and unique ignoring case.
- **Order:** a higher tier is never held without the tiers below it, because numbers rise
  from tier to tier.
- **Editing:**
  - Name, icon, and each tier's number and credits can be edited.
  - Tiers can be added above the top tier or removed from the top.
  - The measure and the counts-from day can't be edited.
  - Every save re-checks everyone with activity since counts-from, and everyone holding
    a tier, so it doubles as a "re-check" for a badge.

## Database

One migration: `supabase/migrations/20261002000000_badges_and_credits.sql`.

- The first, untiered version of this migration was applied to staging only. Its three
  tables were empty.
- On staging it is replaced by dropping its objects, deleting its
  `schema_migrations` row and applying the tiered version.
- Production never saw the first version.

### Tables

- **`badges`:** `id`, `name`, `icon`, `measure`, `counts_from` (defaults to today's
  Cairo date), `created_by`, `created_at`, `updated_at`.
  - `name`, `icon` and `measure` have checks as in the rules above.
  - There is a unique index on `lower(btrim(name))`.
  - A trigger refuses any change to `measure` or `counts_from`.
- **`badge_tiers`:** `id`, `badge_id` (cascade), `tier` (1–5), `threshold` (1–1000),
  `credits` (0–10000), `created_at`.
  - Unique on `(badge_id, tier)`.
  - The rise from tier to tier and the streak minimum are checked by `save_badge`.
- **`player_badges`:** one row per tier a player holds.
  - Columns: `id`, `badge_tier_id` (cascade), `player_id` (cascade), `earned_on`,
    `notification_id` (no foreign key), `created_at`.
  - Unique on `(badge_tier_id, player_id)`.
- **`credit_transactions`:** `id`, `player_id`, `amount` (≠ 0), `description`,
  `player_badge_id` (cascade), `created_at`.
  - The balance is the sum of the amounts.
  - Merch spending will add negative rows.

### Row-level security

| Table | Read | Write |
|---|---|---|
| `badges`, `badge_tiers` | Any signed-in user, because players see locked tiers | Nobody directly. Server actions use the service role, through `save_badge` and a plain delete. |
| `player_badges` | The player's own rows; admins all | Nobody directly. Only the `SECURITY DEFINER` sync. |
| `credit_transactions` | The player's own rows; admins all | Nobody directly in this build |

### Functions

- **`tier_name(tier)`:** returns 'Bronze' … 'Diamond'.
- **`badge_description(measure, threshold)`:** the sentences in the rules table. They
  match `badgeDescription()` in `src/lib/badges/words.ts`.
- **`badge_measure(p_player, p_badge badges, p_thresholds INT[])`** returns `(value,
  current_run, reached_on DATE[])`, computing the measure in one pass for every
  threshold:
  - `value` is the player's figure;
  - `current_run` is the streak's run now (streaks only);
  - `reached_on[i]` is the day `p_thresholds[i]` was reached, or null.
- **`sync_player_badges(p_player, p_badge DEFAULT NULL)`** is `SECURITY DEFINER`.
  - It returns at once if the profile no longer exists, i.e. during a cascading delete.
  - It takes a per-player advisory lock.
  - For every badge (or only `p_badge`), it goes through each tier:
    - **met, no row:** insert the `player_badges` row. If credits > 0, insert a
      `+credits` `credit_transactions` row with the description "Court Regular badge
      (Silver)". Insert the notification:
      - title: "You earned the Silver Court Regular badge";
      - body: "Attended 25 sessions. +50 Beachamp Credits." ("Credit" when 1; just the
        description and a full stop when 0);
      - `type = 'system'`, `link = '/player/achievements'`.
    - **met, row exists:** update `earned_on` if it moved.
    - **not met, row exists:** delete the row; its credits cascade away.
- **`player_badges_drop_notification()`** is an AFTER DELETE trigger that deletes the
  tier's notification if it's unread.
- **`save_badge(p_id, p_name, p_icon, p_measure, p_tiers JSONB, p_created_by)`** is
  `SECURITY DEFINER`. Only the service role may execute it.
  - It creates the badge, or updates its name and icon. It refuses a measure change.
  - It validates 1–5 tiers, each number in range, the streak minimum, numbers rising
    from tier to tier, and credits in range.
  - It upserts tiers 1..n and deletes tiers above n.
  - It then re-checks every candidate, ordered by `player_id`. A candidate is anyone
    with activity since counts-from, or anyone holding a tier of the badge.
  - It returns the badge id, all in one transaction.
  - Refusals are `check_violation`s with a sentence fit to show the admin.
- **`badge_summaries()`** is `SECURITY INVOKER`. For each badge it returns the distinct
  players holding any tier and the credits actually paid. It feeds the admin page and
  the delete warning.
- **`my_badge_progress()`** is `SECURITY DEFINER` and works for `auth.uid()` only. It
  returns `(badge_id, value, current_run)` for every badge.
- **Who may execute:**
  - `sync_player_badges` and `badge_measure`: nobody but the database (revoked from
    PUBLIC, anon and authenticated);
  - `save_badge`: the service role only;
  - `my_badge_progress`: authenticated.

### Triggers that run the sync

| Table | Fires on | Syncs |
|---|---|---|
| `attendance` | `AFTER INSERT`, `DELETE`, `UPDATE OF status, session_date, session_time, player_id` | The player, and the old player if it changed |
| `king_of_court_scores` | `AFTER INSERT`, `UPDATE`, `DELETE` | The same |
| `leaderboard_awards` | `AFTER INSERT`, `DELETE` | The same |

- These wrap the call in an exception handler that logs a WARNING. A badge failure never
  undoes a coach's attendance save or an admin's month close.
  - The failed sync's notifications roll back with it, so nothing is emailed.
  - The player catches up on their next change, or when an admin next saves the badge.
- They are AFTER triggers. The closed-month BEFORE refusal stops a write before any
  badge work happens.

## Shared code: `src/lib/badges/` and `src/lib/share/`

- **`config.ts`:**
  - `Measure`, `MEASURES` (label, number label, minimum), `MEASURE_ORDER`;
  - `BADGE_ICONS`;
  - `TIERS`: number, key, label and colours (gradient from/to, a light label colour,
    a pip colour);
  - `MAX_TIERS`, `BADGE_LIMITS`, `isMeasure`, `isBadgeIcon`.
- **`words.ts`:**
  - `badgeDescription`;
  - `tierRequirement` (the short form);
  - `tierProgress` ("34 / 50", or "Run 3 / 8" for a streak) and `progressFraction`;
  - `formatCredits`, `creditsEarned`, `formatBadgeDate`;
  - `playersCount`, `deleteBadgeWarning(name, holders, creditsPaid)`;
  - `badgesDetail(earnedTiers, totalTiers)`, `creditsDetail(paidTiers)`.
- **`validate.ts`:** `validateBadge({ name, icon, measure, tiers: { threshold, credits
  }[] }, { currentMeasure? })`.
  - It returns the cleaned fields, or an error for one field. A tier error carries the
    tier's index.
  - It mirrors `save_badge`. Example messages:
    - "Silver needs a higher number than Bronze";
    - "Add at least one tier".
- **`sort.ts`:** `sortBadges`.
  - Badges with any earned tier come first, newest earned first.
  - Locked badges follow in creation order.
- **`load.ts`:**
  - **`loadPlayerAchievements(supabase, playerId)`** returns:
    - the awards;
    - every badge, with its tiers, the player's `earned_on` and the credits actually
      paid for each tier, and their progress;
    - the credit balance;
    - the count of present sessions.

    All reads run in parallel. It throws on any failed read.
  - **`latestAchievements`** and **`loadLatestAchievements(supabase, playerId, 3)`**
    serve the dashboard:
    - awards and earned tiers, newest first, plus the balance;
    - it never throws;
    - awards still show if badges can't be read.
- **`streak.ts`:** `attendanceStreak(marks)` (current run, best run, the last 8 marks)
  and `streakMessage(current, best)`.
- **`progress.ts`:**
  - `badgeProgress(badges)`: each badge's next tier and how close it is, closest first;
  - `remainingLabel`: "16 more sessions", "2 more in a row", "36 more points in a
    month", "1 more win".
- **`src/lib/share/share.ts`:**
  - `ShareSubject` (an award, or a badge tier);
  - `shareText`, e.g. "I earned the Silver Court Regular badge at Beachamp Academy ·
    Attended 25 sessions";
  - `shareFileName`, e.g. `beachamp-court-regular-silver-badge.jpg`;
  - `slugify`, `fitFontSize`.

## Admin: Competitions → Badges

- **Nav:** "Badges" under Competitions, after Leaderboard, with the `Medal` icon.
- **Page:**
  - The header reads "Badges", with the subtitle "Players earn these automatically. Each
    one counts from the day it's added." and a **New badge** button.
  - A grid of badge cards. Each card shows:
    - the icon in the top tier's metal, the name and the measure;
    - one row per tier: a small medallion in the tier's metal, "Bronze · 10 sessions",
      "+20 credits" and "12 players";
    - "Counting since 2 Oct 2026";
    - **Edit** and **Delete**.
  - Empty state: "No badges yet. Create one to start rewarding players."
- **Drawer** ("New badge" or "Edit badge"):
  - a preview of the medallion in the top tier's metal, the name and the measure;
  - **Name**;
  - **Icon:** a 6 × 2 grid;
  - **Measure:** a select, which is read-only when editing;
  - **Tiers:** one row per tier, each with a small medallion, the tier name, Number and
    Credits.
    - **+ Add Silver** (the next metal) appears while fewer than 5 tiers exist.
    - Only the top tier, when there is more than one, has a remove button.
    - New badges start with Bronze only.
  - Field and tier errors show under the field. Other errors show at the bottom.
  - When creating: "Counts activity from today. Players who already meet it start from
    zero."
  - When editing, a number has been raised or a tier removed: "Raising a number or
    removing a tier takes it, and its credits, back from players who no longer
    qualify."
- **Holders** (added 2026-10-03 at the user's request):
  - **Opening it:** a "View holders (12)" link on each badge card. Each tier's player
    count is also a link.
  - **The drawer** is titled "Court Regular · 12 holders". It has:
    - tier chips (All, then the badge's tiers with counts), pre-selected when opened
      from a tier;
    - a name search;
    - one row per player: initials, name, "since 3 Nov · +70 credits" (credits paid
      by this badge), and a pill for their highest tier in its metal. Each row links to
      `/admin/players/[id]`.
  - **Order:** highest tier first, then whoever reached it first.
  - **A tier chip** shows everyone holding that tier, including those who went higher,
    matching the card's counts.
  - **Loading:** holders load when the drawer opens, through the admin-only
    `loadBadgeHolders` action. `groupHolders` and `filterHolders` in
    `src/lib/badges/holders.ts` are unit-tested.
- **Delete:** `ConfirmDialog`. It reads "12 players hold Court Regular. Deleting it
  takes it away from them, with the 840 credits it gave them." using the credits
  actually paid. If nobody holds it: "Nobody holds Court Regular yet."
- **Actions** in `src/app/_actions/badges.ts`:
  - `createBadge` and `updateBadge` call `save_badge` through the service role, after
    `validateBadge`. They map 23505 to "There's already a badge called …" and show
    `check_violation` messages as they are.
  - `deleteBadge` deletes the row.
  - All three are admin-only, using the file's own `getCurrentUserRole` /
    `requireAdmin`, and revalidate the badge and player pages.

## Player: Achievements page

- **Stat tiles:** 2 per row on phones, 4 on desktop. All four are always shown.
  1. **Awards** (navy): the count, then "Monthly leaderboard finishes".
  2. **Badges earned:** tiers earned of tiers defined, e.g. "7 of 18", then "11 still to
     unlock" or "All unlocked" ("0 of 0" with "None yet" when no badges exist).
  3. **Beachamp Credits:** the balance, then "From 3 badges" (earned tiers that paid
     credits), or "Earn badges to collect them".
  4. **Sessions attended:** all present sessions, then "All time".
- **Monthly awards:** award cards, with **Share this award**: gold for 1st, outlined for
  2nd.
- **Badges (layout B):** one card per badge, in `sortBadges` order. Each card has:
  - a header with the icon medallion (in the top earned tier's metal, or locked), the
    name, the measure label and "2 of 5";
  - a row of tier tiles. They scroll sideways on phones, at 7.5rem each, and sit five
    across from tablet width up.
    - **Earned tile:**
      - the medallion in its metal, the tier name and the short form;
      - a green "25 Sep" pill;
      - the credits actually paid ("+50");
      - **Share**.
    - **Next locked tile:** a lock, the tier name, the short form, `tierProgress` and a
      bar.
    - **Higher locked tiles:** a lock, the tier name and the short form, muted.
  - The section is hidden when no badges exist.
- **Empty state:** with no awards and no earned tiers, the empty card shows "No
  achievements yet". Its description depends on whether badges exist. Locked badges
  still render beneath it.
- **Dashboard** (added 2026-10-02 at the user's request), below the stat cards:
  - **Attendance streak card:**
    - The current run, e.g. "6 sessions in a row", by the badge rules. It covers all
      time, not a badge's start day, and is read from the player's newest 1000 marks.
    - The last 8 marked sessions as dots: filled for present, red outline for absent,
      grey for excused.
    - A line of encouragement (`streakMessage`):
      - "Attend your next session to start a streak.";
      - "Your best is 9 in a row. Start a new streak at your next session.";
      - "3 more to beat your best of 9.";
      - "Your best ever. Keep it going!".
  - **Beachamp Credits card:** the balance, "From 4 badges" (tiers that paid), and "See
    your badges →". It is always shown, even at 0.
  - **Badge progress card:** every badge's next tier, closest first, e.g. "Silver Iron
    Streak · Run 6 / 8", with a bar and "2 more in a row". Badges with every tier earned
    come last, reading "All tiers earned". The card hides when no badges exist.
  - **Achievements card:**
    - The 3 newest achievements: awards (dated by `leaderboard_awards.created_at`) and
      earned tiers (by `earned_on`; same-day tiers show the higher first).
    - A tier row shows the small medallion in its metal, "Court Regular · Silver" and its
      description.
    - It hides when there is nothing to show.

## Sharing

- **Flow** (`share-button.tsx` and `share-drawer.tsx`):
  1. Tapping **Share this award** or a tier's **Share** opens the drawer.
  2. It draws the card and prepares the JPEG before any tap, so `navigator.share` is
     called straight from the tap, as iOS requires.
  3. **Add / Change / Remove photo** are available.
  4. The main button:
     - is **Share** when the browser can share files, otherwise **Save image**;
     - is disabled while a share is already open, so a double tap can't save a stray
       file;
     - does nothing if the share sheet is closed (`AbortError`);
     - otherwise falls back to saving, with a toast, if sharing fails.
- **The card** (`draw-share-card.ts`):
  - **Size:** 1080 × 1350.
  - **Background:** the photo, cropped to cover, with navy fades top and bottom. The
    bottom fade starts higher on badge cards, where the text block is taller. Without
    a photo, the mockup's navy with a gold glow.
  - **Logo:** the cream logo (`public/images/logo-cream.png`, a trimmed copy of
    `favicon.png`), top left.
  - **Award card:** "1ST PLACE" in gold, the name, "Women's Team · September 2026", a
    hairline, "142 PTS · 8 sessions".
  - **Tier card:** "SILVER · BADGE EARNED" in the tier's light colour, the medallion in
    the tier's metal, the badge name in gold, the tier description, a hairline, the
    name, and "Earned 25 September 2026".
  - **Long text:** shrinks to fit (`fitFontSize`), then is cut with an ellipsis, keeping
    whole characters.
- **The photo** (`share-photo.ts`):
  - It's decoded through an `<img>`, so the phone's rotation is respected, and shrunk
    to at most 1350 px.
  - It's kept in `localStorage` (`beachamp.sharePhoto.<playerId>`), with every access
    wrapped in try/catch.
  - A format the browser can't read gets a toast: "That photo format isn't supported.
    Try a JPG or PNG."

## Edge cases

| Case | Behaviour |
|---|---|
| Activity dated before a badge's counts-from day, including a later backfill | Doesn't count toward any of its tiers |
| A tier is added on top later | It counts since the badge's own day. Players already past it earn it at once and are notified. |
| An admin raises a number or removes a tier | Holders who no longer qualify lose that tier and its credits; unread notifications go |
| An admin changes a tier's credits | Current holders keep what they were paid; the tile and the delete warning show the paid amount |
| One save crosses two tiers | Two tiers, two credit rows, two notifications |
| A badge sync fails inside an attendance, score or award write | The write succeeds and a warning is logged. The player catches up on their next change or the badge's next save. |
| A month is reopened | Monthly-wins tiers that depended on it are lost, with their credits and unread notifications |
| A month close fails part-way after its awards were inserted | The existing rollback deletes the awards. A Monthly-wins tier given in between is removed, but its email may already have been sent. This happens only when a close fails part-way. |
| Attendance moved between players | Both players are re-checked |
| A scored player marked absent | The score is dropped by the existing trigger, and the sessions, streak and points tiers are all re-checked |
| Two sessions on the same day | A streak orders them by session time |
| A badge or a player is deleted | Their tiers held, credits and unread notifications cascade away; the sync skips a vanishing profile |
| A coach doesn't mark an absent player | No row exists, so the streak isn't broken |
| A long player, group or badge name on the card | It shrinks to fit, then is cut with an ellipsis |
| A double tap on Share | The second tap does nothing while the share sheet is open |
| Browser storage is blocked, full or cleared | The photo isn't remembered; sharing works |
| The code is deployed before the migration | The Achievements and Badges pages fail to load. The migration must go to production first, which is safe, because nothing happens until an admin creates a badge. |

## Testing

- **Unit tests:** `src/lib/badges/*.test.ts` and `src/lib/share/*.test.ts` cover:
  - descriptions, short forms and progress for every measure, including singular forms;
  - `validateBadge`:
    - name, icon and measure;
    - 0 and 6 tiers;
    - numbers out of range;
    - the streak minimum;
    - numbers not rising from tier to tier;
    - credits out of range;
    - a measure change on edit;
  - `sortBadges`;
  - the credits wording;
  - `deleteBadgeWarning` with the credits paid;
  - the loaders, with stub clients: paid credits per tier, the dashboard's mixed list,
    and failures;
  - `shareText` and `shareFileName` for tiers;
  - `fitFontSize`.
- **Database tests on staging:** `scripts/db/test-badges.sql` and `.sh`, in one
  rolled-back transaction.
  - **Each measure:** earned and not earned, its earned date, and activity before
    counts-from ignored.
  - **Tiers:**
    - each tier earned separately, with its own credits and notification;
    - a tier added on top is earned at once by players past it;
    - removing the top tier removes it from holders;
    - credits edits leave holders' rows alone.
  - **`save_badge` refusals:** numbers that don't rise, a streak of 1, no tiers, six
    tiers, and a measure change.
  - **Losing and regaining:** an unread notification goes, a read one stays, and
    earning it again creates a new one.
  - **Corrections:**
    - attendance moved between players;
    - a scored player marked absent (the score and the points tier go);
    - same-day streak ordering.
  - **`badge_summaries`:** holders and credits paid.
  - **Row-level security:**
    - a player reads only their own `player_badges` and `credit_transactions`;
    - a player can't write any badge table;
    - a player can't call `save_badge` or the sync;
    - `my_badge_progress` returns only the caller's figures.
  - **Failure:** a failing sync doesn't block attendance.
  - **Deletions:** deleting a player cascades.
- **Manual check in the running app, on staging:**
  - an admin creates, edits and deletes tiered badges;
  - a coach marks attendance across two tiers;
  - the player sees the tier tiles at phone and desktop widths, the notifications, the
    credits and the dashboard;
  - sharing an award and a tier, with and without a photo, on iPhone Safari and Android
    Chrome, through to WhatsApp and an Instagram story. Check whether sending `text`
    with the image hides Instagram on iOS;
  - Save image on desktop.

## Out of scope

- Spending Beachamp Credits on merch, admin credit adjustments, and credits for monthly
  awards. The ledger is built to take them later.
- Per-session competitions and the "Competitions won" tile.
- Showing badges or credits on admin or coach player pages.
- Measures beyond the four, uploading badge artwork, and tiers beyond Diamond.
- Moving or zooming the photo on the card.
- Posting straight to Instagram or Facebook through their APIs.
- Storing photos or generated cards on the server.
