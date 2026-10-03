import { test } from "node:test";
import assert from "node:assert/strict";
import { attendanceOrder } from "./order";

interface Row {
  name: string;
  saved: boolean;
  canBeCharged: boolean;
}

const names = (rows: Row[]) => attendanceOrder(rows, (r) => r).map((r) => r.name);

test("attendanceOrder: saved attendance first, then players who can be charged, then name", () => {
  assert.deepEqual(
    names([
      { name: "Zeina Fouad", saved: false, canBeCharged: true },
      { name: "Amr Said", saved: false, canBeCharged: false },
      { name: "Bassel Nour", saved: true, canBeCharged: false },
      { name: "Carla Mansour", saved: false, canBeCharged: true },
    ]),
    ["Bassel Nour", "Carla Mansour", "Zeina Fouad", "Amr Said"]
  );
});

test("attendanceOrder: nothing saved yet, players who can be charged come first", () => {
  assert.deepEqual(
    names([
      { name: "Amr Said", saved: false, canBeCharged: false },
      { name: "Zeina Fouad", saved: false, canBeCharged: true },
    ]),
    ["Zeina Fouad", "Amr Said"]
  );
});

test("attendanceOrder: among saved players, chargeable ones first, then name", () => {
  assert.deepEqual(
    names([
      { name: "Dina Kamal", saved: true, canBeCharged: false },
      { name: "Omar Ali", saved: true, canBeCharged: true },
      { name: "Omar Adel", saved: true, canBeCharged: true },
    ]),
    ["Omar Adel", "Omar Ali", "Dina Kamal"]
  );
});

test("attendanceOrder: returns a new list and leaves the one it was given alone", () => {
  const rows: Row[] = [
    { name: "B", saved: false, canBeCharged: true },
    { name: "A", saved: false, canBeCharged: true },
  ];
  const sorted = attendanceOrder(rows, (r) => r);
  assert.deepEqual(sorted.map((r) => r.name), ["A", "B"]);
  assert.deepEqual(rows.map((r) => r.name), ["B", "A"]);
});
