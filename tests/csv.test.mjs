import assert from "node:assert/strict";
import test from "node:test";
import { parseCSV, toCSV } from "../src/csv.js";

test("parseCSV handles quoted commas and blank cells", () => {
  const parsed = parseCSV('Name,Note,Score\n"Ada, Jr.","great, careful",9\nBob,,7');
  assert.deepEqual(parsed.headers, ["Name", "Note", "Score"]);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].Name, "Ada, Jr.");
  assert.equal(parsed.rows[0].Note, "great, careful");
  assert.equal(parsed.rows[1].Note, "");
});

test("toCSV escapes cells that need quotes", () => {
  const csv = toCSV(["Name", "Note"], [{ Name: "Ada", Note: "uses, comma" }]);
  assert.equal(csv, 'Name,Note\nAda,"uses, comma"');
});
