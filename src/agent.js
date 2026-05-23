import { parseCSV, toCSV } from "./csv.js";

const MEMORY_KEY = "datainsight-agent-memory";
const MISSING = new Set(["", "na", "n/a", "null", "none", "undefined", "-"]);

export class MemoryStore {
  constructor(storage, key = MEMORY_KEY) {
    this.storage = storage || null;
    this.key = key;
    this.fallback = [];
  }

  load() {
    if (!this.storage) return [...this.fallback];
    try {
      return JSON.parse(this.storage.getItem(this.key) || "[]");
    } catch {
      return [];
    }
  }

  save(entries) {
    const limited = entries.slice(-8);
    if (this.storage) {
      this.storage.setItem(this.key, JSON.stringify(limited));
    } else {
      this.fallback = limited;
    }
    return limited;
  }

  append(entry) {
    return this.save([...this.load(), entry]);
  }

  clear() {
    if (this.storage) this.storage.removeItem(this.key);
    this.fallback = [];
  }
}

export class DataInsightAgent {
  constructor({ memoryStore, now = () => new Date() } = {}) {
    this.memory = memoryStore || new MemoryStore();
    this.now = now;
  }

  run({ csvText, fileName = "dataset.csv", cleaningMode = "balanced", goal = "general" }) {
    const perception = this.perceive(csvText, fileName);
    const decision = this.decide(perception, cleaningMode, goal);
    const action = this.act(perception, decision);
    const latestMemoryEntry = this.remember(perception, decision, action);

    return {
      perception,
      decision,
      action,
      latestMemoryEntry,
      memory: this.memory.load()
    };
  }

  perceive(csvText, fileName) {
    const parsed = parseCSV(csvText);
    const columns = profileColumns(parsed.headers, parsed.rows);
    const duplicates = findDuplicateRows(parsed.rows);
    const rowIssueCount = columns.reduce((total, column) => total + column.missingCount + column.outlierCount, 0) + duplicates.length;
    const possibleSensitive = detectSensitiveColumns(parsed.headers);
    const qualityScore = scoreQuality({
      rows: parsed.rows.length,
      cells: parsed.headers.length * Math.max(parsed.rows.length, 1),
      missing: columns.reduce((total, column) => total + column.missingCount, 0),
      duplicates: duplicates.length,
      outliers: columns.reduce((total, column) => total + column.outlierCount, 0),
      sensitive: possibleSensitive.length
    });

    return {
      fileName,
      headers: parsed.headers,
      rows: parsed.rows,
      rowCount: parsed.rows.length,
      columnCount: parsed.headers.length,
      columns,
      duplicates,
      rowIssueCount,
      possibleSensitive,
      qualityScore,
      previousRuns: this.memory.load()
    };
  }

  decide(perception, cleaningMode = "balanced", goal = "general") {
    const normalizedMode = ["conservative", "balanced", "aggressive"].includes(cleaningMode)
      ? cleaningMode
      : "balanced";
    const cleaningPlan = buildCleaningPlan(perception, normalizedMode);
    const analysisPlan = buildAnalysisPlan(perception, goal);
    const riskLevel = scoreRisk(perception, cleaningPlan);

    return {
      cleaningMode: normalizedMode,
      cleaningPlan,
      analysisPlan,
      riskLevel,
      rationale: buildRationale(perception, normalizedMode, cleaningPlan, analysisPlan)
    };
  }

  act(perception, decision) {
    const cleaned = cleanRows(perception, decision.cleaningPlan);
    const cleanProfile = profileColumns(perception.headers, cleaned.rows);
    const charts = createCharts(perception.headers, cleaned.rows, decision.analysisPlan);
    const summary = summarizeFindings(perception, cleaned.rows, cleanProfile, charts, decision);
    const cleanedQualityScore = scoreQuality({
      rows: cleaned.rows.length,
      cells: perception.headers.length * Math.max(cleaned.rows.length, 1),
      missing: cleanProfile.reduce((total, column) => total + column.missingCount, 0),
      duplicates: findDuplicateRows(cleaned.rows).length,
      outliers: cleanProfile.reduce((total, column) => total + column.outlierCount, 0),
      sensitive: perception.possibleSensitive.length
    });

    return {
      cleanedRows: cleaned.rows,
      cleanedCSV: toCSV(perception.headers, cleaned.rows),
      appliedActions: cleaned.actions,
      cleanProfile,
      charts,
      summary,
      cleanedQualityScore,
      qualityLift: cleanedQualityScore - perception.qualityScore
    };
  }

  remember(perception, decision, action) {
    const entry = {
      id: `run-${Date.now()}`,
      createdAt: this.now().toISOString(),
      fileName: perception.fileName,
      rows: perception.rowCount,
      columns: perception.columnCount,
      mode: decision.cleaningMode,
      qualityBefore: perception.qualityScore,
      qualityAfter: action.cleanedQualityScore,
      mainFinding: action.summary[0] || "No finding generated"
    };
    this.memory.append(entry);
    return entry;
  }
}

function profileColumns(headers, rows) {
  return headers.map((header) => {
    const rawValues = rows.map((row) => row[header] ?? "");
    const missingCount = rawValues.filter(isMissing).length;
    const nonMissing = rawValues.filter((value) => !isMissing(value));
    const numericValues = nonMissing.map(toNumber).filter((value) => Number.isFinite(value));
    const dateValues = nonMissing.map(toDate).filter(Boolean);
    const uniqueValues = new Set(nonMissing.map((value) => normalizeCategory(value)));
    const type = inferType(nonMissing, numericValues, dateValues);
    const stats = type === "number" ? numericStats(numericValues) : null;
    const outliers = stats ? findOutliers(numericValues, stats) : [];
    const topValues = countTopValues(nonMissing);

    return {
      name: header,
      type,
      missingCount,
      missingRate: rows.length ? missingCount / rows.length : 0,
      uniqueCount: uniqueValues.size,
      topValues,
      stats,
      outlierCount: outliers.length,
      outlierValues: outliers.slice(0, 5)
    };
  });
}

function inferType(values, numericValues, dateValues) {
  if (!values.length) return "empty";
  if (numericValues.length / values.length >= 0.82) return "number";
  if (dateValues.length / values.length >= 0.82) return "date";
  return "category";
}

function buildCleaningPlan(perception, mode) {
  const plan = [];
  if (perception.duplicates.length) {
    plan.push({
      id: "remove-duplicates",
      type: "row",
      target: "duplicate rows",
      action: "remove",
      reason: `${perception.duplicates.length} duplicate row(s) detected.`,
      risk: "low"
    });
  }

  perception.columns.forEach((column) => {
    if (column.missingCount > 0) {
      const fill = fillStrategy(column, mode);
      plan.push({
        id: `fill-${slug(column.name)}`,
        type: "column",
        target: column.name,
        action: fill.action,
        value: fill.value,
        reason: `${column.missingCount} missing value(s) in ${column.name}.`,
        risk: fill.risk
      });
    }

    if (column.type === "category" && column.uniqueCount > 1) {
      plan.push({
        id: `standardize-${slug(column.name)}`,
        type: "column",
        target: column.name,
        action: "standardize categories",
        reason: `Normalize capitalization and spacing in ${column.name}.`,
        risk: "low"
      });
    }

    if (column.outlierCount > 0) {
      plan.push({
        id: `flag-${slug(column.name)}-outliers`,
        type: "column",
        target: column.name,
        action: mode === "aggressive" ? "cap outliers" : "flag outliers",
        reason: `${column.outlierCount} numeric outlier(s) detected in ${column.name}.`,
        risk: mode === "aggressive" ? "medium" : "low"
      });
    }
  });

  return plan;
}

function buildAnalysisPlan(perception, goal) {
  const numeric = perception.columns.filter((column) => column.type === "number");
  const category = perception.columns.filter((column) => column.type === "category");
  const dates = perception.columns.filter((column) => column.type === "date");
  const plan = [
    {
      id: "summary-statistics",
      action: "Create summary statistics for numeric columns.",
      chart: "scorecards"
    }
  ];

  if (category.length && numeric.length) {
    plan.push({
      id: "category-breakdown",
      action: `Compare ${numeric[0].name} by ${category[0].name}.`,
      chart: "bar"
    });
  }

  if (dates.length && numeric.length) {
    plan.push({
      id: "time-trend",
      action: `Plot ${numeric[0].name} over ${dates[0].name}.`,
      chart: "line"
    });
  }

  if (numeric.length >= 2) {
    plan.push({
      id: "relationship-check",
      action: `Check relationship between ${numeric[0].name} and ${numeric[1].name}.`,
      chart: "scatter"
    });
  }

  if (String(goal).toLowerCase().includes("survey")) {
    plan.push({
      id: "survey-quality",
      action: "Prioritize categorical distributions and missing response patterns.",
      chart: "distribution"
    });
  }

  return plan;
}

function cleanRows(perception, plan) {
  const actions = [];
  let rows = perception.rows.map((row) => ({ ...row }));

  if (plan.some((item) => item.action === "remove")) {
    const seen = new Set();
    const before = rows.length;
    rows = rows.filter((row) => {
      const key = JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    actions.push(`Removed ${before - rows.length} duplicate row(s).`);
  }

  const columns = profileColumns(perception.headers, rows);
  const byName = Object.fromEntries(columns.map((column) => [column.name, column]));

  plan.forEach((item) => {
    if (item.action === "fill median" || item.action === "fill mean") {
      rows.forEach((row) => {
        if (isMissing(row[item.target])) row[item.target] = String(item.value);
      });
      actions.push(`Filled missing ${item.target} values with ${item.value}.`);
    }

    if (item.action === "fill unknown") {
      rows.forEach((row) => {
        if (isMissing(row[item.target])) row[item.target] = "Unknown";
      });
      actions.push(`Filled missing ${item.target} values with Unknown.`);
    }

    if (item.action === "fill date placeholder") {
      rows.forEach((row) => {
        if (isMissing(row[item.target])) row[item.target] = "Unspecified date";
      });
      actions.push(`Filled missing ${item.target} values with Unspecified date.`);
    }

    if (item.action === "standardize categories") {
      rows.forEach((row) => {
        if (!isMissing(row[item.target])) row[item.target] = titleCase(row[item.target]);
      });
      actions.push(`Standardized category labels in ${item.target}.`);
    }

    if (item.action === "flag outliers") {
      const column = byName[item.target];
      const outliers = new Set((column?.outlierValues || []).map(String));
      const flagColumn = `${item.target} Outlier Flag`;
      rows.forEach((row) => {
        row[flagColumn] = outliers.has(String(toNumber(row[item.target]))) ? "Review" : "OK";
      });
      if (!perception.headers.includes(flagColumn)) perception.headers.push(flagColumn);
      actions.push(`Flagged outliers in ${item.target} for review.`);
    }

    if (item.action === "cap outliers") {
      const column = byName[item.target];
      if (column?.stats) {
        rows.forEach((row) => {
          const number = toNumber(row[item.target]);
          if (Number.isFinite(number)) {
            row[item.target] = String(Math.min(number, column.stats.upperFence));
          }
        });
        actions.push(`Capped extreme ${item.target} values at ${round(column.stats.upperFence)}.`);
      }
    }
  });

  return { rows, actions };
}

function createCharts(headers, rows, analysisPlan) {
  const profile = profileColumns(headers, rows);
  const numeric = profile.filter((column) => column.type === "number");
  const category = profile.filter((column) => column.type === "category");
  const dates = profile.filter((column) => column.type === "date");
  const charts = [];

  if (category.length && numeric.length && analysisPlan.some((item) => item.chart === "bar")) {
    charts.push(createBarChart(rows, category[0].name, numeric[0].name));
  }

  if (dates.length && numeric.length && analysisPlan.some((item) => item.chart === "line")) {
    charts.push(createLineChart(rows, dates[0].name, numeric[0].name));
  }

  if (numeric.length >= 2 && analysisPlan.some((item) => item.chart === "scatter")) {
    charts.push(createScatterChart(rows, numeric[0].name, numeric[1].name));
  }

  return charts.filter(Boolean);
}

function createBarChart(rows, categoryColumn, valueColumn) {
  const totals = new Map();
  rows.forEach((row) => {
    const key = row[categoryColumn] || "Unknown";
    totals.set(key, (totals.get(key) || 0) + (toNumber(row[valueColumn]) || 0));
  });
  return {
    id: "category-bar",
    type: "bar",
    title: `${valueColumn} by ${categoryColumn}`,
    xLabel: categoryColumn,
    yLabel: valueColumn,
    data: [...totals.entries()]
      .map(([label, value]) => ({ label, value: round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  };
}

function createLineChart(rows, dateColumn, valueColumn) {
  const totals = new Map();
  rows.forEach((row) => {
    const date = toDate(row[dateColumn]);
    if (!date) return;
    const key = date.toISOString().slice(0, 7);
    totals.set(key, (totals.get(key) || 0) + (toNumber(row[valueColumn]) || 0));
  });
  return {
    id: "time-line",
    type: "line",
    title: `${valueColumn} trend by month`,
    xLabel: dateColumn,
    yLabel: valueColumn,
    data: [...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, value]) => ({ label, value: round(value) }))
  };
}

function createScatterChart(rows, xColumn, yColumn) {
  return {
    id: "numeric-scatter",
    type: "scatter",
    title: `${xColumn} vs ${yColumn}`,
    xLabel: xColumn,
    yLabel: yColumn,
    data: rows
      .map((row) => ({ x: toNumber(row[xColumn]), y: toNumber(row[yColumn]) }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      .slice(0, 80)
  };
}

function summarizeFindings(perception, rows, cleanProfile, charts, decision) {
  const findings = [];
  findings.push(`Data quality improved from ${perception.qualityScore}/100 to ${scoreQuality({
    rows: rows.length,
    cells: perception.headers.length * Math.max(rows.length, 1),
    missing: cleanProfile.reduce((total, column) => total + column.missingCount, 0),
    duplicates: findDuplicateRows(rows).length,
    outliers: cleanProfile.reduce((total, column) => total + column.outlierCount, 0),
    sensitive: perception.possibleSensitive.length
  })}/100 after cleaning.`);

  const bar = charts.find((chart) => chart.type === "bar");
  if (bar?.data?.length) {
    findings.push(`${bar.data[0].label} has the highest ${bar.yLabel} total in the category breakdown.`);
  }

  const line = charts.find((chart) => chart.type === "line");
  if (line?.data?.length >= 2) {
    const first = line.data[0];
    const last = line.data[line.data.length - 1];
    const direction = last.value >= first.value ? "increased" : "decreased";
    findings.push(`${line.yLabel} ${direction} from ${first.label} to ${last.label}.`);
  }

  if (decision.riskLevel !== "low") {
    findings.push(`Cleaning risk is ${decision.riskLevel}; review flagged outliers before using this data for decisions.`);
  }

  if (perception.possibleSensitive.length) {
    findings.push(`Possible sensitive columns detected: ${perception.possibleSensitive.join(", ")}. Keep processing local.`);
  }

  return findings;
}

function fillStrategy(column, mode) {
  if (column.type === "number") {
    const stats = column.stats || { median: 0, mean: 0 };
    return {
      action: mode === "aggressive" ? "fill mean" : "fill median",
      value: round(mode === "aggressive" ? stats.mean : stats.median),
      risk: "medium"
    };
  }

  if (column.type === "date") {
    return { action: "fill date placeholder", value: "Unspecified date", risk: "medium" };
  }

  return { action: "fill unknown", value: "Unknown", risk: "low" };
}

function scoreQuality({ cells, missing, duplicates, outliers, sensitive }) {
  if (!cells) return 0;
  const missingPenalty = (missing / cells) * 42;
  const duplicatePenalty = duplicates * 3;
  const outlierPenalty = outliers * 2;
  const sensitivePenalty = sensitive ? 4 : 0;
  return clamp(Math.round(100 - missingPenalty - duplicatePenalty - outlierPenalty - sensitivePenalty), 0, 100);
}

function scoreRisk(perception, plan) {
  const highImpactActions = plan.filter((item) => item.risk === "medium").length;
  if (perception.possibleSensitive.length) return "high";
  if (highImpactActions >= 3) return "medium";
  if (plan.some((item) => item.action === "cap outliers")) return "medium";
  return "low";
}

function buildRationale(perception, mode, cleaningPlan, analysisPlan) {
  return [
    `Mode ${mode} selected ${cleaningPlan.length} cleaning action(s) for ${perception.rowCount} row(s).`,
    `The agent prioritized missing values, duplicates, category consistency, and outlier handling.`,
    `${analysisPlan.length} analysis step(s) were selected from detected numeric, categorical, and date columns.`
  ];
}

function findDuplicateRows(rows) {
  const seen = new Map();
  const duplicates = [];
  rows.forEach((row, index) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) duplicates.push(index);
    seen.set(key, index);
  });
  return duplicates;
}

function detectSensitiveColumns(headers) {
  const patterns = ["name", "email", "phone", "address", "passport", "credit", "ssn", "medical"];
  return headers.filter((header) => patterns.some((pattern) => header.toLowerCase().includes(pattern)));
}

function numericStats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;
  const upperFence = q3 + 1.5 * iqr;
  const lowerFence = q1 - 1.5 * iqr;
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    mean: round(sum / sorted.length),
    median: round(percentile(sorted, 0.5)),
    q1: round(q1),
    q3: round(q3),
    lowerFence: round(lowerFence),
    upperFence: round(upperFence)
  };
}

function findOutliers(values, stats) {
  return values.filter((value) => value < stats.lowerFence || value > stats.upperFence);
}

function percentile(sorted, p) {
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function countTopValues(values) {
  const counts = new Map();
  values.forEach((value) => {
    const normalized = normalizeCategory(value);
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));
}

function titleCase(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function normalizeCategory(value) {
  return String(value).trim().toLowerCase();
}

function isMissing(value) {
  return MISSING.has(String(value ?? "").trim().toLowerCase());
}

function toNumber(value) {
  const number = Number(String(value ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(number) ? number : NaN;
}

function toDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export const internals = {
  profileColumns,
  buildCleaningPlan,
  buildAnalysisPlan,
  cleanRows,
  scoreQuality,
  findDuplicateRows,
  detectSensitiveColumns
};
