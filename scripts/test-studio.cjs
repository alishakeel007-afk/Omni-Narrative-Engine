// Test harness for the film studio suites.
//
// `loadTs(relativePath, mocks)` compiles one TypeScript module for Node and
// returns its exports, so tests can exercise real production code without a
// Next.js server, a database, or a provider account.
//
// `mocks` keys are module specifiers exactly as written in the source being
// loaded - "./store", "@/lib/env", "next/server" - and are matched anywhere in
// the dependency graph. A key that is a plain identifier, such as `fetch`, is
// additionally injected as a scope variable in every module of that graph, so a
// test can replace a global without touching the process. Every other
// dependency resolves normally: project files are compiled on demand, and node
// builtins and node_modules are required for real, so a test never silently
// runs against a stub it did not ask for.
//
// esbuild's synchronous API rejects plugins, so substitution happens in a
// custom `require` at execution time rather than at bundle time.
//
// Running this file directly executes the Node-only suites. The browser suites
// need Chrome and are run on their own.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".json"];
const INDEXES = ["/index.ts", "/index.tsx", "/index.js"];

/** Resolves project-local specifiers only; bare packages return undefined. */
function findLocal(specifier, importer) {
  const base = specifier.startsWith("@/")
    ? path.join(root, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(importer), specifier)
      : undefined;
  if (!base) return undefined;
  for (const candidate of [...EXTENSIONS, ...INDEXES].map((suffix) => base + suffix)) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

function resolveLocal(specifier, importer) {
  if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return undefined;
  const found = findLocal(specifier, importer);
  if (found) return found;
  throw new Error(
    `loadTs could not resolve ${specifier} from ${path.relative(root, importer)}`,
  );
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Mock keys are matched by resolved file path, so "./store" and
 * "@/lib/studio/store" substitute the same module no matter which spelling a
 * dependency happens to use. Bare package keys match by specifier, and plain
 * identifiers become scope variables.
 */
function prepareMocks(mocks, entry) {
  const byPath = new Map();
  const bySpecifier = new Map();
  const names = [];
  for (const [key, value] of Object.entries(mocks)) {
    if (IDENTIFIER.test(key)) {
      names.push(key);
      continue;
    }
    const resolved = findLocal(key, entry);
    if (resolved) byPath.set(resolved, value);
    else bySpecifier.set(key, value);
  }
  return {
    byPath,
    bySpecifier,
    names,
    values: names.map((name) => mocks[name]),
  };
}

function compile(filename, mocks, cache, globals) {
  const cached = cache.get(filename);
  if (cached) return cached.exports;
  if (filename.endsWith(".json")) {
    const parsed = { exports: JSON.parse(fs.readFileSync(filename, "utf8")) };
    cache.set(filename, parsed);
    return parsed.exports;
  }

  const { code } = esbuild.transformSync(fs.readFileSync(filename, "utf8"), {
    loader: path.extname(filename).slice(1) || "ts",
    format: "cjs",
    target: "node20",
    jsx: "automatic",
    sourcefile: filename,
    define: { "process.env.NODE_ENV": '"test"' },
  });

  const module = { exports: {} };
  // Registered before execution so an import cycle sees the same exports object.
  cache.set(filename, module);
  const nodeRequire = Module.createRequire(filename);
  const scopedRequire = (specifier) => {
    if (mocks.bySpecifier.has(specifier)) return mocks.bySpecifier.get(specifier);
    const local = resolveLocal(specifier, filename);
    if (!local) return nodeRequire(specifier);
    return mocks.byPath.has(local)
      ? mocks.byPath.get(local)
      : compile(local, mocks, cache, globals);
  };
  scopedRequire.resolve = (specifier) =>
    resolveLocal(specifier, filename) ?? nodeRequire.resolve(specifier);

  new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    ...globals.names,
    code,
  )(
    module.exports,
    scopedRequire,
    module,
    filename,
    path.dirname(filename),
    ...globals.values,
  );
  return module.exports;
}

function loadTs(relativePath, mocks = {}) {
  const entry = path.resolve(root, relativePath);
  if (!fs.existsSync(entry)) {
    throw new Error(`loadTs could not find ${relativePath}`);
  }
  const prepared = prepareMocks(mocks, entry);
  // A fresh cache per call: each load gets clean module state under its own mocks.
  return compile(entry, prepared, new Map(), prepared);
}

module.exports = { loadTs };

// Node-only suites. Each file also runs standalone via `require.main`.
const SUITES = [
  "tests/studio-entry.cjs",
  "tests/studio-state.cjs",
  "tests/studio-progress.cjs",
  "tests/studio-workflow.cjs",
  "tests/studio-script.cjs",
  "tests/studio-assist.cjs",
  "tests/studio-cloudflare.cjs",
  "tests/studio-duration.cjs",
  "tests/studio-shots.cjs",
  "tests/studio-generate.cjs",
  "tests/studio-edit.cjs",
  "tests/studio-characters.cjs",
  "tests/studio-character-details.cjs",
  "tests/studio-consistency.cjs",
  "tests/studio-director.cjs",
  "tests/studio-ltx.cjs",
  "tests/studio-scene-retry.cjs",
  "tests/studio-reference.cjs",
  "tests/studio-reference-policy.cjs",
  "tests/studio-take-deletion.cjs",
];

// Each suite runs in its own process: some self-run on require and some mutate
// process.env, so isolation keeps ordering readable and exit codes accurate.
function runSuites() {
  const { spawnSync } = require("node:child_process");
  const missing = SUITES.filter((suite) => !fs.existsSync(path.join(root, suite)));
  if (missing.length) throw new Error(`Missing test suites: ${missing.join(", ")}`);

  const failed = [];
  for (const suite of SUITES) {
    console.log(`\n--- ${suite}`);
    const result = spawnSync(process.execPath, [path.join(root, suite)], {
      cwd: root,
      stdio: "inherit",
    });
    if (result.status !== 0) failed.push(suite);
  }
  if (failed.length) throw new Error(`FAIL: ${failed.join(", ")}`);
  console.log("\nPASS: all Node studio suites.");
}

if (require.main === module) {
  try {
    runSuites();
  } catch (error) {
    console.error(String(error.message || error));
    process.exitCode = 1;
  }
}
