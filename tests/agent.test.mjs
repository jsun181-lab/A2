import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DataInsightAgent, MemoryStore } from "../src/agent.js";

const sample = await readFile(new URL("../data/sample_sales_dirty.csv", import.meta.url), "utf8");

test("agent perceives dirty CSV issues and improves quality", () => {
  const agent = new DataInsightAgent({
    memoryStore: new MemoryStore(),
    now: () => new Date("2026-05-24T10:00:00+12:00")
  });

  const result = agent.run({
    csvText: sample,
    fileName: "sample_sales_dirty.csv",
    cleaningMode: "balanced",
    goal: "sales"
  });

  assert.equal(result.perception.rowCount, 24);
  assert.ok(result.perception.duplicates.length >= 1);
  assert.ok(result.decision.cleaningPlan.some((step) => step.action === "remove"));
  assert.ok(result.decision.cleaningPlan.some((step) => step.action === "fill median"));
  assert.ok(result.action.cleanedRows.length < result.perception.rowCount);
  assert.ok(result.action.cleanedQualityScore > result.perception.qualityScore);
  assert.ok(result.action.charts.some((chart) => chart.type === "bar"));
  assert.ok(result.action.summary.length >= 3);
});

test("aggressive mode caps numeric outliers", () => {
  const agent = new DataInsightAgent({ memoryStore: new MemoryStore() });
  const result = agent.run({
    csvText: sample,
    cleaningMode: "aggressive",
    goal: "sales"
  });

  assert.ok(result.decision.cleaningPlan.some((step) => step.action === "cap outliers"));
  assert.ok(result.action.appliedActions.some((action) => action.includes("Capped")));
});

test("agent stores lightweight memory checkpoints", () => {
  const store = new MemoryStore();
  const agent = new DataInsightAgent({ memoryStore: store });
  agent.run({ csvText: sample, fileName: "sample.csv", cleaningMode: "balanced" });
  const entries = store.load();

  assert.equal(entries.length, 1);
  assert.equal(entries[0].fileName, "sample.csv");
  assert.ok(entries[0].qualityAfter >= entries[0].qualityBefore);
});
