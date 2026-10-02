import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { sheetsToWorkbook } from "./export-excel";

test("sheetsToWorkbook adds the sheets in order with their column widths", () => {
  const wb = sheetsToWorkbook(XLSX, [
    { name: "Summary", rows: [["Coach", "Total"], ["Ahmed", 5550]], cols: [20, 10] },
    { name: "Ahmed", rows: [["Date"], ["2026-09-01"]], cols: [12] },
  ]);
  assert.deepEqual(wb.SheetNames, ["Summary", "Ahmed"]);
  assert.deepEqual(wb.Sheets.Summary["!cols"], [{ wch: 20 }, { wch: 10 }]);
});

test("sheetsToWorkbook writes numbers as numeric cells and leaves null cells empty", () => {
  const wb = sheetsToWorkbook(XLSX, [{ name: "S", rows: [["Total", 5550, null, "x"]], cols: [] }]);
  const ws = wb.Sheets.S;
  assert.equal(ws.B1.t, "n");
  assert.equal(ws.B1.v, 5550);
  assert.equal(ws.C1, undefined);
  assert.equal(ws.D1.v, "x");
});
