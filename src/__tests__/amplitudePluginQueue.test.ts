/**
 * What happens after an event is accepted: the queue before Amply starts, the worker that must
 * never stop, one plugin per client, and the promise that nothing reaches Amplitude as a failure.
 */
import type {AmplitudeEventLike} from '../amplitudePlugin';
import {
  CONFIG,
  coreClient,
  eventOf,
  identifyEvent,
  install,
  list,
  load,
  loadWithoutNativeModule,
  names,
  resetCore,
  settle,
  unlist,
} from './amplitudePluginHarness';

describe('amplyPlugin queue', () => {
  let warn: jest.SpyInstance;
  let debug: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    debug = jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('never fails Amplitude', () => {
    it('execute resolves exactly {event, code: 200, message: \'amply\'} in every branch', async () => {
      const {Amply} = load({
        forwardEvent: () => {
          throw new Error('bridge threw');
        },
      });
      const client = {};
      const passing = await install(Amply, undefined, client);
      const inert = await install(Amply, undefined, client);
      const optedOut = await install(Amply, undefined, {}, {optOut: true});
      const rejecting = await install(Amply, {filter: () => false});
      const throwingFilter = await install(Amply, {
        filter: () => {
          throw new Error('host bug');
        },
      });
      const throwingTransform = await install(Amply, {
        transform: () => {
          throw new Error('host bug');
        },
      });
      const unreadable = {
        get event_type(): string {
          throw new Error('unreadable event');
        },
      };

      const branches: Array<[{execute: typeof passing.execute}, AmplitudeEventLike]> = [
        [passing, eventOf('Purchase')],
        [passing, identifyEvent],
        [passing, eventOf('[Amplitude] Network Request')],
        [passing, unreadable],
        [inert, eventOf('Purchase')],
        [optedOut, eventOf('Purchase')],
        [rejecting, eventOf('Purchase')],
        [throwingFilter, eventOf('Purchase')],
        [throwingTransform, eventOf('Purchase')],
      ];

      for (const [plugin, event] of branches) {
        const result = await plugin.execute(event);

        expect(Object.keys(result).sort()).toEqual(['code', 'event', 'message']);
        expect(result.event).toBe(event);
        expect(result.code).toBe(200);
        expect(result.message).toBe('amply');
      }
      await settle();
    });

    it('rejected forwardEvent does not stop the queue', async () => {
      const {Amply, state, forwardEvent} = load({}, false);
      forwardEvent.mockImplementationOnce(() => Promise.reject(new Error('AMP_NOT_INITIALIZED')));
      const plugin = await install(Amply);
      await plugin.execute(eventOf('first'));
      await plugin.execute(eventOf('second'));

      state.isUp = true;
      await plugin.execute(eventOf('third'));
      await settle();

      expect(names(forwardEvent)).toEqual(['first', 'second', 'third']);
    });

    const unreadable = (): unknown => {
      const failure = new Error('unreadable');
      Object.defineProperty(failure, 'message', {
        get() {
          throw new Error('no message');
        },
      });
      return failure;
    };

    it.each<[string, () => unknown]>([
      ['an object with no prototype', () => Object.create(null)],
      ['a symbol', () => Symbol('x')],
      ['an Error whose message throws', unreadable],
      ['an Error whose message is a symbol', () => Object.assign(new Error(), {message: Symbol('x')})],
    ])('a rejection with %s does not stop the queue', async (_, rejection) => {
      const {Amply, forwardEvent} = load();
      forwardEvent.mockImplementationOnce(() => Promise.reject(rejection()));
      const plugin = await install(Amply, {debug: true});

      await plugin.execute(eventOf('first'));
      await settle();
      await plugin.execute(eventOf('second'));
      await settle();

      expect(names(forwardEvent)).toEqual(['first', 'second']);
    });

    it('a console that throws stops nothing', async () => {
      const {Amply, forwardEvent} = load();
      warn.mockImplementation(() => {
        throw new Error('host console');
      });
      debug.mockImplementation(() => {
        throw new Error('host console');
      });
      forwardEvent.mockImplementationOnce(() => Promise.reject(new Error('refused')));
      const throwingFilter = await install(Amply, {
        filter: () => {
          throw new Error('host bug');
        },
      });
      const plugin = await install(Amply, {debug: true});
      const event = eventOf('dropped');

      await expect(throwingFilter.execute(event)).resolves.toEqual({event, code: 200, message: 'amply'});
      await plugin.execute(identifyEvent);
      await plugin.execute(eventOf('first'));
      await settle();
      await plugin.execute(eventOf('second'));
      await settle();

      expect(names(forwardEvent)).toEqual(['first', 'second']);
    });

    it('a console that throws does not break a missing native module', async () => {
      const Amply = loadWithoutNativeModule();
      warn.mockImplementation(() => {
        throw new Error('host console');
      });
      const plugin = await install(Amply);
      const event = eventOf('first');

      await expect(plugin.execute(event)).resolves.toEqual({event, code: 200, message: 'amply'});
    });

    it('the last catch in execute cannot throw', async () => {
      const {Amply} = load();
      warn.mockImplementation(() => {
        throw new Error('host console');
      });
      const plugin = await install(Amply);
      const event = {
        get event_type(): string {
          throw Object.create(null);
        },
      };

      await expect(plugin.execute(event)).resolves.toEqual({event, code: 200, message: 'amply'});
    });

    it('a forwardEvent that throws instead of rejecting does not stop the queue', async () => {
      const {Amply, forwardEvent} = load();
      forwardEvent.mockImplementationOnce(() => {
        throw new Error('bridge threw');
      });
      const plugin = await install(Amply);

      await plugin.execute(eventOf('first'));
      await plugin.execute(eventOf('second'));
      await settle();

      expect(names(forwardEvent)).toEqual(['first', 'second']);
    });

    it('missing native module warns once and never throws', async () => {
      const Amply = loadWithoutNativeModule();
      const plugin = await install(Amply);
      const first = eventOf('first');

      await expect(plugin.execute(first)).resolves.toEqual({event: first, code: 200, message: 'amply'});
      await plugin.execute(eventOf('second'));
      await settle();

      expect(warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('queue', () => {
    it('parks before init and delivers in order after initialize', async () => {
      const {Amply, forwardEvent} = load({}, false);
      const plugin = await install(Amply);

      await plugin.execute(eventOf('first'));
      await plugin.execute(eventOf('second'));
      await settle();
      expect(forwardEvent).not.toHaveBeenCalled();

      await Amply.initialize(CONFIG);
      await settle();

      expect(names(forwardEvent)).toEqual(['first', 'second']);
    });

    it('a failed initialize leaves the events parked', async () => {
      const {Amply, forwardEvent} = load(
        {initialize: jest.fn(() => Promise.reject(new Error('no network')))},
        false,
      );
      const plugin = await install(Amply);
      await plugin.execute(eventOf('first'));

      await expect(Amply.initialize(CONFIG)).rejects.toThrow('no network');
      await settle();

      expect(forwardEvent).not.toHaveBeenCalled();
    });

    it('execute does not wait for parked events or for the bridge', async () => {
      const {Amply, forwardEvent} = load();
      forwardEvent.mockImplementation(() => new Promise(() => {}));
      const plugin = await install(Amply);
      const event = eventOf('first');

      await expect(plugin.execute(event)).resolves.toEqual({event, code: 200, message: 'amply'});
    });

    it('fresh event during drain stays behind parked ones', async () => {
      const {Amply, forwardEvent} = load({}, false);
      let releaseFirst!: () => void;
      forwardEvent.mockImplementationOnce(() => new Promise<void>((resolve) => (releaseFirst = resolve)));
      const plugin = await install(Amply);
      await plugin.execute(eventOf('parked-1'));
      await plugin.execute(eventOf('parked-2'));

      await Amply.initialize(CONFIG);
      await settle();
      await plugin.execute(eventOf('fresh'));
      await settle();
      expect(names(forwardEvent)).toEqual(['parked-1']);

      releaseFirst();
      await settle();

      expect(names(forwardEvent)).toEqual(['parked-1', 'parked-2', 'fresh']);
    });

    it('holds 100 events and drops the oldest', async () => {
      const {Amply, forwardEvent} = load({}, false);
      const plugin = await install(Amply);

      for (let i = 0; i < 150; i += 1) {
        await plugin.execute(eventOf(`e${i}`));
      }
      await Amply.initialize(CONFIG);
      await settle();

      const expected = Array.from({length: 100}, (_, i) => `e${i + 50}`);
      expect(names(forwardEvent)).toEqual(expected);
    });

    it('a parked event keeps the properties it was tracked with', async () => {
      const {Amply, forwardEvent} = load({}, false);
      const plugin = await install(Amply);
      const event = eventOf('Purchase', {plan: 'pro'});

      await plugin.execute(event);
      (event.event_properties as Record<string, unknown>).plan = 'changed-later';
      await Amply.initialize(CONFIG);
      await settle();

      expect(forwardEvent.mock.calls[0][0].properties).toEqual({plan: 'pro'});
    });

    it('does nothing while config.optOut is true', async () => {
      const {Amply, forwardEvent} = load();
      const filter = jest.fn(() => true);
      const config = {optOut: true};
      const plugin = await install(Amply, {filter}, {}, config);

      await plugin.execute(eventOf('Purchase'));
      await settle();
      expect(forwardEvent).not.toHaveBeenCalled();
      expect(filter).not.toHaveBeenCalled();

      config.optOut = false;
      await plugin.execute(eventOf('Purchase'));
      await settle();
      expect(forwardEvent).toHaveBeenCalledTimes(1);
    });

    it('onOptOutChanged(true) and teardown clear only that plugin\'s items', async () => {
      const {Amply, forwardEvent} = load({}, false);
      const bystander = await install(Amply);
      const optedOut = await install(Amply);
      const removed = await install(Amply);
      await bystander.execute(eventOf('kept-1'));
      await optedOut.execute(eventOf('cleared-by-opt-out'));
      await removed.execute(eventOf('cleared-by-teardown'));
      await bystander.execute(eventOf('kept-2'));

      await optedOut.onOptOutChanged(true);
      await removed.teardown();
      await Amply.initialize(CONFIG);
      await settle();

      expect(names(forwardEvent)).toEqual(['kept-1', 'kept-2']);
    });

    it('onOptOutChanged(false) leaves the queue alone', async () => {
      const {Amply, forwardEvent} = load({}, false);
      const plugin = await install(Amply);
      await plugin.execute(eventOf('parked'));

      await plugin.onOptOutChanged(false);
      await Amply.initialize(CONFIG);
      await settle();

      expect(names(forwardEvent)).toEqual(['parked']);
    });
  });

  describe('one plugin per client', () => {
    it('second plugin on the same client stays inert; removing it keeps the first working', async () => {
      const {Amply, forwardEvent} = load({}, false);
      const client = {};
      const first = await install(Amply, undefined, client);
      const second = await install(Amply, undefined, client);

      await first.execute(eventOf('parked'));
      await second.execute(eventOf('ignored'));
      await second.onOptOutChanged(true);
      await second.teardown();

      await Amply.initialize(CONFIG);
      await first.execute(eventOf('after-removal'));
      await settle();

      expect(names(forwardEvent)).toEqual(['parked', 'after-removal']);
    });

    describe('the same object added twice in one tick, which core 2.27 lets through', () => {
      /** Core then lists the object twice and calls `execute` once per listing, with shallow copies. */
      const trackThroughDoubleListing = async (
        plugin: Awaited<ReturnType<typeof install>>,
        event: AmplitudeEventLike,
      ): Promise<void> => {
        await Promise.all([plugin.execute({...event}), plugin.execute({...event})]);
      };

      const listTwice = async (Amply: Parameters<typeof install>[0], client = coreClient()) => {
        const plugin = Amply.amplyPlugin();
        await list(plugin, client);
        await list(plugin, client);
        return plugin;
      };

      it('still works and forwards each event once', async () => {
        const {Amply, forwardEvent} = load();
        const plugin = await listTwice(Amply);

        await trackThroughDoubleListing(plugin, eventOf('first'));
        await trackThroughDoubleListing(plugin, eventOf('second'));
        await settle();

        expect(names(forwardEvent)).toEqual(['first', 'second']);
      });

      it('both calls resolve the full result with their own event', async () => {
        const {Amply} = load();
        const plugin = await listTwice(Amply);
        const first = eventOf('first');
        const second = {...first};

        const results = await Promise.all([plugin.execute(first), plugin.execute(second)]);

        expect(results[0]).toEqual({event: first, code: 200, message: 'amply'});
        expect(results[0].event).toBe(first);
        expect(results[1].event).toBe(second);
      });

      it('removing one listing leaves the other working, removing both frees the client', async () => {
        const {Amply, forwardEvent} = load({}, false);
        const client = coreClient();
        const plugin = await listTwice(Amply, client);
        await trackThroughDoubleListing(plugin, eventOf('parked'));

        await unlist(plugin, client);
        await Amply.initialize(CONFIG);
        await plugin.execute(eventOf('one-listing-left'));
        await settle();
        expect(names(forwardEvent)).toEqual(['parked', 'one-listing-left']);

        await unlist(plugin, client);
        const next = Amply.amplyPlugin();
        await list(next, client);
        await next.execute(eventOf('next-plugin'));
        await settle();
        expect(names(forwardEvent)).toEqual(['parked', 'one-listing-left', 'next-plugin']);
      });

      it('a reset tears down before it empties the list, the client is still freed', async () => {
        const {Amply, forwardEvent} = load();
        const client = coreClient();
        await listTwice(Amply, client);

        await resetCore(client);
        const next = Amply.amplyPlugin();
        await list(next, client);
        await next.execute(eventOf('after-reset'));
        await settle();

        expect(names(forwardEvent)).toEqual(['after-reset']);
      });

      it('a reset clears what is parked', async () => {
        const {Amply, forwardEvent} = load({}, false);
        const client = coreClient();
        const plugin = await listTwice(Amply, client);
        await trackThroughDoubleListing(plugin, eventOf('parked'));

        await resetCore(client);
        await Amply.initialize(CONFIG);
        await settle();

        expect(forwardEvent).not.toHaveBeenCalled();
      });

      it('other entries on the list do not count as repeats', async () => {
        const {Amply, forwardEvent} = load();
        const client = coreClient();
        const plugin = Amply.amplyPlugin();
        await list(plugin, client);
        client.timeline.plugins = [...client.timeline.plugins, {name: 'amply'}, {name: 'other'}];

        await plugin.execute(eventOf('one'));
        await plugin.execute(eventOf('two'));
        await settle();

        expect(names(forwardEvent)).toEqual(['one', 'two']);
      });
    });

    describe('set up twice and listed once, as core 2.61 does for add, remove, add in one tick', () => {
      const setUpTwiceListedOnce = async (Amply: Parameters<typeof install>[0], client = coreClient()) => {
        const plugin = Amply.amplyPlugin();
        await plugin.setup({optOut: false}, client);
        await list(plugin, client);
        return plugin;
      };

      it('forwards every event', async () => {
        const {Amply, forwardEvent} = load();
        const plugin = await setUpTwiceListedOnce(Amply);

        for (const name of ['h1', 'h2', 'h3', 'h4']) {
          await plugin.execute(eventOf(name));
        }
        await settle();

        expect(names(forwardEvent)).toEqual(['h1', 'h2', 'h3', 'h4']);
      });

      it('the one removal clears what is parked', async () => {
        const {Amply, forwardEvent} = load({}, false);
        const client = coreClient();
        const plugin = await setUpTwiceListedOnce(Amply, client);
        await plugin.execute(eventOf('parked-1'));
        await plugin.execute(eventOf('parked-2'));

        await unlist(plugin, client);
        await Amply.initialize(CONFIG);
        await settle();

        expect(forwardEvent).not.toHaveBeenCalled();
      });

      it('the one removal frees the client', async () => {
        const {Amply, forwardEvent} = load();
        const client = coreClient();
        const plugin = await setUpTwiceListedOnce(Amply, client);

        await unlist(plugin, client);
        const next = Amply.amplyPlugin();
        await list(next, client);
        await next.execute(eventOf('next-plugin'));
        await settle();

        expect(names(forwardEvent)).toEqual(['next-plugin']);
      });
    });

    describe('a list that cannot be read', () => {
      it.each<[string, object]>([
        ['no timeline', {}],
        ['no plugins', {timeline: {}}],
        ['plugins that are not a list', {timeline: {plugins: 'amply'}}],
      ])('%s: set up twice, every event is forwarded', async (_, client) => {
        const {Amply, forwardEvent} = load();
        const plugin = await install(Amply, undefined, client);
        await plugin.setup({optOut: false}, client);

        await plugin.execute(eventOf('one'));
        await plugin.execute(eventOf('two'));
        await settle();

        expect(names(forwardEvent)).toEqual(['one', 'two']);
      });

      it('teardown clears and frees, there is nothing to say a listing remains', async () => {
        const {Amply, forwardEvent} = load({}, false);
        const client = {};
        const plugin = await install(Amply, undefined, client);
        await plugin.execute(eventOf('parked'));

        await plugin.teardown();
        const next = await install(Amply, undefined, client);
        await next.execute(eventOf('next-plugin'));
        await Amply.initialize(CONFIG);
        await settle();

        expect(names(forwardEvent)).toEqual(['next-plugin']);
      });
    });

    describe('the plugin holding the client is off the list', () => {
      it('never listed, as core 2.61 does for add, remove in one tick: the next plugin works', async () => {
        const {Amply, forwardEvent} = load();
        const client = coreClient();
        await install(Amply, undefined, client);

        const next = Amply.amplyPlugin();
        await list(next, client);
        await next.execute(eventOf('first'));
        await next.execute(eventOf('second'));
        await settle();

        expect(names(forwardEvent)).toEqual(['first', 'second']);
      });

      it('removed, as core 2.27 does with two objects: the one left on the list takes over', async () => {
        const {Amply, forwardEvent} = load();
        const client = coreClient();
        const first = Amply.amplyPlugin();
        const second = Amply.amplyPlugin();
        await list(first, client);
        await list(second, client);

        await second.execute(eventOf('while-inert'));
        await unlist(first, client);
        await second.execute(eventOf('after-takeover'));
        await settle();

        expect(names(forwardEvent)).toEqual(['after-takeover']);
      });

      it('a plugin off the list does not take over from a holder on it', async () => {
        const {Amply, forwardEvent} = load();
        const client = coreClient();
        const holder = Amply.amplyPlugin();
        await list(holder, client);
        const unlisted = await install(Amply, undefined, client);

        await unlisted.execute(eventOf('ignored'));
        await settle();

        expect(forwardEvent).not.toHaveBeenCalled();
      });

      it('removed and added back in the tick another plugin is added: one of them forwards', async () => {
        const {Amply, forwardEvent} = load();
        const client = coreClient();
        const first = Amply.amplyPlugin();
        const second = Amply.amplyPlugin();
        await list(first, client);

        client.timeline.plugins = [];
        const teardown = first.teardown();
        const setups = [first.setup({optOut: false}, client), second.setup({optOut: false}, client)];
        await Promise.all([teardown, ...setups]);
        client.timeline.plugins = [first, second];
        await Promise.all([first.execute(eventOf('once')), second.execute(eventOf('once'))]);
        await Promise.all([first.execute(eventOf('twice')), second.execute(eventOf('twice'))]);
        await settle();

        expect(names(forwardEvent)).toEqual(['once', 'twice']);
      });

      it('a plugin that lost the claim stops forwarding, the claim alone decides', async () => {
        const {Amply, forwardEvent} = load();
        const client = coreClient();
        const first = Amply.amplyPlugin();
        const second = Amply.amplyPlugin();
        await list(first, client);
        await first.setup({optOut: false}, client);
        client.timeline.plugins = [];
        await first.teardown();
        await list(second, client);
        await second.execute(eventOf('claimed'));

        client.timeline.plugins = [second, first];
        await first.execute(eventOf('ignored'));
        await settle();

        expect(names(forwardEvent)).toEqual(['claimed']);
      });

      it('an unreadable list lets a plugin back in after its claim was freed', async () => {
        const {Amply, forwardEvent} = load();
        const client = {};
        const plugin = await install(Amply, undefined, client);

        const teardown = plugin.teardown();
        const setup = plugin.setup({optOut: false}, client);
        await Promise.all([teardown, setup]);
        await plugin.execute(eventOf('still-working'));
        await settle();

        expect(names(forwardEvent)).toEqual(['still-working']);
      });

      it('a plugin off the list does not take over when the holder goes either', async () => {
        const {Amply, forwardEvent} = load();
        const client = coreClient();
        const holder = Amply.amplyPlugin();
        await list(holder, client);
        const unlisted = await install(Amply, undefined, client);

        await unlist(holder, client);
        await unlisted.execute(eventOf('ignored'));
        await settle();

        expect(forwardEvent).not.toHaveBeenCalled();
      });
    });

    it('one object added to two clients forwards every event from both', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply);
      await plugin.setup({optOut: false}, {});

      await plugin.execute(eventOf('one'));
      await plugin.execute(eventOf('two'));
      await settle();

      expect(names(forwardEvent)).toEqual(['one', 'two']);
    });

    it('warns when one object is added to two clients, whose settings it cannot tell apart', async () => {
      const {Amply} = load();
      const plugin = await install(Amply);

      await plugin.setup({optOut: false}, {});

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('once per client'));
    });

    it('a plugin added back after removal works, even after a late event', async () => {
      const {Amply, forwardEvent} = load();
      const client = {};
      const plugin = await install(Amply, undefined, client);
      await plugin.teardown();

      await plugin.execute(eventOf('in-flight'));
      await plugin.setup({optOut: false}, client);
      await plugin.execute(eventOf('after-return'));
      await settle();

      expect(names(forwardEvent)).toEqual(['in-flight', 'after-return']);
    });

    it('an inert plugin forwards nothing and removing it does not free the client', async () => {
      const {Amply, forwardEvent} = load();
      const client = {};
      const first = await install(Amply, undefined, client);
      const second = await install(Amply, undefined, client);

      await second.execute(eventOf('from-second'));
      await second.teardown();
      const third = await install(Amply, undefined, client);
      await third.execute(eventOf('from-third'));
      await first.execute(eventOf('from-first'));
      await settle();

      expect(names(forwardEvent)).toEqual(['from-first']);
    });

    it('a plugin added after the first is removed takes over', async () => {
      const {Amply, forwardEvent} = load();
      const client = {};
      const first = await install(Amply, undefined, client);
      await first.teardown();

      const next = await install(Amply, undefined, client);
      await next.execute(eventOf('Purchase'));
      await settle();

      expect(names(forwardEvent)).toEqual(['Purchase']);
    });

    it('a plugin on another client is independent', async () => {
      const {Amply, forwardEvent} = load();
      const first = await install(Amply, undefined, {});
      const second = await install(Amply, undefined, {});

      await first.execute(eventOf('one'));
      await second.execute(eventOf('two'));
      await settle();

      expect(names(forwardEvent)).toEqual(['one', 'two']);
    });
  });

  describe('debug', () => {
    it('says what was skipped and why', async () => {
      const {Amply} = load();
      const plugin = await install(Amply, {debug: true, filter: () => false});

      await plugin.execute(eventOf('Purchase'));

      expect(debug).toHaveBeenCalledWith(expect.stringContaining('Purchase'));
    });

    it('stays quiet without debug', async () => {
      const {Amply} = load();
      const plugin = await install(Amply, {filter: () => false});

      await plugin.execute(eventOf('Purchase'));

      expect(debug).not.toHaveBeenCalled();
    });

    it('counts the events lost to a full queue', async () => {
      const {Amply} = load({}, false);
      const plugin = await install(Amply, {debug: true});

      for (let i = 0; i < 102; i += 1) {
        await plugin.execute(eventOf(`e${i}`));
      }

      expect(debug).toHaveBeenLastCalledWith(expect.stringContaining('2 dropped'));
    });

    it('reports a rejected forwardEvent', async () => {
      const {Amply, forwardEvent} = load();
      forwardEvent.mockImplementationOnce(() => Promise.reject(new Error('AMP_NOT_INITIALIZED')));
      const plugin = await install(Amply, {debug: true});

      await plugin.execute(eventOf('Purchase'));
      await settle();

      expect(debug).toHaveBeenCalledWith(expect.stringContaining('AMP_NOT_INITIALIZED'));
    });
  });

});
