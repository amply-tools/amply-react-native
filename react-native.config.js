const path = require('path');

const codegenSourceDirAndroid = path.join(__dirname, 'android', 'src', 'newarch');
const codegenSourceDirIos = path.join(__dirname, 'ios', 'Sources', 'AmplyReactNative');
const androidProjectDir = path.join(__dirname, 'android');
const androidJniDir = path.join(androidProjectDir, 'src', 'main', 'jni');

module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: androidProjectDir,
        packageImportPath: 'import tools.amply.sdk.reactnative.AmplyPackage;',
        packageInstance: 'new AmplyPackage()',
        cmakeListsPath: path.join(androidJniDir, 'CMakeLists.txt'),
      },
      ios: null,
    },
  },
  commands: [],
  assets: [],
  codegenConfig: {
    name: 'AmplyReactNative',
    type: 'modules',
    jsSrcsDir: path.join(__dirname, 'src'),
    android: {
      sourceDir: codegenSourceDirAndroid,
      packageName: 'tools.amply.sdk.reactnative',
    },
    ios: {
      sourceDir: codegenSourceDirIos,
    },
  },
};
