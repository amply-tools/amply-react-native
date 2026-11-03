/**
 * Who Amply thinks the user is. A wrong id costs campaign touches and attribution, so §7 of the
 * spec is spelled out here row by row.
 */
import type {AmplitudeEventLike, AmplyPluginOptions} from '../amplitudePlugin';
import {
  bridgeCalls,
  CONFIG,
  coreClient,
  eventFor,
  identifyOf,
  install,
  list,
  load,
  names,
  settle,
  unlist,
} from './amplitudePluginHarness';
import type {Sdk} from './amplitudePluginHarness';

type Config = {optOut: boolean; userId?: string};

/** An Amplitude that stamps events with its current user id, as its context plugin does. */
async function amplitude(sdk: Sdk, options?: AmplyPluginOptions, client: object = {}) {
  const config: Config = {optOut: false};
  const plugin = await install(sdk.Amply, options, client, config);
  const track = async (name: string): Promise<void> => {
    await plugin.execute(eventFor(name, config.userId));
    await settle();
  };
  return {config, plugin, track};
}

describe('amplyPlugin identity', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('§7, one row each', () => {
    it('knew nothing, Amplitude empty: nothing, absence is not a logout', async () => {
      const sdk = load();
      const {track} = await amplitude(sdk);

      await track('first');
      await track('second');

      expect(sdk.setUserId).not.toHaveBeenCalled();
    });

    it('knew nothing, Amplitude A: setUserId(A)', async () => {
      const sdk = load();
      const {config, track} = await amplitude(sdk);

      config.userId = 'A';
      await track('first');

      expect(sdk.setUserId.mock.calls).toEqual([['A']]);
    });

    it('knew A, Amplitude A: nothing more', async () => {
      const sdk = load();
      const {config, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('first');

      await track('second');

      expect(sdk.setUserId.mock.calls).toEqual([['A']]);
    });

    it('knew A, Amplitude B: setUserId(B)', async () => {
      const sdk = load();
      const {config, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('first');

      config.userId = 'B';
      await track('second');

      expect(sdk.setUserId.mock.calls).toEqual([['A'], ['B']]);
    });

    it('knew A, Amplitude empty: setUserId(null), once', async () => {
      const sdk = load();
      const {config, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('first');

      config.userId = undefined;
      await track('after-reset');

      expect(sdk.setUserId.mock.calls).toEqual([['A'], [null]]);
    });

    it('empty after logout, Amplitude empty: nothing more', async () => {
      const sdk = load();
      const {config, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('first');
      config.userId = undefined;
      await track('after-reset');

      await track('still-logged-out');

      expect(sdk.setUserId.mock.calls).toEqual([['A'], [null]]);
    });

    it('empty after logout, Amplitude B: setUserId(B)', async () => {
      const sdk = load();
      const {config, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('first');
      config.userId = undefined;
      await track('after-reset');

      config.userId = 'B';
      await track('next-login');

      expect(sdk.setUserId.mock.calls).toEqual([['A'], [null], ['B']]);
    });
  });

  describe('when the id is applied', () => {
    it('identity is reconciled only when event.user_id equals config.userId', async () => {
      const sdk = load();
      const {config, plugin} = await amplitude(sdk);
      config.userId = 'A';

      await plugin.execute(eventFor('stamped-otherwise', 'other'));
      await plugin.execute(eventFor('not-stamped'));
      await settle();

      expect(sdk.setUserId).not.toHaveBeenCalled();
    });

    it('per-event user_id override changes nothing', async () => {
      const sdk = load();
      const {config, plugin, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('first');

      await plugin.execute(eventFor('override', 'someone-else'));
      await track('next');

      expect(sdk.setUserId.mock.calls).toEqual([['A']]);
      expect(names(sdk.forwardEvent)).toEqual(['first', 'override', 'next']);
    });

    it('event stamped A while config is B goes under A, B applies on the next event', async () => {
      const sdk = load();
      const {config, plugin, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('first');

      config.userId = 'B';
      await plugin.execute(eventFor('held-in-enrichment', 'A'));
      await track('next');

      expect(bridgeCalls(sdk)).toEqual(['id:A', 'event:first', 'event:held-in-enrichment', 'id:B', 'event:next']);
    });

    it('rewritten user_id never sets an id and warns once in debug', async () => {
      const sdk = load();
      const {config, plugin} = await amplitude(sdk, {debug: true});
      config.userId = 'A';

      await plugin.execute(eventFor('first', 'hash-of-A'));
      await plugin.execute(eventFor('second', 'hash-of-A'));
      await settle();

      expect(sdk.setUserId).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('syncUserId'));
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('hash-of-A'));
    });

    it('a mismatch stays quiet without debug', async () => {
      const sdk = load();
      const {config, plugin} = await amplitude(sdk);
      config.userId = 'A';

      await plugin.execute(eventFor('first', 'hash-of-A'));
      await settle();

      expect(warn).not.toHaveBeenCalled();
    });

    it('syncUserId false never calls setUserId', async () => {
      const sdk = load();
      const {config, track} = await amplitude(sdk, {syncUserId: false});
      config.userId = 'A';
      await track('login');
      config.userId = undefined;
      await track('logout');

      expect(sdk.setUserId).not.toHaveBeenCalled();
      expect(names(sdk.forwardEvent)).toEqual(['login', 'logout']);
    });

    it('goes before the event that revealed it', async () => {
      const sdk = load();
      const {config, track} = await amplitude(sdk);

      config.userId = 'A';
      await track('Purchase');

      expect(bridgeCalls(sdk)).toEqual(['id:A', 'event:Purchase']);
    });

    it('event before logout is delivered before setUserId(null)', async () => {
      const sdk = load({}, false);
      const {config, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('Purchase');
      config.userId = undefined;
      await track('after-reset');

      await sdk.Amply.initialize(CONFIG);
      await settle();

      expect(bridgeCalls(sdk)).toEqual(['id:A', 'event:Purchase', 'id:null', 'event:after-reset']);
    });

    /**
     * A known limit, not a wish. Core applies on a timer and the RN context plugin awaits before it
     * stamps, so this event arrives stamped empty, the same as one made after the logout. No
     * destination plugin can tell them apart.
     */
    it('un-awaited track then reset delivers the event after the logout', async () => {
      const sdk = load();
      const {config, plugin, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('first');
      const stampAfterHop = async (event: AmplitudeEventLike): Promise<AmplitudeEventLike> => {
        await Promise.resolve();
        return {...event, user_id: config.userId};
      };

      const tracked = stampAfterHop(eventFor('Purchase')).then((event) => plugin.execute(event));
      config.userId = undefined;
      await tracked;
      await settle();

      expect(bridgeCalls(sdk)).toEqual(['id:A', 'event:first', 'id:null', 'event:Purchase']);
    });

    it.each<[string, Partial<AmplyPluginOptions>, string]>([
      ['the filter drops', {filter: () => false}, 'Purchase'],
      ['transform drops', {transform: () => null as never}, 'Purchase'],
      ['autocapture leaves out', {}, '[Amplitude] Network Request'],
      ['is a service event', {}, 'session_start'],
    ])('runs for an event that %s', async (_, options, name) => {
      const sdk = load();
      const {config, track} = await amplitude(sdk, options);

      config.userId = 'A';
      await track(name);

      expect(bridgeCalls(sdk)).toEqual(['id:A']);
    });

    it('does nothing while opted out', async () => {
      const sdk = load();
      const {config, track} = await amplitude(sdk);
      config.userId = 'A';
      config.optOut = true;

      await track('same-tick-as-opt-out');

      expect(sdk.setUserId).not.toHaveBeenCalled();
    });

    it('an inert plugin stays out of it', async () => {
      const sdk = load();
      const client = {};
      await amplitude(sdk, undefined, client);
      const inert = await amplitude(sdk, undefined, client);

      inert.config.userId = 'A';
      await inert.track('ignored');

      expect(sdk.setUserId).not.toHaveBeenCalled();
    });

    it('one object listed twice applies the id once', async () => {
      const sdk = load();
      const client = coreClient();
      const config: Config = {optOut: false, userId: 'A'};
      const plugin = sdk.Amply.amplyPlugin();
      await list(plugin, client, config);
      await list(plugin, client, config);

      await Promise.all([plugin.execute(eventFor('one', 'A')), plugin.execute(eventFor('one', 'A'))]);
      await settle();

      expect(bridgeCalls(sdk)).toEqual(['id:A', 'event:one']);
    });

    it.each<[string, unknown]>([
      ['an empty string', ''],
      ['null', null],
    ])('%s in Amplitude is empty', async (_, nobody) => {
      const sdk = load();
      const {config, plugin, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('first');

      config.userId = nobody as string;
      await plugin.execute(eventFor('after-reset', nobody as string));
      await settle();

      expect(sdk.setUserId.mock.calls).toEqual([['A'], [null]]);
    });

    it('the id reaches the bridge as a string whatever the host set', async () => {
      const sdk = load();
      const {config, plugin} = await amplitude(sdk);

      config.userId = 42 as unknown as string;
      await plugin.execute({...eventFor('first'), user_id: 42 as unknown as string});
      await settle();

      expect(sdk.setUserId.mock.calls).toEqual([['42']]);
    });

    it('a setUserId that throws is tried again on the next event', async () => {
      const sdk = load();
      sdk.setUserId.mockImplementationOnce(() => {
        throw new Error('bridge threw');
      });
      const {config, track} = await amplitude(sdk);
      config.userId = 'A';

      await track('first');
      await track('second');

      expect(sdk.setUserId.mock.calls).toEqual([['A'], ['A']]);
      expect(names(sdk.forwardEvent)).toEqual(['first', 'second']);
    });

    it('a failed id with its own id queued again keeps a later logout', async () => {
      const sdk = load({}, false);
      sdk.setUserId.mockImplementationOnce(() => {
        throw new Error('bridge threw');
      });
      const {config, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('first');
      config.userId = 'B';
      await track('second');
      config.userId = 'A';
      await track('third');
      await sdk.Amply.initialize(CONFIG);
      await settle();

      config.userId = undefined;
      await track('after-reset');

      expect(sdk.setUserId.mock.calls).toEqual([['A'], ['B'], ['A'], [null]]);
    });

    it('a failed id parked ahead of an event is tried again, an event does not count as an id', async () => {
      const sdk = load({}, false);
      sdk.setUserId.mockImplementationOnce(() => {
        throw new Error('bridge threw');
      });
      const {config, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('parked');

      await sdk.Amply.initialize(CONFIG);
      await track('next');

      expect(sdk.setUserId.mock.calls).toEqual([['A'], ['A']]);
    });

    it('a failed id is tried again whatever another plugin has queued', async () => {
      const sdk = load({}, false);
      sdk.setUserId.mockImplementationOnce(() => {
        throw new Error('bridge threw');
      });
      const first = await amplitude(sdk);
      const second = await amplitude(sdk);
      first.config.userId = 'A';
      second.config.userId = 'B';
      await first.track('first-parked');
      await second.track('second-parked');

      await sdk.Amply.initialize(CONFIG);
      await first.track('first-next');

      expect(sdk.setUserId.mock.calls).toEqual([['A'], ['B'], ['A']]);
    });

    it('a setUserId that throws is reported in debug', async () => {
      const sdk = load();
      sdk.setUserId.mockImplementationOnce(() => {
        throw new Error('bridge threw');
      });
      const {config, track} = await amplitude(sdk, {debug: true});
      config.userId = 'A';

      await track('first');

      expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('bridge threw'));
    });

    it('a failed id does not override a newer one already on its way', async () => {
      const sdk = load({}, false);
      sdk.setUserId.mockImplementationOnce(() => {
        throw new Error('bridge threw');
      });
      const {config, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('first');
      config.userId = 'B';
      await track('second');

      await sdk.Amply.initialize(CONFIG);
      await settle();
      await track('third');

      expect(sdk.setUserId.mock.calls).toEqual([['A'], ['B']]);
    });
  });

  describe('the queue, §9', () => {
    it('holds 100 items and drops the oldest event, identity items stay', async () => {
      const sdk = load({}, false);
      const {config, track} = await amplitude(sdk);

      config.userId = 'A';
      for (let i = 0; i < 150; i += 1) {
        await track(`e${i}`);
      }
      await sdk.Amply.initialize(CONFIG);
      await settle();

      const lastEvents = Array.from({length: 99}, (_, i) => `event:e${i + 51}`);
      expect(bridgeCalls(sdk)).toEqual(['id:A', ...lastEvents]);
    });

    it('a full queue gives up events before property items', async () => {
      const sdk = load({}, false);
      const {plugin} = await amplitude(sdk, {userProperties: ['plan']});
      await plugin.execute(eventFor('oldest'));
      await plugin.execute(identifyOf({$set: {plan: 'pro'}}));

      for (let i = 0; i < 100; i += 1) {
        await plugin.execute(eventFor(`e${i}`));
      }
      await sdk.Amply.initialize(CONFIG);
      await settle();

      expect(bridgeCalls(sdk).slice(0, 2)).toEqual(['set:{"plan":"pro"}', 'event:e1']);
    });

    it('with no events left drops the oldest property item, identity still stays', async () => {
      const sdk = load({}, false);
      const {config, plugin} = await amplitude(sdk, {userProperties: ['n']});

      config.userId = 'A';
      for (let n = 0; n < 150; n += 1) {
        await plugin.execute(identifyOf({$set: {n}}, 'A'));
      }
      await sdk.Amply.initialize(CONFIG);
      await settle();

      const lastItems = Array.from({length: 99}, (_, i) => `set:{"n":${i + 51}}`);
      expect(bridgeCalls(sdk)).toEqual(['id:A', ...lastItems]);
    });

    it('with nothing but identity left drops the oldest, the latest id still arrives', async () => {
      const sdk = load({}, false);
      const {config, plugin} = await amplitude(sdk);

      for (let i = 0; i < 101; i += 1) {
        config.userId = `u${i}`;
        await plugin.execute(identifyOf({}, config.userId));
      }
      await sdk.Amply.initialize(CONFIG);
      await settle();

      expect(sdk.setUserId).toHaveBeenCalledTimes(100);
      expect(sdk.setUserId.mock.calls[0]).toEqual(['u1']);
      expect(sdk.setUserId).toHaveBeenLastCalledWith('u100');
    });

    it('opt-out clearing forgets an undelivered id and sends it again after opt-in', async () => {
      const sdk = load({}, false);
      const {config, plugin, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('parked');

      await plugin.onOptOutChanged(true);
      await plugin.onOptOutChanged(false);
      await sdk.Amply.initialize(CONFIG);
      await track('after-opt-in');

      expect(bridgeCalls(sdk)).toEqual(['id:A', 'event:after-opt-in']);
    });

    it('opt-out clearing keeps a delivered id, it is not sent twice', async () => {
      const sdk = load();
      const {config, plugin, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('delivered');

      await plugin.onOptOutChanged(true);
      await plugin.onOptOutChanged(false);
      await track('after-opt-in');

      expect(sdk.setUserId.mock.calls).toEqual([['A']]);
    });

    it('opt-out clearing goes back to the delivered id, not to nothing', async () => {
      const sdk = load();
      const {config, plugin, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('delivered');
      sdk.state.isUp = false;
      config.userId = 'B';
      await track('parked');

      await plugin.onOptOutChanged(true);
      sdk.state.isUp = true;
      config.userId = 'A';
      await track('back-to-A');

      expect(sdk.setUserId.mock.calls).toEqual([['A']]);
    });

    it('an undelivered first id is forgotten, then empty stays no logout', async () => {
      const sdk = load({}, false);
      const {config, plugin, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('parked');

      await plugin.onOptOutChanged(true);
      config.userId = undefined;
      sdk.state.isUp = true;
      await track('after-opt-in');

      expect(sdk.setUserId).not.toHaveBeenCalled();
    });

    it('teardown forgets an undelivered id too', async () => {
      const sdk = load({}, false);
      const client = coreClient();
      const config: Config = {optOut: false, userId: 'A'};
      const plugin = sdk.Amply.amplyPlugin();
      await list(plugin, client, config);
      await plugin.execute(eventFor('parked', 'A'));

      await unlist(plugin, client);
      await list(plugin, client, config);
      await sdk.Amply.initialize(CONFIG);
      await plugin.execute(eventFor('after-return', 'A'));
      await settle();

      expect(bridgeCalls(sdk)).toEqual(['id:A', 'event:after-return']);
    });

    it('rollback touches that plugin only', async () => {
      const sdk = load({}, false);
      const first = await amplitude(sdk);
      const second = await amplitude(sdk);
      first.config.userId = 'A';
      second.config.userId = 'B';
      await first.track('first-parked');
      await second.track('second-parked');

      await first.plugin.onOptOutChanged(true);
      await sdk.Amply.initialize(CONFIG);
      await settle();
      await second.track('second-next');

      expect(sdk.setUserId.mock.calls).toEqual([['B']]);
    });
  });

  describe('a direct Amply.setUserId', () => {
    it('logging back in as the same user without an event between reaches Amply', async () => {
      const sdk = load();
      const {config, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('signed-in');

      config.userId = undefined;
      sdk.Amply.setUserId(null);
      config.userId = 'A';
      await track('back');

      expect(sdk.setUserId.mock.calls).toEqual([['A'], [null], ['A']]);
    });

    it('a logout made directly is not repeated by the next anonymous event', async () => {
      const sdk = load();
      const {config, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('signed-in');

      config.userId = undefined;
      sdk.Amply.setUserId(null);
      await track('browsing');

      expect(sdk.setUserId.mock.calls).toEqual([['A'], [null]]);
    });

    it('an id set directly stays while Amplitude has none', async () => {
      const sdk = load();
      const {track} = await amplitude(sdk);

      sdk.Amply.setUserId('own-id');
      await track('browsing');

      expect(sdk.setUserId.mock.calls).toEqual([['own-id']]);
    });

    it('overrides an id still parked in the queue', async () => {
      const sdk = load({}, false);
      const {config, track} = await amplitude(sdk);
      config.userId = 'A';
      await track('signed-in');

      sdk.Amply.setUserId(null);
      await sdk.Amply.initialize(CONFIG);
      await settle();

      expect(sdk.setUserId.mock.calls).toEqual([[null]]);
      expect(names(sdk.forwardEvent)).toEqual(['signed-in']);
    });
  });
});
