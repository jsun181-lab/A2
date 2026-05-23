import { DataInsightAgent, MemoryStore } from "./agent.js";

const storage = new MemoryStore(window.localStorage);
const agent = new DataInsightAgent({ memoryStore: storage });
const demoMode = new URLSearchParams(window.location.search).get("demo");

const state = {
  result: null,
  fileName: "pasted.csv",
  demoMode
};

const elements = {
  file: document.querySelector("#csv-file"),
  mode: document.querySelector("#cleaning-mode"),
  goal: document.querySelector("#analysis-goal"),
  text: document.querySelector("#csv-text"),
  loadSample: document.querySelector("#load-sample"),
  run: document.querySelector("#run-agent"),
  download: document.querySelector("#download-csv"),
  clearMemory: document.querySelector("#clear-memory"),
  output: document.querySelector("#output"),
  memory: document.querySelector("#memory-log"),
  demoBanner: document.querySelector("#demo-banner")
};

elements.file.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  state.fileName = file.name;
  elements.text.value = await file.text();
});

elements.loadSample.addEventListener("click", () => loadSampleAndRun(false));
elements.run.addEventListener("click", runAgent);
elements.download.addEventListener("click", downloadCleanedCSV);
elements.clearMemory.addEventListener("click", () => {
  storage.clear();
  renderMemory();
});

async function loadSampleAndRun(autoRun = true) {
  const response = await fetch("data/sample_sales_dirty.csv");
  elements.text.value = await response.text();
  state.fileName = "sample_sales_dirty.csv";
  elements.mode.value = demoMode === "aggressive" ? "aggressive" : "balanced";
  elements.goal.value = "sales";
  if (autoRun) runAgent();
}

function runAgent() {
  const csvText = elements.text.value.trim();
  if (!csvText) {
    elements.text.focus();
    return;
  }

  state.result = agent.run({
    csvText,
    fileName: state.fileName,
    cleaningMode: elements.mode.value,
    goal: elements.goal.value
  });
  elements.download.disabled = false;
  render();
}

function render() {
  renderDemoBanner();
  renderOutput();
  renderMemory();
  requestAnimationFrame(drawCharts);
}

function renderDemoBanner() {
  if (!state.demoMode) {
    elements.demoBanner.className = "demo-banner is-hidden";
    elements.demoBanner.textContent = "";
    return;
  }

  elements.demoBanner.className = "demo-banner is-visible";
  elements.demoBanner.textContent = state.demoMode === "aggressive"
    ? "Demo view: aggressive cleaning mode"
    : "Demo view: balanced CSV cleaning and analysis";
}

function renderOutput() {
  if (!state.result) {
    elements.output.innerHTML = `
      <section class="empty-state">
        <img src="assets/system-design.svg" alt="DataInsight agent architecture">
      </section>
    `;
    return;
  }

  const { perception, decision, action } = state.result;
  elements.output.innerHTML = `
    <section class="metrics" aria-label="Data quality metrics">
      ${metric("Rows", perception.rowCount)}
      ${metric("Columns", perception.columnCount)}
      ${metric("Before quality", `${perception.qualityScore}/100`)}
      ${metric("After quality", `${action.cleanedQualityScore}/100`)}
    </section>

    <section class="result-band">
      <div>
        <p class="eyebrow">Agent decision</p>
        <h2>${titleCase(decision.cleaningMode)} cleaning + ${decision.analysisPlan.length} analysis steps</h2>
        <p>${escapeHtml(decision.rationale.join(" "))}</p>
      </div>
      <div class="mode-pill">${escapeHtml(decision.riskLevel)} risk</div>
    </section>

    <section class="panel-grid">
      <article class="panel">
        <div class="panel-heading">
          <p class="eyebrow">Perception</p>
          <h3>Data profile</h3>
        </div>
        ${profileTable(perception.columns)}
      </article>

      <article class="panel">
        <div class="panel-heading">
          <p class="eyebrow">Decision</p>
          <h3>Cleaning strategy</h3>
        </div>
        <ol class="decision-list">
          ${decision.cleaningPlan.map((item) => `
            <li>
              <strong>${escapeHtml(item.action)}</strong>
              <span>${escapeHtml(item.target)} - ${escapeHtml(item.reason)}</span>
            </li>
          `).join("")}
        </ol>
      </article>
    </section>

    <section class="panel">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Action</p>
          <h3>Cleaning actions applied</h3>
        </div>
        <span class="quality-lift">Quality lift: ${action.qualityLift >= 0 ? "+" : ""}${action.qualityLift}</span>
      </div>
      <ul class="action-list">
        ${action.appliedActions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>

    <section class="panel">
      <div class="panel-heading">
        <p class="eyebrow">Analysis</p>
        <h3>Generated charts</h3>
      </div>
      <div class="charts-grid">
        ${action.charts.map((chart, index) => `
          <figure class="chart-card">
            <canvas width="480" height="270" data-chart-index="${index}"></canvas>
            <figcaption>${escapeHtml(chart.title)}</figcaption>
          </figure>
        `).join("")}
      </div>
    </section>

    <section class="panel-grid">
      <article class="panel">
        <div class="panel-heading">
          <p class="eyebrow">Summary</p>
          <h3>Findings</h3>
        </div>
        <ul class="summary-list">
          ${action.summary.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </article>

      <article class="panel">
        <div class="panel-heading">
          <p class="eyebrow">Preview</p>
          <h3>Cleaned data sample</h3>
        </div>
        ${previewTable(perception.headers, action.cleanedRows)}
      </article>
    </section>
  `;
}

function renderMemory() {
  const entries = storage.load().slice().reverse();
  if (!entries.length) {
    elements.memory.innerHTML = `<p class="muted">Memory is empty. Run the agent to store a checkpoint.</p>`;
    return;
  }

  elements.memory.innerHTML = entries.map((entry) => `
    <article class="memory-item">
      <strong>${escapeHtml(entry.fileName)}</strong>
      <span>${escapeHtml(entry.mode)} mode - ${escapeHtml(entry.qualityBefore)} to ${escapeHtml(entry.qualityAfter)}</span>
      <p>${escapeHtml(entry.mainFinding)}</p>
    </article>
  `).join("");
}

function profileTable(columns) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Column</th>
            <th>Type</th>
            <th>Missing</th>
            <th>Outliers</th>
          </tr>
        </thead>
        <tbody>
          ${columns.map((column) => `
            <tr>
              <td>${escapeHtml(column.name)}</td>
              <td>${escapeHtml(column.type)}</td>
              <td>${column.missingCount}</td>
              <td>${column.outlierCount}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function previewTable(headers, rows) {
  const displayHeaders = headers.slice(0, 6);
  const displayRows = rows.slice(0, 6);
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${displayHeaders.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${displayRows.map((row) => `
            <tr>${displayHeaders.map((header) => `<td>${escapeHtml(row[header] ?? "")}</td>`).join("")}</tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function drawCharts() {
  if (!state.result) return;
  document.querySelectorAll("canvas[data-chart-index]").forEach((canvas) => {
    const chart = state.result.action.charts[Number(canvas.dataset.chartIndex)];
    if (!chart) return;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (chart.type === "bar") drawBarChart(context, canvas, chart);
    if (chart.type === "line") drawLineChart(context, canvas, chart);
    if (chart.type === "scatter") drawScatterChart(context, canvas, chart);
  });
}

function drawBarChart(context, canvas, chart) {
  const padding = { left: 58, right: 24, top: 28, bottom: 56 };
  const values = chart.data.map((point) => point.value);
  const max = Math.max(...values, 1);
  const width = (canvas.width - padding.left - padding.right) / chart.data.length;
  drawAxes(context, canvas, padding);
  chart.data.forEach((point, index) => {
    const height = ((canvas.height - padding.top - padding.bottom) * point.value) / max;
    const x = padding.left + index * width + 8;
    const y = canvas.height - padding.bottom - height;
    context.fillStyle = "#14766d";
    context.fillRect(x, y, Math.max(width - 16, 12), height);
    context.fillStyle = "#526271";
    context.font = "12px sans-serif";
    context.fillText(point.label.slice(0, 10), x, canvas.height - 32);
  });
}

function drawLineChart(context, canvas, chart) {
  const padding = { left: 58, right: 24, top: 28, bottom: 56 };
  const values = chart.data.map((point) => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  drawAxes(context, canvas, padding);
  context.strokeStyle = "#344c9a";
  context.lineWidth = 3;
  context.beginPath();
  chart.data.forEach((point, index) => {
    const x = padding.left + (index / Math.max(chart.data.length - 1, 1)) * (canvas.width - padding.left - padding.right);
    const y = canvas.height - padding.bottom - ((point.value - min) / Math.max(max - min, 1)) * (canvas.height - padding.top - padding.bottom);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
    context.fillStyle = "#344c9a";
    context.fillRect(x - 3, y - 3, 6, 6);
    context.fillStyle = "#526271";
    context.font = "12px sans-serif";
    context.fillText(point.label, x - 20, canvas.height - 32);
  });
  context.stroke();
}

function drawScatterChart(context, canvas, chart) {
  const padding = { left: 58, right: 24, top: 28, bottom: 56 };
  const xs = chart.data.map((point) => point.x);
  const ys = chart.data.map((point) => point.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  drawAxes(context, canvas, padding);
  chart.data.forEach((point) => {
    const x = padding.left + ((point.x - minX) / Math.max(maxX - minX, 1)) * (canvas.width - padding.left - padding.right);
    const y = canvas.height - padding.bottom - ((point.y - minY) / Math.max(maxY - minY, 1)) * (canvas.height - padding.top - padding.bottom);
    context.fillStyle = "rgba(20, 118, 109, 0.72)";
    context.beginPath();
    context.arc(x, y, 4, 0, Math.PI * 2);
    context.fill();
  });
}

function drawAxes(context, canvas, padding) {
  context.strokeStyle = "#dbe2e8";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(padding.left, padding.top);
  context.lineTo(padding.left, canvas.height - padding.bottom);
  context.lineTo(canvas.width - padding.right, canvas.height - padding.bottom);
  context.stroke();
}

function downloadCleanedCSV() {
  if (!state.result) return;
  const blob = new Blob([state.result.action.cleanedCSV], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "cleaned-dataset.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function metric(label, value) {
  return `
    <article class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function titleCase(value) {
  return String(value).replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

render();
if (demoMode === "balanced" || demoMode === "aggressive") {
  loadSampleAndRun(true);
}
