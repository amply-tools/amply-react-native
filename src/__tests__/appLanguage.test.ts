/**
 * `setAppLanguage` and the `appLanguage` initialization option.
 *
 * The SDK treats both as one setting with "last write wins": `appLanguage` in the config is the
 * same as calling `setAppLanguage` at initialization. The native bridges cannot honour that order
 * on their own for a call made BEFORE `initialize` — they buffer it and replay it after the SDK is
 * built, which would let an earlier call overwrite the later config value. So the JS layer parks a
 * pre-init call itself and folds it into the config it hands to native.
 *
 * Each test loads a fresh copy of the module: the parked value is module state, and leaking it
 * from one test into the next would make every ordering assertion here meaningless.
 */
type AmplyModule = typeof import('../index');

function createNativeModule() {
  let initialized = false;
  return {
    initialize: jest.fn(async () => {
      initialized = true;
    }),
    isInitialized: jest.fn(() => initialized),
    setAppLanguage: jest.fn(),
    setUserId: jest.fn(),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
    onSystemEvent: jest.fn(() => ({remove: jest.fn()})),
    onDeepLink: jest.fn(() => ({remove: jest.fn()})),
    onCampaignPresent: jest.fn(() => ({remove: jest.fn()})),
    /** Test-only: pretend the SDK is (or is not) up without going through initialize. */
    setInitialized(value: boolean) {
      initialized = value;
    },
  };
}

type NativeModuleMock = ReturnType<typeof createNativeModule>;

const KEYS = {appId: 'id', apiKeyPublic: 'public', apiKeySecret: 'secret'};

function load(): {Amply: AmplyModule; native: NativeModuleMock} {
  let Amply!: AmplyModule;
  const native = createNativeModule();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../nativeModule').__setNativeModule(native as never);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Amply = require('../index');
  });
  return {Amply, native};
}

describe('setAppLanguage after initialization', () => {
  it.each(['pt_BR', 'zh-TW', 'FR', 'Français'])(
    'forwards %p to the native SDK verbatim — parsing and the warning for junk are the SDK’s job',
    tag => {
      const {Amply, native} = load();
      native.setInitialized(true);

      Amply.setAppLanguage(tag);

      expect(native.setAppLanguage).toHaveBeenCalledTimes(1);
      expect(native.setAppLanguage).toHaveBeenCalledWith(tag);
    },
  );

  it('forwards null, which returns the SDK to automatic detection', () => {
    const {Amply, native} = load();
    native.setInitialized(true);

    Amply.setAppLanguage(null);

    expect(native.setAppLanguage).toHaveBeenCalledWith(null);
  });

  it('is on the default export as well', () => {
    const {Amply, native} = load();
    native.setInitialized(true);

    Amply.default.setAppLanguage('de');

    expect(native.setAppLanguage).toHaveBeenCalledWith('de');
  });
});

describe('appLanguage in the initialization config', () => {
  it('is passed through to the native initialize', async () => {
    const {Amply, native} = load();

    await Amply.initialize({...KEYS, appLanguage: 'pt_BR'});

    expect(native.initialize).toHaveBeenCalledWith(expect.objectContaining({appLanguage: 'pt_BR'}));
    expect(native.setAppLanguage).not.toHaveBeenCalled();
  });

  it('is left out of the native config when the caller did not give one', async () => {
    const {Amply, native} = load();

    await Amply.initialize(KEYS);

    const [config] = native.initialize.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(config).not.toHaveProperty('appLanguage');
  });
});

describe('setAppLanguage before initialization', () => {
  it('is not sent to a native SDK that is not up yet', () => {
    const {Amply, native} = load();

    Amply.setAppLanguage('fr');

    expect(native.setAppLanguage).not.toHaveBeenCalled();
  });

  it('reaches the SDK as the config appLanguage when initialize names none', async () => {
    const {Amply, native} = load();
    Amply.setAppLanguage('fr');

    await Amply.initialize(KEYS);

    expect(native.initialize).toHaveBeenCalledWith(expect.objectContaining({appLanguage: 'fr'}));
    expect(native.setAppLanguage).not.toHaveBeenCalled();
  });

  it('keeps only the last of several calls', async () => {
    const {Amply, native} = load();
    Amply.setAppLanguage('fr');
    Amply.setAppLanguage('de');

    await Amply.initialize(KEYS);

    expect(native.initialize).toHaveBeenCalledWith(expect.objectContaining({appLanguage: 'de'}));
  });

  it('loses to an appLanguage given to the later initialize call', async () => {
    const {Amply, native} = load();
    Amply.setAppLanguage('fr');

    await Amply.initialize({...KEYS, appLanguage: 'de'});

    expect(native.initialize).toHaveBeenCalledWith(expect.objectContaining({appLanguage: 'de'}));
    expect(native.setAppLanguage).not.toHaveBeenCalled();
  });

  it('wins over a blank appLanguage in the config, which names no language', async () => {
    const {Amply, native} = load();
    Amply.setAppLanguage('fr');

    await Amply.initialize({...KEYS, appLanguage: '  '});

    expect(native.initialize).toHaveBeenCalledWith(expect.objectContaining({appLanguage: 'fr'}));
  });

  // null cannot travel in the config — there it means "leave the setting alone" — so a parked
  // clear is applied as a call once the SDK is up.
  it('applies a parked null right after initialization', async () => {
    const {Amply, native} = load();
    Amply.setAppLanguage(null);

    await Amply.initialize(KEYS);

    const [config] = native.initialize.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(config).not.toHaveProperty('appLanguage');
    expect(native.setAppLanguage).toHaveBeenCalledTimes(1);
    expect(native.setAppLanguage).toHaveBeenCalledWith(null);
  });

  it('drops a parked null when the later initialize names a language', async () => {
    const {Amply, native} = load();
    Amply.setAppLanguage(null);

    await Amply.initialize({...KEYS, appLanguage: 'de'});

    expect(native.initialize).toHaveBeenCalledWith(expect.objectContaining({appLanguage: 'de'}));
    expect(native.setAppLanguage).not.toHaveBeenCalled();
  });

  it('survives an initialize that fails, and is used by the retry', async () => {
    const {Amply, native} = load();
    Amply.setAppLanguage('fr');
    native.initialize.mockImplementationOnce(async () => {
      throw new Error('AMP_INIT_FAILED');
    });

    await expect(Amply.initialize(KEYS)).rejects.toThrow('AMP_INIT_FAILED');
    await Amply.initialize(KEYS);

    expect(native.initialize).toHaveBeenLastCalledWith(expect.objectContaining({appLanguage: 'fr'}));
  });

  it('survives an initialize rejected for a missing key', async () => {
    const {Amply, native} = load();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    Amply.setAppLanguage('fr');

    await expect(Amply.initialize({...KEYS, apiKeySecret: ''})).rejects.toMatchObject({
      code: 'AMP_INVALID_CONFIG',
    });
    await Amply.initialize(KEYS);

    expect(native.initialize).toHaveBeenCalledTimes(1);
    expect(native.initialize).toHaveBeenCalledWith(expect.objectContaining({appLanguage: 'fr'}));
    error.mockRestore();
  });
});

describe('setAppLanguage while initialize is in flight', () => {
  it('is applied after initialization, so it wins over the config value it came after', async () => {
    const {Amply, native} = load();
    let finishInit!: () => void;
    native.initialize.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finishInit = () => {
            native.setInitialized(true);
            resolve();
          };
        }),
    );

    const init = Amply.initialize({...KEYS, appLanguage: 'de'});
    Amply.setAppLanguage('fr');
    expect(native.setAppLanguage).not.toHaveBeenCalled();
    finishInit();
    await init;

    expect(native.initialize).toHaveBeenCalledWith(expect.objectContaining({appLanguage: 'de'}));
    expect(native.setAppLanguage).toHaveBeenCalledTimes(1);
    expect(native.setAppLanguage).toHaveBeenCalledWith('fr');
  });

  // The native SDK reports itself up before the initialize promise settles, so a call made in
  // that window goes straight through. A value held from before initialize is older than it and
  // must not be replayed over it when the promise finally resolves.
  function hangInitialize(native: NativeModuleMock): {
    comeUp: () => void;
    resolve: () => void;
    reject: (error: Error) => void;
  } {
    const control = {comeUp: () => {}, resolve: () => {}, reject: (_error: Error) => {}};
    native.initialize.mockImplementationOnce(
      () =>
        new Promise<void>((resolve, reject) => {
          control.comeUp = () => native.setInitialized(true);
          control.resolve = resolve;
          control.reject = reject;
        }),
    );
    return control;
  }

  it('does not replay an older held null over a call the SDK already received', async () => {
    const {Amply, native} = load();
    Amply.setAppLanguage(null);
    const init = hangInitialize(native);

    const pending = Amply.initialize(KEYS);
    init.comeUp();
    Amply.setAppLanguage('fr');
    init.resolve();
    await pending;

    expect(native.setAppLanguage.mock.calls).toEqual([['fr']]);
  });

  it('does not replay an older held tag over a call the SDK already received', async () => {
    const {Amply, native} = load();
    const init = hangInitialize(native);

    const pending = Amply.initialize(KEYS);
    Amply.setAppLanguage('de');
    init.comeUp();
    Amply.setAppLanguage('fr');
    init.resolve();
    await pending;

    expect(native.setAppLanguage.mock.calls).toEqual([['fr']]);
  });

  it('does not hand a superseded held tag to the retry of a failed initialize', async () => {
    const {Amply, native} = load();
    Amply.setAppLanguage('de');
    const init = hangInitialize(native);

    const pending = Amply.initialize(KEYS);
    init.comeUp();
    Amply.setAppLanguage('fr');
    init.reject(new Error('AMP_INIT_FAILED'));
    await expect(pending).rejects.toThrow('AMP_INIT_FAILED');
    native.setInitialized(false);
    await Amply.initialize(KEYS);

    const [retryConfig] = native.initialize.mock.calls[1] as unknown as [Record<string, unknown>];
    expect(retryConfig).not.toHaveProperty('appLanguage');
    expect(native.setAppLanguage.mock.calls).toEqual([['fr']]);
  });
});

export {};
