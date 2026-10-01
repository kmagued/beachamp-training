import { test } from "node:test";
import assert from "node:assert/strict";
import { closedMonthBlock, closedMonthScoreBlock } from "./lock";

type Result = { data?: unknown; count?: number | null; error?: { message: string } | null };

/**
 * A stand-in for the Supabase admin client. Every query on a table resolves to that
 * table's canned result, whatever filters are chained; `tables` records what was read.
 */
function stubAdmin(results: Record<string, Result>) {
  const tables: string[] = [];
  const admin = {
    from(table: string) {
      tables.push(table);
      const result = { data: null, count: null, error: null, ...results[table] };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query: any = {
        select: () => query,
        eq: () => query,
        in: () => query,
        maybeSingle: async () => result,
        then: (resolve: (r: typeof result) => unknown) => resolve(result),
      };
      return query;
    },
  };
  return { admin, tables };
}

const CLOSED = "The September 2026 leaderboard is closed, and this would change its scores. An admin can reopen it from the Leaderboard.";
const occurrence = { schedule_session_id: "s1", session_date: "2026-09-03" };

test("closedMonthBlock: an open month may be written", async () => {
  const { admin } = stubAdmin({ leaderboard_month_closes: { data: null } });
  assert.equal(await closedMonthBlock(admin, "2026-09"), null);
});

test("closedMonthBlock: a closed month is refused with the closed message", async () => {
  const { admin } = stubAdmin({ leaderboard_month_closes: { data: { month: "2026-09" } } });
  assert.equal(await closedMonthBlock(admin, "2026-09"), CLOSED);
});

test("closedMonthBlock: a check that can't run refuses, rather than letting the write through", async () => {
  const { admin } = stubAdmin({ leaderboard_month_closes: { error: { message: "relation does not exist" } } });
  assert.equal(
    await closedMonthBlock(admin, "2026-09"),
    "Couldn't check whether the leaderboard is closed: relation does not exist"
  );
});

test("closedMonthScoreBlock: nobody's score is at stake, so nothing is read", async () => {
  const { admin, tables } = stubAdmin({ leaderboard_month_closes: { data: { month: "2026-09" } } });
  assert.equal(await closedMonthScoreBlock(admin, occurrence, []), null);
  assert.deepEqual(tables, []);
});

test("closedMonthScoreBlock: an open month goes ahead without looking at scores", async () => {
  const { admin, tables } = stubAdmin({ leaderboard_month_closes: { data: null }, king_of_court_scores: { count: 2 } });
  assert.equal(await closedMonthScoreBlock(admin, occurrence, ["a", "b"]), null);
  assert.deepEqual(tables, ["leaderboard_month_closes"]);
});

test("closedMonthScoreBlock: a closed month where one of the players holds a score is refused", async () => {
  const { admin } = stubAdmin({
    leaderboard_month_closes: { data: { month: "2026-09" } },
    king_of_court_scores: { count: 1 },
  });
  assert.equal(await closedMonthScoreBlock(admin, occurrence, ["a", "b"]), CLOSED);
});

test("closedMonthScoreBlock: a closed month where none of the players holds a score goes ahead", async () => {
  const { admin } = stubAdmin({
    leaderboard_month_closes: { data: { month: "2026-09" } },
    king_of_court_scores: { count: 0 },
  });
  assert.equal(await closedMonthScoreBlock(admin, occurrence, ["a", "b"]), null);
});

test("closedMonthScoreBlock: a score count that can't be read refuses", async () => {
  const { admin } = stubAdmin({
    leaderboard_month_closes: { data: { month: "2026-09" } },
    king_of_court_scores: { error: { message: "timeout" } },
  });
  assert.equal(
    await closedMonthScoreBlock(admin, occurrence, ["a"]),
    "Couldn't check whether the leaderboard is closed: timeout"
  );
});
