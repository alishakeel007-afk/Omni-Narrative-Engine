// Repeatable offline evidence: no cloud database changes, GPU jobs or paid renders.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { SUITES } = require("./test-studio.cjs");
const { cases: caseInventory } = require("../tests/project-cases.cjs");
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".run-screenshots", "test-report");
const startedAt = new Date();
fs.mkdirSync(path.join(output, "logs"), { recursive: true });
const relative = filename => path.relative(root, filename).replaceAll("\\", "/");
const python = process.env.STUDIO_TEST_PYTHON || path.join(root, ".venv-modal", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const casesPath = path.join(output, "cases.json"), workerPath = path.join(output, "worker-cases.json");
// A failed process must not inherit evidence from a previous successful run.
for (const file of [casesPath, workerPath]) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
const jobs = [
  { id: "numbered-cases", group: "Numbered unit / API integration / business cases", bin: process.execPath, args: ["tests/project-cases.cjs", "--json", relative(casesPath)] },
  ...SUITES.map(file => ({ id: path.basename(file, ".cjs"), group: "Regression suite (isolated services)", bin: process.execPath, args: [file] })),
  ...["character-details", "reference", "dialogue", "controls"].map(name => ({ id: `browser-${name}`, group: "Browser integration (React + fixture APIs)", bin: process.execPath, args: [`tests/studio-${name}-browser.cjs`], timeout: 240000 })),
  { id: "worker-contracts", group: "Python worker contracts (CPU / mock inference)", bin: python, args: ["scripts/test-worker-report.py", relative(workerPath)], timeout: 120000 },
  { id: "typescript", group: "Static verification", bin: process.execPath, args: ["node_modules/typescript/bin/tsc", "--noEmit", "--incremental", "false"], timeout: 120000 },
  { id: "worker-build", group: "Build verification (worker bundle)", bin: process.execPath, args: ["scripts/studio-worker.cjs", "--build"], timeout: 120000 },
];
const runs = [];
for (const job of jobs) {
  console.log(`RUN ${job.id}`);
  const begin = performance.now();
  const result = spawnSync(job.bin, job.args, { cwd: root, encoding: "utf8", timeout: job.timeout || 90000,
    maxBuffer: 8 * 1024 * 1024, windowsHide: true, env: { ...process.env, PYTHONUTF8: "1" } });
  const status = result.status === 0 && !result.error ? "passed" : "failed";
  const log = `logs/${job.id}.txt`;
  fs.writeFileSync(path.join(output, log), [result.stdout || "", result.stderr || "", result.error?.stack || ""].filter(Boolean).join("\n"));
  const durationMs = Math.round(performance.now() - begin);
  runs.push({ id: job.id, group: job.group, command: [job.bin === process.execPath ? "node" : relative(job.bin), ...job.args].join(" "), status, durationMs, exitCode: result.status, signal: result.signal, log });
  console.log(`${status.toUpperCase()} ${job.id} (${(durationMs / 1000).toFixed(1)}s)`);
  if (status === "failed") console.error((result.stderr || result.stdout || result.error?.message || "No process output").slice(-5000));
}
function readJson(filename) {
  try { return JSON.parse(fs.readFileSync(filename, "utf8")); }
  catch { return []; }
}
const cases = readJson(casesPath), workerCases = readJson(workerPath);
const screenshots = [];
fs.mkdirSync(path.join(output, "screenshots"), { recursive: true });
for (const file of fs.readdirSync(path.join(root, ".run-screenshots"))) {
  const source = path.join(root, ".run-screenshots", file);
  if (!/\.(png|jpg)$/i.test(file) || !fs.statSync(source).isFile() || fs.statSync(source).mtimeMs < startedAt.getTime()) continue;
  fs.copyFileSync(source, path.join(output, "screenshots", file)); screenshots.push(`screenshots/${file}`);
}
const git = args => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : "unavailable";
};
const report = {
  startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), nodeVersion: process.version,
  platform: `${process.platform} ${process.arch}`, revision: git(["rev-parse", "HEAD"]),
  workingTree: git(["status", "--porcelain"]) ? "contains uncommitted changes (including this test implementation)" : "clean",
  scope: "Current completed features, tested locally against real application modules and fixture services. No paid generation requests.",
  limitations: [
    "API integration uses fixture authentication and in-memory persistence; live Supabase/Prisma storage and login are not verified by this run.",
    "Browser suites use actual React components with fixture APIs; they are not an end-to-end deployment test.",
    "Worker contracts run on CPU with mocked inference. Passing duration and payload tests does not validate GPU output quality, Urdu speech or lip-sync.",
    "No live provider charges, GPU renders, production database writes or real external artifact deletion occur.",
    "The checks below include a worker bundle and TypeScript verification, not a production Next.js build or load test.",
    "This report counts executed cases and suites, not code coverage or an implementation-completion percentage.",
  ],
  runs, cases, workerCases, screenshots,
};
fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(report, null, 2) + "\n");
function csv(value) {
  let text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  if (/^[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
const columns = ["id", "category", "title", "input", "expected", "actual", "status", "durationMs", "error"];
fs.writeFileSync(path.join(output, "cases.csv"), "\uFEFF" + [columns.map(csv).join(","), ...cases.map(item => columns.map(key => csv(item[key])).join(","))].join("\r\n"));
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const passed = items => items.filter(item => item.status === "passed").length;
const badge = status => `<span class="badge ${escape(status)}">${escape(status)}</span>`;
const rows = cases.map(item => `<tr data-category="${escape(item.category)}"><td><strong>${escape(item.id)}</strong><br>${escape(item.category)}</td><td>${escape(item.title)}<details><summary>Input and observed result</summary><p><b>Input:</b> ${escape(item.input)}</p><pre>${escape(JSON.stringify(item.actual, null, 2) ?? item.error)}</pre></details></td><td>${escape(item.expected)}</td><td>${badge(item.status)}<br>${item.durationMs} ms</td></tr>`).join("");
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Omni Narrative Engine — Test Results</title>
<style>body{font:16px/1.55 system-ui,sans-serif;color:#18231b;background:#f7f9f6;margin:0}main{max-width:1200px;margin:auto;padding:32px}h1{font-size:30px}h2{margin-top:32px}.cards{display:flex;gap:16px;flex-wrap:wrap}.card{background:white;border:1px solid #cdd8cc;border-radius:12px;padding:16px;flex:1;min-width:180px}.card strong{display:block;font-size:28px}table{border-collapse:collapse;width:100%;background:white}th,td{padding:12px;text-align:left;border:1px solid #d9e1d8;vertical-align:top}th{background:#eaf1e7}.scroll{overflow-x:auto}.badge{display:inline-block;padding:2px 8px;border-radius:6px;font-weight:600}.passed{background:#d4efcb;color:#18451c}.failed{background:#ffe0dd;color:#832117}.skipped,.expected-failure{background:#fff1bd;color:#694900}a{color:#205425}pre{max-width:520px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}summary{cursor:pointer}li{margin:8px 0}select,button{font:inherit;padding:8px}figure{display:inline-block;width:300px;max-width:100%;vertical-align:top;margin:12px}img{max-width:100%;max-height:300px;object-fit:contain}figcaption{overflow-wrap:anywhere;font-size:13px}small{overflow-wrap:anywhere}@media print{button,select{display:none}main{padding:0}.scroll{overflow:visible}table{font-size:11px}tr{break-inside:avoid}details{display:block}figure{break-inside:avoid}}</style>
<main><h1>Omni Narrative Engine — Test Results</h1><p>${escape(report.scope)}</p><p><small>Executed ${escape(report.startedAt)} · ${escape(report.platform)} · Node ${escape(report.nodeVersion)}<br>Revision ${escape(report.revision)} · Working tree ${escape(report.workingTree)}</small></p>
<div class="cards"><div class="card"><strong>${passed(cases)}/${cases.length}</strong>numbered cases passed<br>Unit ${cases.filter(c => c.category === "unit").length} · Integration ${cases.filter(c => c.category === "integration").length} · Business ${cases.filter(c => c.category === "business").length}</div><div class="card"><strong>${passed(runs)}/${runs.length}</strong>commands / suites passed</div><div class="card"><strong>${passed(workerCases)}/${workerCases.length}</strong>Python cases passed<br>${workerCases.filter(c => c.status === "skipped").length} skipped</div></div>
<p><a href="cases.csv">Download numbered cases (CSV)</a> · <a href="results.json">Full machine-readable report</a> · <button onclick="window.print()">Print / save PDF</button></p>
<h2>Numbered test cases</h2><label>Show <select id="category"><option value="all">All categories</option><option value="unit">Unit</option><option value="integration">Integration</option><option value="business">Business logic</option></select></label><div class="scroll"><table><thead><tr><th>Case</th><th>Requirement / observed result</th><th>Expected result</th><th>Actual status</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>Regression, browser and build evidence</h2><p>Each row is one command or suite, not one assertion. Logs contain the executed checks.</p><div class="scroll"><table><thead><tr><th>Suite / command</th><th>Scope</th><th>Result</th><th>Evidence</th></tr></thead><tbody>${runs.map(item => `<tr><td>${escape(item.id)}<details><summary>Command</summary><pre>${escape(item.command)}</pre></details></td><td>${escape(item.group)}</td><td>${badge(item.status)} ${(item.durationMs / 1000).toFixed(1)}s</td><td><a href="${item.log}">Execution log</a></td></tr>`).join("")}</tbody></table></div>
<h2>Individual Python worker cases</h2><div class="scroll"><table><thead><tr><th>Case</th><th>Result</th><th>Details</th></tr></thead><tbody>${workerCases.map(item => `<tr><td>${escape(item.id)}</td><td>${badge(item.status)}</td><td>${escape(item.reason || item.error || `${item.durationMs} ms`)}</td></tr>`).join("")}</tbody></table></div>
<h2>Browser screenshots from this run</h2>${screenshots.map(file => `<figure><a href="${escape(file)}"><img alt="${escape(path.basename(file))}" src="${escape(file)}" loading="lazy"></a><figcaption>${escape(path.basename(file))}</figcaption></figure>`).join("") || "<p>No screenshots produced during this run.</p>"}
<h2>Limits and remaining manual validation</h2><ul>${report.limitations.map(item => `<li>${escape(item)}</li>`).join("")}</ul><p>Before a live demonstration, separately verify sign-in, durable save/reload and one existing approved render in the deployed environment. Evaluate generated image/video quality and Urdu output separately; CPU contract checks do not establish those results.</p></main>
<script>document.getElementById('category').addEventListener('change',event=>{document.querySelectorAll('tr[data-category]').forEach(row=>{row.hidden=event.target.value!=='all'&&row.dataset.category!==event.target.value})})</script></html>`;
fs.writeFileSync(path.join(output, "index.html"), html);
console.log(`\nReport: ${relative(path.join(output, "index.html"))}\nNumbered cases: ${passed(cases)}/${cases.length}; Python cases: ${passed(workerCases)}/${workerCases.length}; commands: ${passed(runs)}/${runs.length}`);
if (runs.some(run => run.status !== "passed") || cases.length !== caseInventory.length || cases.some(item => item.status !== "passed") || !workerCases.length || workerCases.some(item => !["passed", "skipped"].includes(item.status))) process.exitCode = 1;
