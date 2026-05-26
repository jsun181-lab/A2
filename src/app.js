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
  demoBanner: document.querySelector("#demo-banner"),
  chartDialog: document.querySelector("#chart-dialog"),
  chartDialogTitle: document.querySelector("#chart-dialog-title"),
  chartDialogMeta: document.querySelector("#chart-dialog-meta"),
  chartDialogCanvas: document.querySelector("#chart-dialog-canvas"),
  closeChart: document.querySelector("#close-chart")
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
elements.output.addEventListener("click", (event) => {
  const opener = event.target.closest("[data-chart-open]");
  if (!opener) return;
  openChart(Number(opener.dataset.chartOpen));
});
elements.closeChart.addEventListener("click", () => elements.chartDialog.close());
elements.chartDialog.addEventListener("click", (event) => {
  if (event.target === elements.chartDialog) elements.chartDialog.close();
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
  requestAnimationFrame(() => {
    drawCharts();
    scrollToHashTarget();
  });
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

    <section id="charts-panel" class="panel">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Analysis</p>
          <h3>Generated charts</h3>
        </div>
        <span class="quality-lift">${action.charts.length} charts</span>
      </div>
      <div class="charts-grid">
        ${action.charts.map((chart, index) => `
          <figure class="chart-card ${index === 0 ? "is-wide" : ""}">
            <div class="chart-toolbar">
              <span class="chart-type">${escapeHtml(chartTypeLabel(chart.type))}</span>
              <button type="button" data-chart-open="${index}">Expand</button>
            </div>
            <button class="chart-canvas-button" type="button" data-chart-open="${index}" aria-label="Expand ${escapeHtml(chart.title)}">
              <canvas width="760" height="460" data-chart-index="${index}"></canvas>
            </button>
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
    drawChart(canvas, chart);
  });
}

function scrollToHashTarget() {
  if (window.location.hash !== "#charts-panel") return;
  document.querySelector("#charts-panel")?.scrollIntoView({ block: "start" });
}

function openChart(index) {
  const chart = state.result?.action.charts[index];
  if (!chart) return;
  elements.chartDialogTitle.textContent = chart.title;
  elements.chartDialogMeta.textContent = `${chartTypeLabel(chart.type)} - ${chart.data.length} data point(s)`;
  if (typeof elements.chartDialog.showModal === "function") {
    elements.chartDialog.showModal();
  } else {
    elements.chartDialog.setAttribute("open", "");
  }
  requestAnimationFrame(() => drawChart(elements.chartDialogCanvas, chart));
}

function drawChart(canvas, chart) {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (chart.type === "bar") drawBarChart(context, canvas, chart);
  if (chart.type === "histogram") drawHistogramChart(context, canvas, chart);
  if (chart.type === "line") drawLineChart(context, canvas, chart);
  if (chart.type === "scatter") drawScatterChart(context, canvas, chart);
  if (chart.type === "donut") drawDonutChart(context, canvas, chart);
}

const CHART_COLORS = ["#14766d", "#31519c", "#a35f00", "#aa3948", "#586978", "#58a6a0"];

function drawBarChart(context, canvas, chart) {
  drawColumnChart(context, canvas, chart, "#14766d");
}

function drawHistogramChart(context, canvas, chart) {
  drawColumnChart(context, canvas, chart, "#31519c");
}

function drawColumnChart(context, canvas, chart, fill) {
  if (!chart.data.length) return drawNoData(context, canvas);
  const padding = chartPadding(canvas);
  const values = chart.data.map((point) => point.value);
  const max = Math.max(...values, 1);
  const plotWidth = canvas.width - padding.left - padding.right;
  const plotHeight = canvas.height - padding.top - padding.bottom;
  const slotWidth = plotWidth / chart.data.length;
  const barGap = Math.max(10, slotWidth * 0.18);
  drawAxes(context, canvas, padding, max);
  chart.data.forEach((point, index) => {
    const height = (plotHeight * point.value) / max;
    const x = padding.left + index * slotWidth + barGap / 2;
    const y = canvas.height - padding.bottom - height;
    const barWidth = Math.max(slotWidth - barGap, 14);
    context.fillStyle = fill;
    context.fillRect(x, y, barWidth, height);
    context.fillStyle = "#15202b";
    context.font = chartFont(canvas, 13, 800);
    context.textAlign = "center";
    context.fillText(formatNumber(point.value), x + barWidth / 2, Math.max(y - 8, padding.top + 16));
    context.fillStyle = "#526271";
    context.font = chartFont(canvas, 12, 700);
    fitText(context, point.label, x + barWidth / 2, canvas.height - Math.max(20, padding.bottom * 0.38), Math.max(barWidth + 8, 52));
  });
  drawAxisLabels(context, canvas, chart, padding);
}

function drawLineChart(context, canvas, chart) {
  if (!chart.data.length) return drawNoData(context, canvas);
  const padding = chartPadding(canvas);
  const values = chart.data.map((point) => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const plotWidth = canvas.width - padding.left - padding.right;
  const plotHeight = canvas.height - padding.top - padding.bottom;
  drawAxes(context, canvas, padding, max);

  const points = chart.data.map((point, index) => ({
    label: point.label,
    value: point.value,
    x: padding.left + (index / Math.max(chart.data.length - 1, 1)) * plotWidth,
    y: canvas.height - padding.bottom - ((point.value - min) / Math.max(max - min, 1)) * plotHeight
  }));

  context.fillStyle = "rgba(49, 81, 156, 0.1)";
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, canvas.height - padding.bottom);
    context.lineTo(point.x, point.y);
  });
  context.lineTo(points[points.length - 1].x, canvas.height - padding.bottom);
  context.closePath();
  context.fill();

  context.strokeStyle = "#344c9a";
  context.lineWidth = Math.max(3, canvas.width / 240);
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.stroke();

  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  points.forEach((point, index) => {
    context.fillStyle = "#344c9a";
    context.beginPath();
    context.arc(point.x, point.y, Math.max(4, canvas.width / 170), 0, Math.PI * 2);
    context.fill();
    if (index % labelEvery === 0 || index === points.length - 1) {
      context.fillStyle = "#526271";
      context.font = chartFont(canvas, 12, 700);
      context.textAlign = "center";
      context.fillText(point.label, point.x, canvas.height - Math.max(20, padding.bottom * 0.38));
    }
  });
  drawAxisLabels(context, canvas, chart, padding);
}

function drawScatterChart(context, canvas, chart) {
  if (!chart.data.length) return drawNoData(context, canvas);
  const padding = chartPadding(canvas);
  const xs = chart.data.map((point) => point.x);
  const ys = chart.data.map((point) => point.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  drawAxes(context, canvas, padding, maxY);
  chart.data.forEach((point) => {
    const x = padding.left + ((point.x - minX) / Math.max(maxX - minX, 1)) * (canvas.width - padding.left - padding.right);
    const y = canvas.height - padding.bottom - ((point.y - minY) / Math.max(maxY - minY, 1)) * (canvas.height - padding.top - padding.bottom);
    context.fillStyle = "rgba(20, 118, 109, 0.72)";
    context.beginPath();
    context.arc(x, y, Math.max(4, canvas.width / 180), 0, Math.PI * 2);
    context.fill();
  });
  drawAxisLabels(context, canvas, chart, padding);
}

function drawDonutChart(context, canvas, chart) {
  if (!chart.data.length) return drawNoData(context, canvas);
  const total = chart.data.reduce((sum, point) => sum + point.value, 0);
  const centerX = canvas.width * 0.34;
  const centerY = canvas.height * 0.5;
  const radius = Math.min(canvas.width * 0.22, canvas.height * 0.32);
  const innerRadius = radius * 0.58;
  let angle = -Math.PI / 2;

  chart.data.forEach((point, index) => {
    const slice = total ? (point.value / total) * Math.PI * 2 : 0;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.arc(centerX, centerY, radius, angle, angle + slice);
    context.closePath();
    context.fillStyle = CHART_COLORS[index % CHART_COLORS.length];
    context.fill();
    angle += slice;
  });

  context.beginPath();
  context.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  context.fillStyle = "#15202b";
  context.font = chartFont(canvas, 26, 900);
  context.textAlign = "center";
  context.fillText(String(total), centerX, centerY - 4);
  context.fillStyle = "#617084";
  context.font = chartFont(canvas, 12, 800);
  context.fillText("rows", centerX, centerY + 24);

  const legendX = canvas.width * 0.61;
  let legendY = canvas.height * 0.24;
  chart.data.forEach((point, index) => {
    const percent = total ? Math.round((point.value / total) * 100) : 0;
    context.fillStyle = CHART_COLORS[index % CHART_COLORS.length];
    context.fillRect(legendX, legendY - 12, 16, 16);
    context.fillStyle = "#15202b";
    context.font = chartFont(canvas, 13, 800);
    context.textAlign = "left";
    fitText(context, `${point.label} (${percent}%)`, legendX + 26, legendY, canvas.width - legendX - 42, "left");
    legendY += Math.max(30, canvas.height * 0.07);
  });
}

function drawAxes(context, canvas, padding, maxValue = 1) {
  const tickCount = 4;
  context.strokeStyle = "#edf1f4";
  context.lineWidth = 1;
  context.font = chartFont(canvas, 11, 700);
  context.fillStyle = "#8b99aa";
  context.textAlign = "right";

  for (let tick = 0; tick <= tickCount; tick += 1) {
    const ratio = tick / tickCount;
    const y = canvas.height - padding.bottom - ratio * (canvas.height - padding.top - padding.bottom);
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(canvas.width - padding.right, y);
    context.stroke();
    context.fillText(formatNumber(maxValue * ratio), padding.left - 10, y + 4);
  }

  context.strokeStyle = "#dbe2e8";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(padding.left, padding.top);
  context.lineTo(padding.left, canvas.height - padding.bottom);
  context.lineTo(canvas.width - padding.right, canvas.height - padding.bottom);
  context.stroke();
}

function drawAxisLabels(context, canvas, chart, padding) {
  context.fillStyle = "#617084";
  context.font = chartFont(canvas, 12, 800);
  context.textAlign = "center";
  context.fillText(chart.xLabel || "", padding.left + (canvas.width - padding.left - padding.right) / 2, canvas.height - 8);
  context.save();
  context.translate(18, padding.top + (canvas.height - padding.top - padding.bottom) / 2);
  context.rotate(-Math.PI / 2);
  context.fillText(chart.yLabel || "", 0, 0);
  context.restore();
}

function drawNoData(context, canvas) {
  context.fillStyle = "#617084";
  context.font = chartFont(canvas, 16, 800);
  context.textAlign = "center";
  context.fillText("No chart data available", canvas.width / 2, canvas.height / 2);
}

function chartPadding(canvas) {
  return {
    left: Math.max(66, Math.round(canvas.width * 0.1)),
    right: Math.max(28, Math.round(canvas.width * 0.04)),
    top: Math.max(34, Math.round(canvas.height * 0.09)),
    bottom: Math.max(72, Math.round(canvas.height * 0.16))
  };
}

function chartFont(canvas, size, weight = 700) {
  const scaled = Math.max(size, Math.round(canvas.width / 60));
  return `${weight} ${scaled}px sans-serif`;
}

function fitText(context, text, x, y, maxWidth, align = "center") {
  let output = String(text);
  context.textAlign = align;
  while (context.measureText(output).width > maxWidth && output.length > 4) {
    output = `${output.slice(0, -4)}...`;
  }
  context.fillText(output, x, y);
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (Math.abs(number) >= 1000) return number.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return number.toLocaleString("en-US", { maximumFractionDigits: 1 });
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

function chartTypeLabel(type) {
  const labels = {
    bar: "Bar chart",
    donut: "Donut chart",
    histogram: "Histogram",
    line: "Line chart",
    scatter: "Scatter plot"
  };
  return labels[type] || titleCase(type);
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
