const { spawn } = require("node:child_process");
const path = require("node:path");
const mode = process.argv[2] || "dev";
const children = [
  spawn(
    process.execPath,
    [
      path.resolve("node_modules/next/dist/bin/next"),
      mode,
      ...process.argv.slice(3),
    ],
    { stdio: "inherit", windowsHide: true },
  ),
  spawn(process.execPath, [path.resolve("scripts/studio-worker.cjs")], {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: mode === "dev" ? "development" : "production",
    },
  }),
];
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  process.exitCode = code;
  for (const child of children) if (!child.killed) child.kill("SIGTERM");
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
for (const child of children) {
  child.on("error", () => stop(1));
  child.on("exit", (code) => stop(code || 0));
}
