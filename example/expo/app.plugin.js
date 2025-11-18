const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

/**
 * This plugin adds the native Amply module to the Expo prebuild
 * gradle configuration and MainApplication for local link: protocol usage.
 *
 * This is an optional example plugin. The main plugin ('@amply/amply-react-native')
 * should handle module registration automatically during expo prebuild.
 * If you need additional customization for the Expo example app, use this plugin.
 */
module.exports = function (config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      try {
        const projectRoot = config.modRequest.projectRoot;
        console.log('[Amply Example Plugin] Starting Amply module configuration...');

        // Modify settings.gradle
        const settingsGradlePath = path.join(projectRoot, 'android', 'settings.gradle');
        modifySettingsGradle(settingsGradlePath);

        // Modify app/build.gradle
        const appBuildGradlePath = path.join(projectRoot, 'android', 'app', 'build.gradle');
        modifyAppBuildGradle(appBuildGradlePath);

        // Modify MainApplication to register AmplyPackage
        const javaSrcDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java');
        if (fs.existsSync(javaSrcDir)) {
          const mainApplicationPath = findMainApplication(javaSrcDir);
          if (mainApplicationPath) {
            modifyMainApplication(mainApplicationPath);
            console.log('[Amply Example Plugin] Successfully registered AmplyPackage');
          } else {
            console.warn('[Amply Example Plugin] MainApplication not found in ' + javaSrcDir);
          }
        } else {
          console.warn('[Amply Example Plugin] Java source directory not found: ' + javaSrcDir);
        }

        console.log('[Amply Example Plugin] Amply module configuration completed');
      } catch (error) {
        console.error('[Amply Example Plugin] Error configuring Amply module:', error);
        throw error;
      }

      return config;
    },
  ]);
};

function modifySettingsGradle(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[Amply Example Plugin] settings.gradle not found at ${filePath}`);
    return;
  }

  let contents = fs.readFileSync(filePath, 'utf-8');

  // Only add if not already present
  if (contents.includes(':amplyreactnative')) {
    console.log('[Amply Example Plugin] Amply module already configured in settings.gradle');
    return;
  }

  // Add the Amply native module include configuration after the last includeBuild statement
  const moduleConfig = "\n\ninclude ':amplyreactnative'\nproject(':amplyreactnative').projectDir = new File(rootProject.projectDir, '../../../android')";

  // Find the last includeBuild statement and insert after it
  const lastIncludeBuildMatch = contents.lastIndexOf('includeBuild');
  if (lastIncludeBuildMatch !== -1) {
    const nextNewlineAfterIncludeBuild = contents.indexOf('\n', lastIncludeBuildMatch);
    if (nextNewlineAfterIncludeBuild !== -1) {
      contents =
        contents.slice(0, nextNewlineAfterIncludeBuild + 1) +
        moduleConfig +
        contents.slice(nextNewlineAfterIncludeBuild + 1);
      console.log('[Amply Example Plugin] Added Amply module include to settings.gradle');
    }
  } else {
    // Fallback: append at the end
    contents += moduleConfig;
    console.log('[Amply Example Plugin] Appended Amply module include to settings.gradle (no includeBuild found)');
  }

  fs.writeFileSync(filePath, contents, 'utf-8');
}

function modifyAppBuildGradle(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[Amply Example Plugin] app/build.gradle not found at ${filePath}`);
    return;
  }

  let contents = fs.readFileSync(filePath, 'utf-8');

  // Only add if not already present
  if (contents.includes(':amplyreactnative')) {
    console.log('[Amply Example Plugin] Amply module already configured in app/build.gradle');
    return;
  }

  // Add the Amply native module dependency after the first implementation statement in dependencies block
  const depsStart = contents.indexOf('dependencies {');
  if (depsStart !== -1) {
    const firstImplAfterDeps = contents.indexOf('implementation', depsStart);
    if (firstImplAfterDeps !== -1) {
      const lineEnd = contents.indexOf('\n', firstImplAfterDeps);
      if (lineEnd !== -1) {
        const moduleImpl = "\n\n    // Amply React Native module\n    implementation project(':amplyreactnative')";
        contents =
          contents.slice(0, lineEnd) +
          moduleImpl +
          contents.slice(lineEnd);

        fs.writeFileSync(filePath, contents, 'utf-8');
        console.log('[Amply Example Plugin] Added Amply module dependency to app/build.gradle');
      }
    }
  } else {
    console.warn('[Amply Example Plugin] Could not find dependencies block in app/build.gradle');
  }
}

function findMainApplication(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        const result = findMainApplication(filePath);
        if (result) {
          console.log(`[Amply Example Plugin] Found MainApplication at: ${result}`);
          return result;
        }
      } else if (file === 'MainApplication.kt' || file === 'MainApplication.java') {
        console.log(`[Amply Example Plugin] Found MainApplication file: ${filePath}`);
        return filePath;
      }
    }
  } catch (e) {
    console.warn(`[Amply Example Plugin] Error searching for MainApplication: ${e.message}`);
  }
  console.warn(`[Amply Example Plugin] MainApplication not found in ${dir}`);
  return null;
}

function modifyMainApplication(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[Amply Example Plugin] MainApplication not found at ${filePath}`);
    return;
  }

  let contents = fs.readFileSync(filePath, 'utf-8');

  // Check if AmplyPackage is already registered
  if (contents.includes('AmplyPackage')) {
    console.log('[Amply Example Plugin] AmplyPackage already registered in MainApplication');
    return;
  }

  // Add import if not present
  if (!contents.includes('import com.amply.reactnative.AmplyPackage')) {
    const lastImportIndex = contents.lastIndexOf('import ');
    if (lastImportIndex !== -1) {
      const endOfLastImport = contents.indexOf('\n', lastImportIndex);
      if (endOfLastImport !== -1) {
        const importLine = '\nimport com.amply.reactnative.AmplyPackage';
        contents = contents.slice(0, endOfLastImport) + importLine + contents.slice(endOfLastImport);
        console.log('[Amply Example Plugin] Added AmplyPackage import');
      }
    }
  }

  // Add AmplyPackage() to the packages list in getPackages() method
  // Use a more robust regex that handles multi-line formatting
  const getPackagesMatch = contents.match(/override\s+(fun|public)\s+getPackages\(\)[\s\S]*?PackageList\(this\)\.packages\.apply\s*\{/);

  if (getPackagesMatch) {
    const matchStart = contents.indexOf(getPackagesMatch[0]);
    const blockStart = contents.lastIndexOf('{', matchStart + getPackagesMatch[0].length);

    // Find the closing brace of the apply block using brace counting
    let braceCount = 1;
    let blockEnd = blockStart + 1;
    while (blockEnd < contents.length && braceCount > 0) {
      if (contents[blockEnd] === '{') braceCount++;
      if (contents[blockEnd] === '}') braceCount--;
      blockEnd++;
    }
    blockEnd--;

    if (blockStart !== -1 && blockEnd !== -1) {
      const blockContent = contents.substring(blockStart + 1, blockEnd).trim();

      // Only add if not already present
      if (!blockContent.includes('add(AmplyPackage())')) {
        // Determine proper indentation from the surrounding code
        const lineBeforeBlock = contents.substring(0, blockStart).split('\n').pop() || '';
        const indent = lineBeforeBlock.match(/^\s*/)?.[0] || '              ';

        // Insert AmplyPackage() registration at the beginning of the apply block
        const insertion = `\n${indent}add(AmplyPackage())\n`;
        contents = contents.slice(0, blockStart + 1) + insertion + contents.slice(blockStart + 1);
        console.log('[Amply Example Plugin] Registered AmplyPackage in getPackages() method');
      }
    } else {
      console.warn('[Amply Example Plugin] Could not find getPackages() apply block closing brace');
    }
  } else {
    console.warn('[Amply Example Plugin] Could not find getPackages() method in MainApplication');
  }

  fs.writeFileSync(filePath, contents, 'utf-8');
}
