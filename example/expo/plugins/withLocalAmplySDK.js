const { withSettingsGradle, withAppBuildGradle, ConfigPlugin } = require('@expo/config-plugins');

const withLocalAmplySDK = (config) => {
  console.log('[withLocalAmplySDK] Plugin is being applied');

  // Modify settings.gradle to include the local Android module
  config = withSettingsGradle(config, (gradleConfig) => {
    console.log('[withLocalAmplySDK] Modifying settings.gradle');
    const settingsGradle = gradleConfig.modResults.contents;

    // Add the include statement for amplyreactnative if not present
    if (!settingsGradle.includes("include ':amplyreactnative'")) {
      const includeStatement = `include ':amplyreactnative'
project(':amplyreactnative').projectDir = new File(rootDir, '../../android')`;

      // Add after the existing include ':app'
      gradleConfig.modResults.contents = settingsGradle.replace(
        "include ':app'",
        `include ':app'
${includeStatement}`
      );
      console.log('[withLocalAmplySDK] Added amplyreactnative include to settings.gradle');
    }

    return gradleConfig;
  });

  // Modify app/build.gradle to add the dependency
  config = withAppBuildGradle(config, (gradleConfig) => {
    console.log('[withLocalAmplySDK] Modifying app/build.gradle');
    const appGradle = gradleConfig.modResults.contents;

    // Add the implementation if not present
    if (!appGradle.includes('project(":amplyreactnative")')) {
      // Find the react-android implementation and add ours after it
      gradleConfig.modResults.contents = appGradle.replace(
        'implementation("com.facebook.react:react-android")',
        `implementation("com.facebook.react:react-android")
    implementation(project(":amplyreactnative"))`
      );
      console.log('[withLocalAmplySDK] Added amplyreactnative dependency to app/build.gradle');
    }

    return gradleConfig;
  });

  return config;
};

module.exports = withLocalAmplySDK;
