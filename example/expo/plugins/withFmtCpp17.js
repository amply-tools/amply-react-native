const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// fmt 11 (vendored by RN) fails under Xcode 26+ clang with consteval enabled:
// "call to consteval function ... is not a constant expression" in format-inl.h.
// Building the fmt target as C++17 flips fmt's own detection to disable
// consteval (FMT_CPLUSPLUS < 201709L). Compile-time only, no ABI impact.
// Same fix as example/bare/ios/Podfile; this plugin re-applies it to the
// Podfile that `expo prebuild` regenerates.
const FMT_FIX = `    # fmt 11 (vendored by RN) fails under Xcode 26+ clang with consteval enabled.
    # Building the fmt target as C++17 flips fmt's own detection to disable
    # consteval (FMT_CPLUSPLUS < 201709L). Compile-time only, no ABI impact.
    installer.pods_project.targets.each do |target|
      next unless target.name == 'fmt'
      target.build_configurations.each do |build_config|
        build_config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
      end
    end`;

const POST_INSTALL_ANCHOR = /react_native_post_install\([\s\S]*?\n    \)/;

const withFmtCpp17 = (config) =>
  withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const podfilePath = path.join(modConfig.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes("target.name == 'fmt'")) {
        return modConfig; // already applied
      }
      if (!POST_INSTALL_ANCHOR.test(contents)) {
        console.warn(
          '[withFmtCpp17] react_native_post_install anchor not found in Podfile — fmt fix NOT applied'
        );
        return modConfig;
      }

      const patched = contents.replace(
        POST_INSTALL_ANCHOR,
        (match) => `${match}\n\n${FMT_FIX}`
      );
      fs.writeFileSync(podfilePath, patched);
      console.log('[withFmtCpp17] fmt c++17 workaround appended to Podfile post_install');
      return modConfig;
    },
  ]);

module.exports = withFmtCpp17;
