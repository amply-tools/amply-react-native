import {IOSConfig, type ExportedConfig} from '@expo/config-plugins';
import type {ExpoConfig} from '@expo/config-types';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  ANDROID_BUNDLE_SOURCE,
  ANDROID_BUNDLE_TARGET,
  BUNDLE_FILE_NAME,
  IOS_BUNDLE_SOURCE,
  copyAndroidBundle,
  addIosBundle,
} from '../builtInBundle';
import withAmply from '../withAmply';

type XcodeProject = ReturnType<typeof IOSConfig.XcodeUtils.getPbxproj>;

const PROJECT_NAME = 'AmplyExpoExample';
const FIXTURE_PBXPROJ = path.join(__dirname, 'fixtures', 'expo-app.pbxproj');
const ANDROID_CONTENT = '{"format":1,"apiKeyPublic":"android-key"}\n';
const IOS_CONTENT = '{"format":1,"apiKeyPublic":"ios-key"}\n';

let projectRoot: string;

/** An Expo project right after `expo prebuild`: both native folders, the real Expo pbxproj. */
function createProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amply-plugin-'));
  fs.mkdirSync(path.join(root, 'android', 'app', 'src', 'main'), {recursive: true});
  fs.mkdirSync(path.join(root, 'ios', PROJECT_NAME), {recursive: true});
  fs.mkdirSync(path.join(root, 'ios', `${PROJECT_NAME}.xcodeproj`), {recursive: true});
  fs.copyFileSync(
    FIXTURE_PBXPROJ,
    path.join(root, 'ios', `${PROJECT_NAME}.xcodeproj`, 'project.pbxproj'),
  );
  return root;
}

function writeSource(name: string, content: string): void {
  fs.writeFileSync(path.join(projectRoot, name), content);
}

const androidTarget = () => path.join(projectRoot, 'android', ANDROID_BUNDLE_TARGET);
const iosTarget = () => path.join(projectRoot, 'ios', PROJECT_NAME, BUNDLE_FILE_NAME);
const loadProject = (): XcodeProject => IOSConfig.XcodeUtils.getPbxproj(projectRoot);
const iosOptions = (project: XcodeProject) => ({
  projectRoot,
  platformProjectRoot: path.join(projectRoot, 'ios'),
  projectName: PROJECT_NAME,
  project,
});

/** File names (no folder) in the app target's Copy Bundle Resources phase, one per build file. */
function appTargetResources(project: XcodeProject): string[] {
  const appTarget = project.getTarget('com.apple.product-type.application');
  if (!appTarget) {
    throw new Error('fixture has no application target');
  }
  const phases = project.hash.project.objects.PBXResourcesBuildPhase;
  const phaseId = appTarget.target.buildPhases
    .map((phase: {value: string}) => phase.value)
    .find((id: string) => phases[id] !== undefined);
  const buildFiles = project.hash.project.objects.PBXBuildFile;
  const fileRefs = project.hash.project.objects.PBXFileReference;
  return phases[phaseId].files.map(
    (file: {value: string}) =>
      path.basename(fileRefs[buildFiles[file.value].fileRef].path.replace(/"/g, '')),
  );
}

function fileReferencesNamed(project: XcodeProject, name: string): number {
  const refs = project.hash.project.objects.PBXFileReference;
  return Object.keys(refs).filter(
    (key) => !key.endsWith('_comment') && refs[key].path?.replace(/"/g, '').endsWith(name),
  ).length;
}

beforeEach(() => {
  projectRoot = createProject();
});

afterEach(() => {
  fs.rmSync(projectRoot, {recursive: true, force: true});
});

describe('copyAndroidBundle', () => {
  it('copies the Android bundle into the app assets root under the name the SDK reads', () => {
    writeSource(ANDROID_BUNDLE_SOURCE, ANDROID_CONTENT);

    const copied = copyAndroidBundle(projectRoot, path.join(projectRoot, 'android'));

    expect(copied).toBe(true);
    expect(androidTarget()).toBe(
      path.join(projectRoot, 'android', 'app', 'src', 'main', 'assets', 'amply-bundle.json'),
    );
    expect(fs.readFileSync(androidTarget(), 'utf8')).toBe(ANDROID_CONTENT);
  });

  it('does nothing, not even the assets folder, when the project has no Android bundle', () => {
    writeSource(IOS_BUNDLE_SOURCE, IOS_CONTENT);

    const copied = copyAndroidBundle(projectRoot, path.join(projectRoot, 'android'));

    expect(copied).toBe(false);
    expect(fs.existsSync(path.dirname(androidTarget()))).toBe(false);
  });

  it('replaces an older copy with the current bundle', () => {
    writeSource(ANDROID_BUNDLE_SOURCE, '{"format":1,"old":true}\n');
    copyAndroidBundle(projectRoot, path.join(projectRoot, 'android'));
    writeSource(ANDROID_BUNDLE_SOURCE, ANDROID_CONTENT);

    copyAndroidBundle(projectRoot, path.join(projectRoot, 'android'));

    expect(fs.readFileSync(androidTarget(), 'utf8')).toBe(ANDROID_CONTENT);
  });
});

describe('addIosBundle', () => {
  it('copies the iOS bundle next to Info.plist and makes it a resource of the app target', () => {
    writeSource(IOS_BUNDLE_SOURCE, IOS_CONTENT);
    const project = loadProject();

    addIosBundle(iosOptions(project));

    expect(fs.readFileSync(iosTarget(), 'utf8')).toBe(IOS_CONTENT);
    expect(appTargetResources(project)).toContain(BUNDLE_FILE_NAME);
  });

  it('survives a write and re-read of the project file', () => {
    writeSource(IOS_BUNDLE_SOURCE, IOS_CONTENT);
    const project = loadProject();
    addIosBundle(iosOptions(project));

    fs.writeFileSync(project.filepath, project.writeSync());

    expect(appTargetResources(loadProject())).toContain(BUNDLE_FILE_NAME);
  });

  it('adds the resource once when prebuild runs twice', () => {
    writeSource(IOS_BUNDLE_SOURCE, IOS_CONTENT);
    const first = loadProject();
    addIosBundle(iosOptions(first));
    fs.writeFileSync(first.filepath, first.writeSync());

    const second = loadProject();
    addIosBundle(iosOptions(second));

    expect(appTargetResources(second).filter((name) => name === BUNDLE_FILE_NAME)).toHaveLength(1);
    expect(fileReferencesNamed(second, BUNDLE_FILE_NAME)).toBe(1);
  });

  it('leaves the project file and the folder untouched when the project has no iOS bundle', () => {
    writeSource(ANDROID_BUNDLE_SOURCE, ANDROID_CONTENT);
    const project = loadProject();
    const before = project.writeSync();

    addIosBundle(iosOptions(project));

    expect(project.writeSync()).toBe(before);
    expect(fs.existsSync(iosTarget())).toBe(false);
  });
});

describe('withAmply', () => {
  const baseConfig = (): ExpoConfig => ({name: 'App', slug: 'app'});

  async function runMods(config: ExportedConfig) {
    const modRequest = {projectRoot, introspect: false, ignoreExistingNativeFiles: false};
    const android = config.mods?.android?.dangerous;
    const ios = config.mods?.ios?.xcodeproj;
    if (!android || !ios) {
      throw new Error('withAmply did not register its mods');
    }
    await android({
      ...config,
      modResults: undefined,
      modRequest: {
        ...modRequest,
        platform: 'android',
        modName: 'dangerous',
        platformProjectRoot: path.join(projectRoot, 'android'),
      },
    } as never);
    const project = loadProject();
    await ios({
      ...config,
      modResults: project,
      modRequest: {
        ...modRequest,
        platform: 'ios',
        modName: 'xcodeproj',
        projectName: PROJECT_NAME,
        platformProjectRoot: path.join(projectRoot, 'ios'),
      },
    } as never);
    return project;
  }

  it('works when listed in app.json with no options', () => {
    expect(() => withAmply(baseConfig(), undefined as never)).not.toThrow();
  });

  it('copies both bundles at prebuild', async () => {
    writeSource(ANDROID_BUNDLE_SOURCE, ANDROID_CONTENT);
    writeSource(IOS_BUNDLE_SOURCE, IOS_CONTENT);

    const project = await runMods(withAmply(baseConfig(), undefined as never));

    expect(fs.readFileSync(androidTarget(), 'utf8')).toBe(ANDROID_CONTENT);
    expect(fs.readFileSync(iosTarget(), 'utf8')).toBe(IOS_CONTENT);
    expect(appTargetResources(project)).toContain(BUNDLE_FILE_NAME);
  });

  it('copies only the platform whose bundle exists', async () => {
    writeSource(IOS_BUNDLE_SOURCE, IOS_CONTENT);

    await runMods(withAmply(baseConfig(), undefined as never));

    expect(fs.existsSync(androidTarget())).toBe(false);
    expect(fs.existsSync(iosTarget())).toBe(true);
  });

  it('changes nothing and prints nothing in a project without built-in campaigns', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pristine = loadProject().writeSync();

    const project = await runMods(withAmply(baseConfig(), undefined as never));

    expect(fs.existsSync(androidTarget())).toBe(false);
    expect(fs.existsSync(iosTarget())).toBe(false);
    expect(project.writeSync()).toBe(pristine);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    log.mockRestore();
    warn.mockRestore();
  });
});
