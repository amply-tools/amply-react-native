/**
 * `handleUrl` hands an incoming link to the native SDK and reports whether the SDK recognised it.
 * It is synchronous, and it never throws: an older native build without the method answers false.
 */
type SdkModule = typeof import('../index');

function loadWith(native: Record<string, unknown>): SdkModule {
  // Absent isInitialized means "SDK up" for the plain pass-through tests below.
  const withState = {isInitialized: () => true, ...native};
  let Amply!: SdkModule;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../nativeModule').__setNativeModule(withState as never);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Amply = require('../index');
  });
  return Amply;
}

const DEBUG_URL = 'myapp://amply-debug/campaign?t=abc';

describe('handleUrl', () => {
  it('passes the DEBUG_URL to the native module and returns its answer', () => {
    const handleUrl = jest.fn(() => true);
    const Amply = loadWith({handleUrl});

    expect(Amply.handleUrl(DEBUG_URL)).toBe(true);
    expect(handleUrl).toHaveBeenCalledWith(DEBUG_URL);
  });

  it('returns false when the native module does not recognise the DEBUG_URL', () => {
    const Amply = loadWith({handleUrl: jest.fn(() => false)});

    expect(Amply.handleUrl('myapp://settings')).toBe(false);
  });

  it('returns false without throwing when the native module has no handleUrl', () => {
    const Amply = loadWith({});

    expect(Amply.handleUrl(DEBUG_URL)).toBe(false);
  });

  it('returns false without throwing when the native call throws', () => {
    const Amply = loadWith({
      handleUrl: jest.fn(() => {
        throw new Error('boom');
      }),
    });

    expect(Amply.handleUrl(DEBUG_URL)).toBe(false);
  });

  it('returns false for a non-string DEBUG_URL', () => {
    const handleUrl = jest.fn(() => true);
    const Amply = loadWith({handleUrl});

    expect(Amply.handleUrl(null as never)).toBe(false);
    expect(handleUrl).not.toHaveBeenCalled();
  });

  it('is on the default export', () => {
    const Amply = loadWith({handleUrl: jest.fn(() => true)});

    expect(Amply.default.handleUrl(DEBUG_URL)).toBe(true);
  });
});

describe('handleUrl before initialize', () => {
  function loadUninitialised(initialize?: () => Promise<void>) {
    let up = false;
    const handleUrl = jest.fn(() => true);
    const native = {
      handleUrl,
      isInitialized: jest.fn(() => up),
      initialize: jest.fn(
        initialize ??
          (async () => {
            up = true;
          }),
      ),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
    return {Amply: loadWith(native), handleUrl};
  }
  const KEYS = {appId: 'id', apiKeyPublic: 'public', apiKeySecret: 'secret'};

  it('parks a debug link, returns true and does not call native', () => {
    const {Amply, handleUrl} = loadUninitialised();

    expect(Amply.handleUrl(DEBUG_URL)).toBe(true);
    expect(handleUrl).not.toHaveBeenCalled();
  });

  it('replays the parked link to native once after initialize', async () => {
    const {Amply, handleUrl} = loadUninitialised();
    Amply.handleUrl(DEBUG_URL);

    await Amply.initialize(KEYS);

    expect(handleUrl).toHaveBeenCalledTimes(1);
    expect(handleUrl).toHaveBeenCalledWith(DEBUG_URL);
  });

  it('replays only the newer of two parked links', async () => {
    const {Amply, handleUrl} = loadUninitialised();
    Amply.handleUrl('myapp://amply-debug/campaign?t=old');
    Amply.handleUrl('myapp://amply-debug/campaign?t=new');

    await Amply.initialize(KEYS);

    expect(handleUrl).toHaveBeenCalledTimes(1);
    expect(handleUrl).toHaveBeenCalledWith('myapp://amply-debug/campaign?t=new');
  });

  it('does not park a non-debug link', async () => {
    const {Amply, handleUrl} = loadUninitialised();

    expect(Amply.handleUrl('myapp://settings')).toBe(false);
    await Amply.initialize(KEYS);

    expect(handleUrl).not.toHaveBeenCalled();
  });

  it('drops the parked link when initialize fails', async () => {
    const {Amply, handleUrl} = loadUninitialised(async () => {
      throw new Error('init failed');
    });
    Amply.handleUrl(DEBUG_URL);

    await expect(Amply.initialize(KEYS)).rejects.toThrow('init failed');

    expect(handleUrl).not.toHaveBeenCalled();
  });

  it.each([
    '',
    'not a url',
    'myapp://amply-debug/campaign',
    'myapp://amply-debug/campaign?t=',
    'myapp://amply-debug/other?t=abc',
    'myapp://other/campaign?t=abc',
    'amply-debug/campaign?t=abc',
    '://amply-debug/campaign?t=abc',
  ])('returns false without throwing for %p', async url => {
    const {Amply, handleUrl} = loadUninitialised();

    expect(Amply.handleUrl(url)).toBe(false);
    await Amply.initialize(KEYS);

    expect(handleUrl).not.toHaveBeenCalled();
  });
});

export {};
