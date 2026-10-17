#!/usr/bin/env node
/**
 * Checks the tarball `npm publish` would ship, after a build: every entry point in package.json is
 * in it, and every compiled file in it comes from a source file in this repo.
 *
 * Why: until 0.15.0 `main` pointed at `dist/index.js`, a bundle an early tsup build had
 * left in the working tree. `expo-module build` writes to `dist/src/`, so nothing ever rebuilt or
 * removed that file, and every release shipped it — `main` served the API of late 2025 (no
 * `handleUrl`, no `getLastCampaignTouch`). Metro reads `react-native` and never noticed; Jest and
 * anything else that resolves `main` did. A leftover like that has no source file behind it, which
 * is what the second check looks for.
 *
 * `yarn build:package` runs it after a clean build; `yarn test` and release.sh (before anything is
 * pushed, and again right before `npm publish`) run that.
 * Exits non-zero and names each problem.
 */
const {execFileSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
process.chdir(root);

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// The tsc builds and where their sources live: `dist/cjs/` mirrors `src/` (tsconfig.cjs.json),
// the rest of `dist/` mirrors the repo root (rootDir "."), `plugin/build/` mirrors `plugin/src/`.
// First match wins, so the narrower `dist/cjs/` comes before `dist/`.
const OUTPUTS = [
  {outDir: 'dist/cjs/', sourceDir: 'src/'},
  {outDir: 'dist/', sourceDir: ''},
  {outDir: 'plugin/build/', sourceDir: 'plugin/src/'},
];
const COMPILED = /(\.d\.ts\.map|\.d\.ts|\.js\.map|\.mjs\.map|\.js|\.mjs)$/;
const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

const packed = JSON.parse(packList())[0].files.map((file) => file.path);
const shipped = new Set(packed);

const problems = [];

const entries = {
  main: pkg.main,
  types: pkg.types,
  'react-native': pkg['react-native'],
  source: pkg.source,
  module: pkg.module,
  'expo.plugin': pkg.expo?.plugin?.replace(/^\.\//, ''),
};
for (const [field, entry] of Object.entries(entries)) {
  if (entry !== undefined && !shipped.has(entry)) {
    problems.push(`package.json "${field}" points at ${entry}, which is not in the tarball`);
  }
}

// app.plugin.js is a one-line require of the compiled plugin; that target has to ship too.
const pluginTarget = /require\('\.\/([^']+)'\)/.exec(fs.readFileSync('app.plugin.js', 'utf8'))?.[1];
if (pluginTarget && !shipped.has(`${pluginTarget}/index.js`) && !shipped.has(`${pluginTarget}.js`)) {
  problems.push(`app.plugin.js requires ./${pluginTarget}, which is not in the tarball`);
}

// `main` must serve the API of this tree's src/index.ts, name for name. It is loaded the way Jest
// loads it (plain require), with the peers stubbed: nothing in the SDK touches native at import.
const sourceExports = exportedNames('src/index.ts');
const mainExports = requiredNames(pkg.main);
const missing = sourceExports.filter((name) => !mainExports.includes(name));
const extra = mainExports.filter((name) => !sourceExports.includes(name));
if (missing.length > 0 || extra.length > 0) {
  problems.push(
    `"main" (${pkg.main}) does not serve src/index.ts — missing: [${missing.join(', ')}], extra: [${extra.join(', ')}]`,
  );
}

for (const file of packed) {
  const output = OUTPUTS.find(({outDir}) => file.startsWith(outDir));
  if (!output || !COMPILED.test(file)) {
    continue;
  }
  const stem = output.sourceDir + file.slice(output.outDir.length).replace(COMPILED, '');
  if (!SOURCE_EXTENSIONS.some((extension) => fs.existsSync(stem + extension))) {
    problems.push(`${file} has no source (${stem}.ts) — a leftover from an older build`);
  }
}

/**
 * `npm pack --dry-run --json`. The bare example's assembleDebug writes android/.cxx into the
 * package root, and with it present npm 11 dies with "Exit handler never called!" (measured
 * 2026-10-17: rc 1 with android/.cxx, rc 0 without it). That failure is npm's, not the package's —
 * say so and name the way out instead of dying on a stack trace.
 */
function packList() {
  try {
    return execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const npmErrors = String(error.stderr ?? '')
      .split('\n')
      .filter((line) => line.startsWith('npm error'))
      .slice(0, 3);
    console.error(`FAIL: npm pack --dry-run failed:\n  ${npmErrors.join('\n  ')}`);
    console.error('check-package: a native build in the package root is the usual cause — rm -rf android/build android/.cxx ios/build');
    process.exit(1);
  }
}

/** The value exports of a TypeScript module, as the compiler sees them (types are not runtime). */
function exportedNames(file) {
  const ts = require('typescript');
  const program = ts.createProgram([file], {allowJs: false, jsx: ts.JsxEmit.ReactNative, skipLibCheck: true});
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(program.getSourceFile(file));
  return checker
    .getExportsOfModule(moduleSymbol)
    .filter((symbol) => {
      const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      return (target.flags & ts.SymbolFlags.Value) !== 0;
    })
    .map((symbol) => symbol.getName())
    .sort();
}

/** The export names of a CommonJS file when required with react / react-native stubbed out. */
function requiredNames(file) {
  const Module = require('module');
  const load = Module._load;
  const stubs = {
    react: {useEffect() {}, useRef: () => ({}), useState: () => [], useCallback: (callback) => callback},
    'react-native': {
      NativeModules: {},
      TurboModuleRegistry: {},
      Platform: {OS: 'ios'},
      NativeEventEmitter: class {},
      Linking: {},
    },
  };
  Module._load = function loadWithStubs(request, ...rest) {
    return request in stubs ? stubs[request] : load.call(this, request, ...rest);
  };
  globalThis.__DEV__ = false;
  try {
    return Object.keys(require(path.resolve(file))).sort();
  } catch (error) {
    problems.push(`"main" (${file}) cannot be required: ${error.message.split('\n')[0]}`);
    return [];
  } finally {
    Module._load = load;
  }
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`FAIL: ${problem}`);
  }
  console.error('check-package: rebuild from a clean tree (rm -rf dist plugin/build) or fix the entry.');
  process.exit(1);
}
console.log(`check-package: OK — ${packed.length} files, every entry ships, every compiled file has a source.`);
