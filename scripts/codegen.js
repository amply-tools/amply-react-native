#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const {
  combineSchemasInFileList,
} = require('@react-native/codegen/lib/cli/combine/combine-js-to-schema');
const RNCodegen = require('@react-native/codegen/lib/generators/RNCodegen');

const ROOT = path.resolve(__dirname, '..');
const configPath = path.join(ROOT, 'codegen.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

/**
 * Clean up stale generated files from previous codegen runs with different libraryName.
 * RN codegen doesn't automatically clean old files when libraryName changes.
 */
function cleanupStaleGeneratedFiles(outputDir, currentLibraryName) {
  if (!fs.existsSync(outputDir)) {
    return;
  }

  const files = fs.readdirSync(outputDir);
  const stalePatterns = [
    /-generated\.(cpp|h)$/,  // Files ending in -generated.cpp or -generated.h
    /^[^/]+(\.h)$/,          // Header files
  ];

  // Only delete files that don't match current library name
  files.forEach(file => {
    if (file.includes(currentLibraryName)) {
      return;  // Keep files with current library name
    }

    if (stalePatterns.some(pattern => pattern.test(file))) {
      const filePath = path.join(outputDir, file);
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        // Silently ignore - might be a directory
      }
    }
  });
}

/**
 * Патчим android/src/newarch/jni/CMakeLists.txt после генерации.
 * RN 0.79 в Gradle передаёт в CMake параметр:
 *   -DREACT_NATIVE_DIR=/.../node_modules/react-native
 *
 * Мы из него делаем REACT_COMMON_DIR и подрубаем
 *   ReactCommon/cmake-utils/react-native-flags.cmake
 * Там как раз и объявлен target_compile_reactnative_options.
 */
function patchAndroidCMake(cmakePath) {
  if (!fs.existsSync(cmakePath)) {
    return;
  }

  const original = fs.readFileSync(cmakePath, 'utf-8');

  // Уже патчили — выходим.
  if (original.includes('react-native-flags.cmake')) {
    return;
  }

  const insertSnippet = `
# --- React Native 0.79: wire up compile flags ---
if(NOT DEFINED REACT_NATIVE_DIR)
  message(FATAL_ERROR "REACT_NATIVE_DIR is not defined; it must point to node_modules/react-native")
endif()

# Gradle (externalNativeBuild) passes REACT_NATIVE_DIR.
# From it we derive ReactCommon path used by RN CMake utils.
set(REACT_COMMON_DIR "\${REACT_NATIVE_DIR}/ReactCommon")

# This provides target_compile_reactnative_options and imported targets
# like 'reactnative', 'jsi', 'fbjni', etc.
include(\${REACT_COMMON_DIR}/cmake-utils/react-native-flags.cmake)
# --- end RN wiring ---
`.trim();

  const linesIn = original.split('\n');
  const linesOut = [];
  let inserted = false;

  for (let i = 0; i < linesIn.length; i++) {
    const line = linesIn[i];
    linesOut.push(line);

    // Вставляем наш блок сразу после set(CMAKE_VERBOSE_MAKEFILE on)
    if (!inserted && line.match(/set\s*\(\s*CMAKE_VERBOSE_MAKEFILE\s+on\s*\)/)) {
      linesOut.push('');
      linesOut.push(insertSnippet);
      linesOut.push('');
      inserted = true;
    }
  }

  const updated = linesOut.join('\n');
  fs.writeFileSync(cmakePath, updated);
}

/**
 * Patch the newarch CMakeLists.txt to add missing JSI include directories
 * and ensure proper inclusion of React headers.
 */
function enhanceNewarchCMake(cmakePath) {
  if (!fs.existsSync(cmakePath)) {
    return;
  }

  let content = fs.readFileSync(cmakePath, 'utf-8');

  // Check if we've already added the JSI includes
  if (content.includes('REACT_JSI_DIR')) {
    return;
  }

  // Additional imports needed for generated TurboModule code
  const jsiEnhancement = `\n# Ensure fbjni is available as imported target
find_package(fbjni REQUIRED CONFIG)

# For OBJECT libraries, we need to explicitly add include directories since
# target_link_libraries doesn't propagate INTERFACE_INCLUDE_DIRECTORIES for OBJECT libs
set(REACT_JSI_DIR "\${REACT_COMMON_DIR}/jsi")
`;

  // Insert after the react-native-flags.cmake include, before file(GLOB...)
  content = content.replace(
    /# --- end RN wiring ---\n\n\nfile\(GLOB/,
    '# --- end RN wiring ---' + jsiEnhancement + '\nfile(GLOB'
  );

  // For OBJECT libraries, we need to add JSI include directories explicitly
  // Note: folly and reactnative includes will be added by the parent CMakeLists.txt
  // after targets are created. We only need JSI here since it's a source directory.
  const includePattern = /target_include_directories\(react_codegen_\w+ PUBLIC \. react\/renderer\/components\/\w+\)/g;
  content = content.replace(includePattern, (match) => {
    if (match.includes('${REACT_JSI_DIR}')) {
      return match;  // Already has includes
    }
    // Add JSI include path
    return match.replace(')', ` \${REACT_JSI_DIR})`);
  });

  // Remove target_link_libraries from OBJECT library
  // OBJECT libraries don't need to be linked in the generated CMakeLists
  // The parent CMakeLists will link the main library against the necessary targets
  // and add includes for the OBJECT library separately.
  // This avoids duplicate linking and unresolved symbols in the final link step.
  content = content.replace(
    /target_link_libraries\([^)]+fbjni[^)]+jsi[^)]+reactnative[^)]*\)\n/s,
    ''
  );

  fs.writeFileSync(cmakePath, content);
}

/**
 * Генерация для одного модуля из codegen.config.json
 */
function generateModule(name, moduleConfig) {
  const jsSpecFile = path.resolve(ROOT, moduleConfig.jsSpecFile);
  const schema = combineSchemasInFileList([jsSpecFile]);
  const libraryName = moduleConfig.libraryName ?? name;

  const androidConfig = moduleConfig.android;
  if (androidConfig && androidConfig.sourceDir) {
    const outputDirectory = path.resolve(ROOT, androidConfig.sourceDir);
    const jniDir = path.join(outputDirectory, 'jni');

    // Clean up stale files before generating
    cleanupStaleGeneratedFiles(jniDir, libraryName);

    RNCodegen.generate(
      {
        libraryName,
        schema,
        outputDirectory,
        packageName: androidConfig.packageName ?? 'com.facebook.fbreact.specs',
        assumeNonnull: true,
      },
      {generators: ['modulesAndroid']},
    );

    const cmakePath = path.join(outputDirectory, 'jni', 'CMakeLists.txt');
    patchAndroidCMake(cmakePath);
    enhanceNewarchCMake(cmakePath);  // Add JSI and React header configurations
  }

  const iosConfig = moduleConfig.ios;
  if (iosConfig && iosConfig.sourceDir) {
    const iosOutputDir = path.resolve(ROOT, iosConfig.sourceDir);

    // Remove stale doubly-nested directory that causes duplicate symbols.
    // Codegen outputs to {outputDir}/{libraryName}/, so a nested
    // {outputDir}/{libraryName}/{libraryName}/ is always stale.
    const staleNestedDir = path.join(iosOutputDir, libraryName, libraryName);
    if (fs.existsSync(staleNestedDir)) {
      fs.rmSync(staleNestedDir, {recursive: true});
    }

    RNCodegen.generate(
      {
        libraryName,
        schema,
        outputDirectory: iosOutputDir,
        moduleName: iosConfig.moduleName ?? libraryName,
        assumeNonnull: true,
      },
      {generators: ['modulesIOS']},
    );
  }
}

/**
 * Every file generation writes into, for every configured module.
 *
 * Used by --check to snapshot before and compare after, so the check can tell
 * "the committed output matches the spec" from "someone edited the spec and
 * forgot to regenerate" without depending on git state.
 */
function generatedOutputDirs() {
  const dirs = new Set();
  Object.values(config.modules).forEach((moduleConfig) => {
    if (moduleConfig.type !== 'NativeModule') {
      return;
    }
    if (moduleConfig.android?.sourceDir) {
      dirs.add(path.resolve(ROOT, moduleConfig.android.sourceDir));
    }
    if (moduleConfig.ios?.sourceDir) {
      dirs.add(path.resolve(ROOT, moduleConfig.ios.sourceDir));
    }
  });
  return [...dirs];
}

function snapshotTree(dir, acc = new Map()) {
  if (!fs.existsSync(dir)) {
    return acc;
  }
  fs.readdirSync(dir, {withFileTypes: true}).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      snapshotTree(full, acc);
    } else if (entry.isFile()) {
      acc.set(full, fs.readFileSync(full));
    }
  });
  return acc;
}

function runAllModules() {
  Object.entries(config.modules).forEach(([name, moduleConfig]) => {
    if (moduleConfig.type !== 'NativeModule') {
      return;
    }
    generateModule(name, moduleConfig);
  });
}

/**
 * Verifies the committed generated sources still match the TypeScript spec.
 *
 * The generated ObjC++/JNI types live in the repository, so a spec edit without
 * a regeneration leaves them describing an older contract. Nothing catches that
 * until something compiles against the missing members — which, for iOS, is the
 * release pipeline's native gate, twenty minutes and a published KMP artifact
 * later. This turns that into a two-second failure.
 *
 * Non-destructive: regenerates, compares against the snapshot taken first, and
 * puts the originals back either way, so running it never leaves the tree in a
 * state the caller did not ask for.
 */
function check() {
  const dirs = generatedOutputDirs();
  const before = new Map();
  dirs.forEach((dir) => snapshotTree(dir, before));

  runAllModules();

  const after = new Map();
  dirs.forEach((dir) => snapshotTree(dir, after));

  const changed = [];
  after.forEach((content, file) => {
    const previous = before.get(file);
    if (previous === undefined) {
      changed.push(`${path.relative(ROOT, file)} (missing — never generated)`);
    } else if (!previous.equals(content)) {
      changed.push(path.relative(ROOT, file));
    }
  });
  before.forEach((content, file) => {
    if (!after.has(file)) {
      changed.push(`${path.relative(ROOT, file)} (stale — no longer generated)`);
    }
  });

  // Restore whatever was committed, including files generation created.
  after.forEach((_, file) => {
    if (!before.has(file)) {
      fs.rmSync(file, {force: true});
    }
  });
  before.forEach((content, file) => fs.writeFileSync(file, content));

  if (changed.length > 0) {
    console.error(
      'Generated sources are out of date with ' +
        Object.values(config.modules)
          .map((m) => m.jsSpecFile)
          .join(', ') +
        ':\n'
    );
    changed.forEach((file) => console.error(`  ${file}`));
    console.error('\nRun `node scripts/codegen.js` and commit the result.');
    process.exit(1);
  }

  console.log('Generated sources are up to date with the TypeScript spec.');
}

if (process.argv.includes('--check')) {
  check();
} else {
  runAllModules();
}