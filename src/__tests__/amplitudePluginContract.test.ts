/**
 * amplyPlugin against the real Amplitude core, the oldest line we claim (2.27.0, Seabook and
 * Happens run it) and a current one (2.61.0). A failure here means Amplitude drifted from what the
 * spec assumes: fix the spec and the plugin, not the test.
 *
 * Acceptance map (spec §17): the whole file is A9, the matrix on both versions. A14 is
 * `id change during async enrichment keeps the event under the old user`, A15 is
 * `track and setOptOut in one tick forward nothing`, A16 is the two `queue ...` tests at the end.
 *
 * Bare core has no context plugin; the RN client stamps `user_id` in a `before` plugin that hops
 * first, so {@link stamper} does the same.
 */
import type {AmplitudeEventLike, AmplitudePluginLike} from '../amplitudePlugin';
import {bridgeCalls, load, names, settle} from './amplitudePluginHarness';
import type {Sdk} from './amplitudePluginHarness';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
type Result = {event?: any; code: number; message: string};
type Handle = {promise: Promise<Result>};
type Core = {
  config: {userId?: string; optOut?: boolean};
  add(plugin: object): Handle;
  remove(name: string): Handle;
  track(name: string, properties?: unknown, options?: unknown): Handle;
  identify(identify: unknown): Handle;
  setOptOut(optOut: boolean): void;
  start(): Promise<void>;
};

const VERSIONS: ReadonlyArray<[string, string]> = [
  ['2.27.0', 'amplitude-core-floor'],
  ['2.61.0', 'amplitude-core-latest'],
];
const CORE_TIMER_WAIT_MS = 50;
const OVERFLOW_EVENTS = 150;
const QUEUE_LIMIT = 100;

describe.each(VERSIONS)('amplyPlugin on real Amplitude core %s', (version, alias) => {
  const {AmplitudeCore, Config, Identify} = require(alias);
  const isOldCore = version === '2.27.0';
  let sdk: Sdk;

  class TestCore extends AmplitudeCore {
    async start(): Promise<void> {
      await this._init(new Config({apiKey: 'key', logLevel: 0,transportProvider: {send: async () => null}}));
    }
  }

  /** The RN client's context plugin: hops, then stamps the user the config holds by then. */
  const stamper = (core: () => Core) => ({
    name: 'context-stand-in',
    type: 'before',
    execute: async (event: AmplitudeEventLike) => {
      await settle();
      return {user_id: core().config.userId, ...event};
    },
  });

  const makeCore = (): Core => {
    const core = new TestCore() as unknown as Core;
    core.add(stamper(() => core));
    return core;
  };

  /** A started client with the stand-in already in. */
  const boot = async (...plugins: object[]): Promise<Core> => {
    const core = makeCore();
    await core.start();
    await Promise.all(plugins.map((plugin) => core.add(plugin).promise));
    return core;
  };

  const spy = (name = 'spy') => {
    const seen: string[] = [];
    return {
      seen,
      plugin: {
        name,
        type: 'destination',
        setup: async () => undefined,
        execute: async (event: AmplitudeEventLike) => {
          seen.push(event.event_type);
          return {event, code: 200, message: 'spy'};
        },
      },
    };
  };

  const amply = (options?: Parameters<Sdk['Amply']['amplyPlugin']>[0]): AmplitudePluginLike =>
    sdk.Amply.amplyPlugin(options);

  beforeEach(() => {
    sdk = load();
  });

  test('loads the pinned core', () => {
    // Arrange / Act
    const installed = require(`${alias}/package.json`).version;
    // The two versions in the test output, so a wrong alias is visible in the log.
    // eslint-disable-next-line no-console
    console.log(`Amplitude core under test: ${alias} -> @amplitude/analytics-core ${installed}`);

    // Assert
    expect(installed).toBe(version);
  });

  test('add before init works', async () => {
    // Arrange
    const core = makeCore();
    core.add(amply());

    // Act
    await core.start();
    await core.track('early').promise;
    await settle();

    // Assert
    expect(names(sdk.forwardEvent)).toEqual(['early']);
  });

  test('second destination still receives every event', async () => {
    // Arrange
    const other = spy('other');
    const core = await boot(amply({filter: (event) => event.event_type !== 'private'}), other.plugin);

    // Act
    await core.track('public').promise;
    await core.track('private').promise;
    await settle();

    // Assert
    expect(names(sdk.forwardEvent)).toEqual(['public']);
    expect(other.seen).toEqual(['public', 'private']);
  });

  test('add twice keeps one plugin', async () => {
    // Arrange
    const plugin = amply();
    const core = await boot();

    // Act
    await core.add(plugin).promise;
    await core.add(plugin).promise;
    await core.track('once').promise;
    await settle();

    // Assert
    expect(names(sdk.forwardEvent)).toEqual(['once']);
  });

  test('two add calls in one tick forward once', async () => {
    // Arrange
    const core = await boot();

    // Act: core 2.27 lets both through, 2.61 closes the window.
    await Promise.all([core.add(amply()).promise, core.add(amply()).promise]);
    await core.track('once').promise;
    await settle();

    // Assert
    expect(names(sdk.forwardEvent)).toEqual(['once']);
  });

  test('track and setOptOut in one tick forward nothing', async () => {
    // A15. Amplitude checks opt-out at track(), execute runs later with config.optOut already true.
    // Arrange
    const core = await boot(amply());

    // Act
    const pending = core.track('same_tick').promise;
    core.setOptOut(true);
    await pending;
    await settle();

    // Assert
    expect(names(sdk.forwardEvent)).toEqual([]);
  });

  test('id change during async enrichment keeps the event under the old user', async () => {
    // A14. The event carries A, the config says B by the time the slow plugin lets it go.
    // Arrange
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let isHolding = false;
    let hasEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      hasEntered = resolve;
    });
    const slow = {
      name: 'slow',
      type: 'enrichment',
      execute: async (event: AmplitudeEventLike) => {
        if (isHolding) {
          hasEntered();
          await gate;
        }
        return event;
      },
    };
    const core = await boot(slow, amply());
    core.config.userId = 'A';
    await core.track('first').promise;

    // Act
    isHolding = true;
    const held = core.track('held').promise;
    await entered; // stamped with A by now, and parked in the slow plugin
    core.config.userId = 'B';
    release();
    await held;
    isHolding = false;
    await core.track('next').promise;
    await settle();

    // Assert
    expect(bridgeCalls(sdk)).toEqual(['id:A', 'event:first', 'event:held', 'id:B', 'event:next']);
  });

  test('nested change in transform does not reach the other destination', async () => {
    // Arrange
    const seen: unknown[] = [];
    const other = {
      name: 'other',
      type: 'destination',
      execute: async (event: AmplitudeEventLike) => {
        seen.push(JSON.parse(JSON.stringify(event.event_properties)));
        return {event, code: 200, message: 'other'};
      },
    };
    const core = await boot(
      amply({
        transform: (event) => {
          (event.event_properties as any).nested.value = 'changed';
          (event.event_properties as any).added = true;
          return {name: 'renamed'};
        },
        filter: (event) => {
          (event.event_properties as any).nested.value = 'changed by filter';
          return true;
        },
      }),
      other,
    );

    // Act
    await core.track('plain', {nested: {value: 'original'}}).promise;
    await settle();

    // Assert
    expect(names(sdk.forwardEvent)).toEqual(['renamed']);
    expect(seen).toEqual([{nested: {value: 'original'}}]);
  });

  test('optOut event never reaches the plugin', async () => {
    // Arrange
    const plugin = amply();
    const executed = jest.spyOn(plugin, 'execute');
    const core = await boot(plugin);

    // Act
    core.setOptOut(true);
    await settle();
    const result = await core.track('after_opt_out').promise;
    await settle();

    // Assert
    expect(executed).not.toHaveBeenCalled();
    expect(result.code).toBe(0);
    expect(names(sdk.forwardEvent)).toEqual([]);
  });

  test('$identify shape is what the plugin parses', async () => {
    // Arrange
    const plugin = amply({userProperties: ['plan', 'trial', 'n']});
    const executed = jest.spyOn(plugin, 'execute');
    const core = await boot(plugin);

    // Act
    await core.identify(new Identify().set('plan', 'pro').set('n', 1.5).unset('trial').add('count', 1)).promise;
    await settle();

    // Assert
    const event = executed.mock.calls[0][0];
    expect(event.event_type).toBe('$identify');
    expect(event.event_properties).toBeUndefined();
    expect(Object.keys(event.user_properties ?? {}).sort()).toEqual(['$add', '$set', '$unset']);
    expect(bridgeCalls(sdk)).toEqual(['set:{"plan":"pro","n":1.5}', 'unset:trial']);
  });

  test('throwing filter leaves track resolved', async () => {
    // Arrange
    const other = spy('other');
    const core = await boot(
      amply({
        filter: () => {
          throw new Error('host bug');
        },
      }),
      other.plugin,
    );
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    // Act
    const result = await core.track('survives').promise;
    await settle();

    // Assert
    expect(result.code).toBe(200);
    expect(other.seen).toEqual(['survives']);
    expect(names(sdk.forwardEvent)).toEqual([]);
    warn.mockRestore();
  });

  // Plugin lifecycle on the real timeline. Where the two versions differ the table says so.
  describe('listing', () => {
    test('add, remove, add of one object in one tick forwards every event', async () => {
      // Arrange
      const plugin = amply();
      const core = await boot();

      // Act
      await Promise.all([core.add(plugin).promise, core.remove('amply').promise, core.add(plugin).promise]);
      await core.track('one').promise;
      await core.track('two').promise;
      await settle();

      // Assert
      expect(names(sdk.forwardEvent)).toEqual(['one', 'two']);
    });

    test('same object added twice forwards each event once, then remove once, remove twice', async () => {
      // Arrange
      const plugin = amply();
      const core = await boot();
      await Promise.all([core.add(plugin).promise, core.add(plugin).promise]);

      // Act
      await core.track('both_listed').promise;
      await settle();
      const afterAdds = names(sdk.forwardEvent);

      await core.remove('amply').promise;
      await core.track('after_remove_once').promise;
      await settle();
      const afterOneRemove = names(sdk.forwardEvent);

      await core.remove('amply').promise;
      await core.track('after_remove_twice').promise;
      await settle();
      const afterTwoRemoves = names(sdk.forwardEvent);

      // Assert: 2.27 listed the object twice, so one remove leaves it forwarding; 2.61 listed it once.
      expect(afterAdds).toEqual(['both_listed']);
      expect(afterOneRemove).toEqual(isOldCore ? ['both_listed', 'after_remove_once'] : ['both_listed']);
      expect(afterTwoRemoves).toEqual(afterOneRemove);
    });

    test('remove then add of a fresh plugin in one tick forwards', async () => {
      // Arrange
      const core = await boot(amply());

      // Act
      await Promise.all([core.remove('amply').promise, core.add(amply()).promise]);
      await core.track('fresh').promise;
      await settle();

      // Assert
      expect(names(sdk.forwardEvent)).toEqual(['fresh']);
    });

    test('two different plugins never both forward', async () => {
      // Arrange
      const core = await boot();

      // Act
      await Promise.all([core.add(amply()).promise, core.add(amply()).promise]);
      await core.track('a').promise;
      await core.track('b').promise;
      await settle();

      // Assert
      expect(names(sdk.forwardEvent)).toEqual(['a', 'b']);
    });
  });

  describe('what track resolves to', () => {
    const failing = {
      name: 'failing',
      type: 'destination',
      execute: async () => {
        throw new Error('destination down');
      },
    };

    test('amply listed first: track promise result', async () => {
      // Core resolves `track` with the FIRST destination's result and swallows the others'
      // failures. Pinned so the docs can say: with Amply first, the host sees Amply's 200.
      // Arrange
      const core = await boot(amply(), failing);

      // Act
      const result = await core.track('listed_first').promise;
      await settle();

      // Assert
      expect(names(sdk.forwardEvent)).toEqual(['listed_first']);
      expect({code: result.code, message: result.message}).toEqual({code: 200, message: 'amply'});
      expect(result.event.event_type).toBe('listed_first');
    });

    test('failing destination listed first: track promise result', async () => {
      // The other side of the same rule: Amply still forwards, the host sees the failure.
      // Arrange
      const core = await boot(failing, amply());

      // Act
      const result = await core.track('listed_second').promise;
      await settle();

      // Assert
      expect(names(sdk.forwardEvent)).toEqual(['listed_second']);
      expect({code: result.code, message: result.message}).toEqual({
        code: 0,
        message: 'Error: destination down',
      });
    });
  });

  describe('event_properties that core itself cannot handle', () => {
    const cyclic = () => {
      const properties: Record<string, unknown> = {plan: 'pro', count: 2};
      properties.self = properties;
      return properties;
    };

    test('cycle in event_properties reaches the bridge as flat values', async () => {
      // Arrange
      const core = await boot(amply());
      // Core drops the rejection of its own `apply`; this is where it can be seen.
      const timeline = (core as any).timeline;
      const apply = timeline.apply.bind(timeline);
      const coreFailures: string[] = [];
      timeline.apply = (item: unknown) =>
        apply(item).catch((error: Error) => {
          coreFailures.push(error.message);
        });
      let outcome = 'pending';
      core.track('cycle', cyclic()).promise.then(() => {
        outcome = 'resolved';
      });

      // Act: core schedules its queue with timers, give it a few turns.
      await new Promise((resolve) => setTimeout(resolve, CORE_TIMER_WAIT_MS));
      await settle();

      // Assert
      if (isOldCore) {
        // 2.27 stringifies the event for its own debug log before any destination runs, throws,
        // and `track` never settles. Amply is never reached, so it cannot make this worse.
        expect(coreFailures).toEqual([expect.stringContaining('circular')]);
        expect(outcome).toBe('pending');
        expect(sdk.forwardEvent).not.toHaveBeenCalled();
      } else {
        expect(coreFailures).toEqual([]);
        expect(outcome).toBe('resolved');
        expect(sdk.forwardEvent.mock.calls.map(([payload]) => payload.properties)).toEqual([
          {plan: 'pro', count: 2},
        ]);
      }
    });
  });

  describe('ordering', () => {
    test('un-awaited track then reset delivers the event after the logout', async () => {
      // A known limit, pinned: reset() is "config.userId = undefined" in the RN client. The stamper
      // hops, so the event is stamped after the logout and travels as the logged-out user.
      // Arrange
      const core = await boot(amply());
      core.config.userId = 'A';
      await core.track('before').promise;

      // Act
      const pending = core.track('purchase').promise;
      core.config.userId = undefined;
      await pending;
      await settle();

      // Assert
      expect(bridgeCalls(sdk)).toEqual(['id:A', 'event:before', 'id:null', 'event:purchase']);
    });
  });

  describe('queue (A16)', () => {
    test('queue overflow keeps the id', async () => {
      // Arrange: Amply is not up yet, 150 events pile up behind the login.
      const down = load({}, false);
      sdk = down;
      const core = await boot(amply());
      core.config.userId = 'A';

      // Act
      await Promise.all(Array.from({length: OVERFLOW_EVENTS}, (_, index) => core.track(`e${index}`).promise));
      down.state.isUp = true;
      down.Amply.initialize.length; // the SDK is up as soon as isInitialized says so
      await down.Amply.initialize(
        {apiKeyPublic: 'pub', apiKeySecret: 'sec', appId: 'app'} as never,
      );
      await settle();

      // Assert
      const calls = bridgeCalls(down);
      expect(calls).toHaveLength(QUEUE_LIMIT);
      expect(calls[0]).toBe('id:A');
      expect(calls[1]).toBe(`event:e${OVERFLOW_EVENTS - QUEUE_LIMIT + 1}`);
    });

    test('opt-out clears what is parked and the id comes back after opt-in', async () => {
      // Arrange
      const down = load({}, false);
      sdk = down;
      const core = await boot(amply());
      core.config.userId = 'A';
      await core.track('held').promise;

      // Act
      core.setOptOut(true);
      await settle();
      core.setOptOut(false);
      down.state.isUp = true;
      await settle();
      await core.track('after_opt_in').promise;
      await settle();

      // Assert
      expect(bridgeCalls(down)).toEqual(['id:A', 'event:after_opt_in']);
    });
  });
});
