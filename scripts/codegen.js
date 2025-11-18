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
    RNCodegen.generate(
      {
        libraryName,
        schema,
        outputDirectory: path.resolve(ROOT, iosConfig.sourceDir),
        moduleName: iosConfig.moduleName ?? libraryName,
        assumeNonnull: true,
      },
      {generators: ['modulesIOS']},
    );
  }
}

// Обрабатываем все модули из codegen.config.json
Object.entries(config.modules).forEach(([name, moduleConfig]) => {
  if (moduleConfig.type !== 'NativeModule') {
    return;
  }
  generateModule(name, moduleConfig);
});