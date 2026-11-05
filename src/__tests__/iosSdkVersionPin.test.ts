import { readFileSync } from 'fs';
import { join } from 'path';

// The iOS bridge takes AmplySDK from its Swift package in both build modes: CocoaPods mode through
// AmplyReactNative.podspec (spm_dependency) and React Native's SPM mode through ios/Package.swift.
// package.json → amply.iosSdkVersion is the one place release.sh writes; these tests keep the
// two manifests from drifting away from it.

const root = join(__dirname, '..', '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');

const iosSdkVersion: string = JSON.parse(read('package.json')).amply?.iosSdkVersion;

describe('iOS AmplySDK version pin', () => {
  it('package.json declares an exact amply.iosSdkVersion', () => {
    expect(iosSdkVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('ios/Package.swift pins the same AmplySDK version, exactly', () => {
    const manifest = read('ios/Package.swift');
    expect(manifest).toContain(`let amplySdkVersion: Version = "${iosSdkVersion}"`);
    expect(manifest).toContain('exact: amplySdkVersion');
  });

  it('the podspec reads the version from package.json instead of hard-coding one', () => {
    const podspec = read('AmplyReactNative.podspec');
    expect(podspec).toContain("package.dig('amply', 'iosSdkVersion')");
    expect(podspec).toContain('version: amply_ios_sdk_version');
    expect(podspec).not.toMatch(/s\.dependency 'AmplySDK'/);
  });
});
