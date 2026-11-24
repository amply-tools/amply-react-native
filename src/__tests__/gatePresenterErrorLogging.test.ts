import * as Amply from '../index';
import {__setNativeModule} from '../nativeModule';

type CampaignPresentEvent = {
  url: string;
  params: Record<string, unknown>;
  info: Record<string, unknown>;
  mediationId: string;
};

/**
 * What a gate presenter throws is host data, and it stays out of the console — the same rule the
 * Amplitude plugin keeps for its callbacks (amplitudePluginCallbacks.test.ts). A host's console
 * often feeds crash-reporter breadcrumbs, so `Error('Invalid email: person@example.test')` would
 * otherwise travel to a third party.
 */
describe('a gate presenter that throws', () => {
  const secret = 'person@example.test';
  let emitters: ((e: CampaignPresentEvent) => void)[];

  const mockNativeModule = {
    isInitialized: jest.fn(() => true),
    getLogLevel: jest.fn(() => 'none'),
    registerGate: jest.fn(),
    unregisterGate: jest.fn(),
    resolveCampaign: jest.fn(),
    onCampaignPresent: jest.fn(),
    onDeepLink: jest.fn(),
    onSystemEvent: jest.fn(),
  };

  beforeEach(() => {
    emitters = [];
    mockNativeModule.onCampaignPresent.mockImplementation((listener: (e: CampaignPresentEvent) => void) => {
      emitters.push(listener);
      return {remove: jest.fn()};
    });
    __setNativeModule(mockNativeModule as never);
  });

  afterEach(() => {
    Amply.removeAllListeners();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    __setNativeModule(null);
  });

  function present(): void {
    emitters.forEach((emit) =>
      emit({url: 'stillframe://ad', params: {}, info: {campaignId: 'c1'}, mediationId: 'm1'}),
    );
  }

  /** What a console would print for each argument, including an Error's name and message. */
  function asPrinted(arg: unknown): string {
    if (!(arg instanceof Error)) {
      return String(arg);
    }
    let name: string;
    try {
      name = String(arg.name);
    } catch {
      name = '<name threw>';
    }
    return `${name}: ${arg.message}`;
  }

  function everythingLogged(...spies: jest.SpyInstance[]): string {
    return spies
      .flatMap((spy) => spy.mock.calls)
      .flat()
      .map(asPrinted)
      .join(' ');
  }

  it.each(['none', 'debug'])('keeps the thrown message out of the console (log level %s)', async (level) => {
    mockNativeModule.getLogLevel.mockReturnValue(level);
    const spies = (['warn', 'error', 'log', 'info', 'debug'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => {}),
    );
    await Amply.registerGate('stillframe://ad', () => {
      throw new Error(`Invalid email: ${secret}`);
    });

    present();

    expect(everythingLogged(...spies)).not.toContain(secret);
    // Still reported, and still fail-open.
    expect(spies[0]).toHaveBeenCalledTimes(1);
    expect(mockNativeModule.resolveCampaign).toHaveBeenCalledWith('m1', 'Unavailable');
  });

  it('names the error class so the integrator can still find the bug', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await Amply.registerGate('stillframe://ad', () => {
      throw new TypeError(`Invalid email: ${secret}`);
    });

    present();

    expect(everythingLogged(warn)).toContain('TypeError');
  });

  it.each([
    ['a non-Error value', () => `Invalid email: ${secret}`],
    ['an Error whose name carries data', () => Object.assign(new Error('x'), {name: `Invalid ${secret}`})],
    [
      'an Error whose name getter throws',
      () => {
        const error = new Error('x');
        Object.defineProperty(error, 'name', {
          get() {
            throw new Error(secret);
          },
        });
        return error;
      },
    ],
  ])('stays fixed for %s', async (_, makeThrown) => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await Amply.registerGate('stillframe://ad', () => {
      throw makeThrown();
    });

    present();

    expect(everythingLogged(warn)).not.toContain(secret);
    expect(mockNativeModule.resolveCampaign).toHaveBeenCalledWith('m1', 'Unavailable');
  });
});
