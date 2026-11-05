import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Xcode builds AmplySDK's binary target into the shared products directory AND into this pod's
// own CONFIGURATION_BUILD_DIR, writing AmplySDK.xcframework-<platform>.signature into both.
// `xcodebuild archive` then flattens every signature into one Signatures folder and fails on the
// second copy. The podspec runs ios/scripts/remove-duplicate-archive-signature.sh after compile;
// these tests run that script for real.

const root = join(__dirname, '..', '..');
const script = join(root, 'ios', 'scripts', 'remove-duplicate-archive-signature.sh');

type Dirs = { shared: string; pod: string };

function makeDirs(): Dirs {
  const base = mkdtempSync(join(tmpdir(), 'amply sig '));
  const shared = join(base, 'Release-iphoneos');
  const pod = join(shared, 'AmplyReactNative');
  mkdirSync(pod, { recursive: true });
  return { shared, pod };
}

function run(dirs: Dirs, action: string) {
  execFileSync('/bin/sh', [script], {
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      ACTION: action,
      CONFIGURATION_BUILD_DIR: dirs.pod,
      PODS_CONFIGURATION_BUILD_DIR: dirs.shared,
    },
    stdio: 'pipe',
  });
}

const name = (platform: string) => `AmplySDK.xcframework-${platform}.signature`;

describe('archive signature cleanup', () => {
  it('removes the pod copy of an identical AmplySDK signature when archiving', () => {
    const dirs = makeDirs();
    for (const platform of ['ios', 'ios-simulator']) {
      writeFileSync(join(dirs.shared, name(platform)), `sig-${platform}`);
      writeFileSync(join(dirs.pod, name(platform)), `sig-${platform}`);
    }

    run(dirs, 'install');

    expect(existsSync(join(dirs.pod, name('ios')))).toBe(false);
    expect(existsSync(join(dirs.pod, name('ios-simulator')))).toBe(false);
    expect(readFileSync(join(dirs.shared, name('ios')), 'utf8')).toBe('sig-ios');
  });

  it('keeps a pod signature that differs from the shared one', () => {
    const dirs = makeDirs();
    writeFileSync(join(dirs.shared, name('ios')), 'one');
    writeFileSync(join(dirs.pod, name('ios')), 'two');

    run(dirs, 'install');

    expect(existsSync(join(dirs.pod, name('ios')))).toBe(true);
  });

  it('keeps a pod signature with no shared counterpart, and other frameworks’ signatures', () => {
    const dirs = makeDirs();
    writeFileSync(join(dirs.pod, name('ios')), 'only-here');
    writeFileSync(join(dirs.shared, 'Other.xcframework-ios.signature'), 'x');
    writeFileSync(join(dirs.pod, 'Other.xcframework-ios.signature'), 'x');

    run(dirs, 'install');

    expect(existsSync(join(dirs.pod, name('ios')))).toBe(true);
    expect(existsSync(join(dirs.pod, 'Other.xcframework-ios.signature'))).toBe(true);
  });

  it('does nothing on an ordinary build', () => {
    const dirs = makeDirs();
    writeFileSync(join(dirs.shared, name('ios')), 'same');
    writeFileSync(join(dirs.pod, name('ios')), 'same');

    run(dirs, 'build');

    expect(existsSync(join(dirs.pod, name('ios')))).toBe(true);
  });

  it('does nothing when the pod builds into the shared directory itself', () => {
    const dirs = makeDirs();
    const alias = join(dirs.pod, 'shared-alias');
    symlinkSync(dirs.shared, alias);
    writeFileSync(join(dirs.shared, name('ios')), 'same');

    run({ shared: dirs.shared, pod: alias }, 'install');

    expect(existsSync(join(dirs.shared, name('ios')))).toBe(true);
  });

  it('warns instead of failing the build when a build directory is missing', () => {
    const dirs = makeDirs();

    expect(() => run({ shared: dirs.shared, pod: join(dirs.pod, 'missing') }, 'install')).not.toThrow();
  });

  it('is wired into the podspec as an after-compile script phase', () => {
    const podspec = readFileSync(join(root, 'AmplyReactNative.podspec'), 'utf8');
    expect(podspec).toContain('s.script_phase');
    expect(podspec).toContain('ios/scripts/remove-duplicate-archive-signature.sh');
    expect(podspec).toContain(':execution_position => :after_compile');
  });
});
