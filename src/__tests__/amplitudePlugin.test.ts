/**
 * `amplyPlugin` is the adapter between Amplitude's destination pipeline and the `forwardEvent`
 * bridge: steps 0-5 of the forwarding spec, and what crosses the bridge. Value policy (names, PII,
 * limits) lives in the native SDK and is not tested here. The queue is in amplitudePluginQueue.test.ts.
 */
import type {AmplitudeEventLike, AmplyPluginOptions} from '../amplitudePlugin';
import {eventOf, identifyEvent, install, load, names, settle} from './amplitudePluginHarness';

describe('amplyPlugin pipeline', () => {
  let warn: jest.SpyInstance;
  let debug: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    debug = jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('forwarding', () => {
    it('forwards a plain event with its name verbatim', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply);

      await plugin.execute(eventOf('Paywall Viewed', {plan: 'pro', price: 9.99}));
      await settle();

      expect(forwardEvent).toHaveBeenCalledTimes(1);
      expect(forwardEvent).toHaveBeenCalledWith({
        source: 'amplitude',
        name: 'Paywall Viewed',
        properties: {plan: 'pro', price: 9.99},
      });
    });

    it('sends an empty property map for an event with no properties', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply);

      await plugin.execute(eventOf('app_open'));
      await settle();

      expect(forwardEvent).toHaveBeenCalledWith({source: 'amplitude', name: 'app_open', properties: {}});
    });

    it('is the destination plugin named amply', async () => {
      const {Amply} = load();

      const plugin = Amply.amplyPlugin();

      expect(plugin.name).toBe('amply');
      expect(plugin.type).toBe('destination');
    });

    it('does not turn $identify, $groupidentify, session_start, session_end into events', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply);

      await plugin.execute(identifyEvent);
      await plugin.execute(eventOf('$groupidentify'));
      await plugin.execute(eventOf('session_start'));
      await plugin.execute(eventOf('session_end'));
      await settle();

      expect(forwardEvent).not.toHaveBeenCalled();
    });

    it('Date value becomes epoch milliseconds', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply);
      const signedUp = new Date('2026-10-30T12:00:00.000Z');

      await plugin.execute(eventOf('Signed Up', {at: signedUp, dates: [signedUp], plan: 'pro'}));
      await settle();

      expect(forwardEvent.mock.calls[0][0].properties).toEqual({
        at: signedUp.getTime(),
        dates: [String(signedUp.getTime())],
        plan: 'pro',
      });
    });

    it('a Date returned by transform becomes epoch milliseconds too', async () => {
      const {Amply, forwardEvent} = load();
      const at = new Date('2026-10-30T12:00:00.000Z');
      const plugin = await install(Amply, {transform: () => ({properties: {at}})});

      await plugin.execute(eventOf('Signed Up'));
      await settle();

      expect(forwardEvent.mock.calls[0][0].properties).toEqual({at: at.getTime()});
    });
  });

  describe('autocapture', () => {
    const screenViewed = (): AmplitudeEventLike =>
      eventOf('[Amplitude] Screen Viewed', {'[Amplitude] Screen Name': 'Paywall', plan: 'pro'});

    it('drops [Amplitude] events unless listed in autocapture', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply, {autocapture: ['[Amplitude] Screen Viewed']});

      await plugin.execute(eventOf('[Amplitude] Network Request', {url: 'https://x'}));
      await settle();

      expect(forwardEvent).not.toHaveBeenCalled();
    });

    it('drops every [Amplitude] event by default', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply);

      await plugin.execute(screenViewed());
      await settle();

      expect(forwardEvent).not.toHaveBeenCalled();
    });

    it('listed Screen Viewed arrives as Screen Viewed with Screen Name key', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply, {autocapture: ['[Amplitude] Screen Viewed']});

      await plugin.execute(screenViewed());
      await settle();

      expect(forwardEvent).toHaveBeenCalledWith({
        source: 'amplitude',
        name: 'Screen Viewed',
        properties: {'Screen Name': 'Paywall', plan: 'pro'},
      });
    });

    it('filter and transform see the name and keys without the prefix', async () => {
      const {Amply} = load();
      const filter = jest.fn(() => true);
      const transform = jest.fn(() => ({}));
      const plugin = await install(Amply, {
        autocapture: ['[Amplitude] Screen Viewed'],
        filter,
        transform,
      });

      await plugin.execute(screenViewed());

      const expected = expect.objectContaining({
        event_type: 'Screen Viewed',
        event_properties: {'Screen Name': 'Paywall', plan: 'pro'},
      });
      expect(filter).toHaveBeenCalledWith(expected);
      expect(transform).toHaveBeenCalledWith(expected);
    });
  });

  describe('filter', () => {
    it('filter false drops', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply, {filter: (event) => !event.event_type.startsWith('debug_')});

      await plugin.execute(eventOf('debug_tap'));
      await plugin.execute(eventOf('Purchase'));
      await settle();

      expect(names(forwardEvent)).toEqual(['Purchase']);
    });

    it('filter throwing drops and warns once', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply, {
        filter: () => {
          throw new Error('host bug');
        },
      });

      await plugin.execute(eventOf('first'));
      await plugin.execute(eventOf('second'));
      await settle();

      expect(forwardEvent).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('filter returning truthy non-true drops', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply, {filter: () => 1 as unknown as boolean});

      await plugin.execute(eventOf('Purchase'));
      await settle();

      expect(forwardEvent).not.toHaveBeenCalled();
    });

    it('filter mutating event_properties does not reach the event Amplitude keeps', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply, {
        filter: (event) => {
          delete event.event_properties?.plan;
          return true;
        },
      });
      const event = eventOf('Purchase', {plan: 'pro'});

      await plugin.execute(event);
      await settle();

      expect(event.event_properties).toEqual({plan: 'pro'});
      expect(forwardEvent.mock.calls[0][0].properties).toEqual({plan: 'pro'});
    });
  });

  describe('transform', () => {
    it('transform renames', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply, {
        transform: (event) => ({name: Amply.pascalCaseEventName(event.event_type)}),
      });

      await plugin.execute(eventOf('paywall_shown', {plan: 'pro'}));
      await settle();

      expect(forwardEvent).toHaveBeenCalledWith({
        source: 'amplitude',
        name: 'PaywallShown',
        properties: {plan: 'pro'},
      });
    });

    it('transform replaces the properties', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply, {transform: () => ({properties: {clean: true}})});

      await plugin.execute(eventOf('Purchase', {card: '4242'}));
      await settle();

      expect(forwardEvent.mock.calls[0][0].properties).toEqual({clean: true});
    });

    it('transform returning undefined drops and warns', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply, {
        transform: (() => undefined) as unknown as AmplyPluginOptions['transform'],
      });

      await plugin.execute(eventOf('Purchase'));
      await settle();

      expect(forwardEvent).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('transform returning a promise drops and warns instead of forwarding the raw event', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply, {
        transform: (async () => ({properties: {clean: true}})) as unknown as AmplyPluginOptions['transform'],
      });

      await plugin.execute(eventOf('Purchase', {card: '4242'}));
      await settle();

      expect(forwardEvent).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('transform throwing drops and warns once', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply, {
        transform: () => {
          throw new Error('host bug');
        },
      });

      await plugin.execute(eventOf('first'));
      await plugin.execute(eventOf('second'));
      await settle();

      expect(forwardEvent).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('transform with non-string name keeps the original name', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply, {
        transform: () => ({name: 42 as unknown as string, properties: {clean: true}}),
      });

      await plugin.execute(eventOf('Purchase', {card: '4242'}));
      await settle();

      expect(forwardEvent).toHaveBeenCalledWith({
        source: 'amplitude',
        name: 'Purchase',
        properties: {clean: true},
      });
    });

    it('transform with non-object properties keeps the original properties', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply, {
        transform: () => ({name: 'Renamed', properties: 'nope' as unknown as Record<string, unknown>}),
      });

      await plugin.execute(eventOf('Purchase', {plan: 'pro'}));
      await settle();

      expect(forwardEvent).toHaveBeenCalledWith({
        source: 'amplitude',
        name: 'Renamed',
        properties: {plan: 'pro'},
      });
    });
  });

  describe('the copy handed to filter and transform', () => {
    const cartEvent = () => eventOf('Purchase', {cart: {total: 100, items: [{sku: 'pro'}]}});

    it('filter and transform changing nested data leave the original event intact', async () => {
      const {Amply} = load();
      const scramble = (event: AmplitudeEventLike) => {
        const cart = event.event_properties?.cart as {total: number; items: Array<{sku: string}>};
        cart.total = 0;
        cart.items[0].sku = 'free';
      };
      const plugin = await install(Amply, {
        filter: (event) => {
          scramble(event);
          return true;
        },
        transform: (event) => {
          scramble(event);
          return {};
        },
      });
      const event = cartEvent();

      await plugin.execute(event);

      expect(event).toEqual(cartEvent());
    });

    it('transform does not see what filter changed', async () => {
      const {Amply} = load();
      const seen: unknown[] = [];
      const plugin = await install(Amply, {
        filter: (event) => {
          (event.event_properties?.cart as {total: number}).total = 0;
          return true;
        },
        transform: (event) => {
          seen.push((event.event_properties?.cart as {total: number}).total);
          return {};
        },
      });

      await plugin.execute(cartEvent());

      expect(seen).toEqual([100]);
    });

    it('a Date in the copy is not the original Date', async () => {
      const {Amply} = load();
      const at = new Date('2026-10-30T12:00:00.000Z');
      const plugin = await install(Amply, {
        filter: (event) => {
          (event.event_properties?.at as Date).setTime(0);
          return true;
        },
      });

      await plugin.execute(eventOf('Purchase', {at}));

      expect(at.getTime()).toBe(Date.parse('2026-10-30T12:00:00.000Z'));
    });

    it('with neither callback the event is not copied', async () => {
      const {Amply} = load();
      const plugin = await install(Amply);
      const read = jest.fn(() => 100);
      const cart = {
        get total(): number {
          return read();
        },
      };

      await plugin.execute(eventOf('Purchase', {cart}));
      await settle();

      expect(read).not.toHaveBeenCalled();
    });

    it('a cycle in the copy is cut at the repeat, a value used twice side by side stays', async () => {
      const {Amply} = load();
      const shared = {sku: 'pro'};
      const cyclic: Record<string, unknown> = {plan: 'pro', first: shared, second: shared};
      cyclic.self = cyclic;
      let copy: AmplitudeEventLike | undefined;
      const plugin = await install(Amply, {
        filter: (event) => {
          copy = event;
          return true;
        },
      });

      await plugin.execute(eventOf('Purchase', cyclic));

      expect(copy?.event_properties).toEqual({plan: 'pro', first: shared, second: shared});
    });

    it('many self-references cost one pass, not k^10', async () => {
      const {Amply} = load();
      const cyclic: Record<string, unknown> = {};
      for (let i = 0; i < 40; i += 1) {
        cyclic[`self${i}`] = cyclic;
      }
      const filter = jest.fn(() => true);
      const plugin = await install(Amply, {filter});

      await plugin.execute(eventOf('Purchase', cyclic));

      expect(filter).toHaveBeenCalledTimes(1);
    });

    it('branch deeper than 10 levels is dropped from the copy', async () => {
      const {Amply} = load();
      // The event is level 0, event_properties level 1, so `nested` opens level 2.
      const nestTo = (level: number): Record<string, unknown> =>
        level === 10 ? {leaf: 'kept', tooDeep: {gone: true}} : {nested: nestTo(level + 1)};
      let copy: AmplitudeEventLike | undefined;
      const plugin = await install(Amply, {
        filter: (event) => {
          copy = event;
          return true;
        },
      });

      await plugin.execute(eventOf('Purchase', nestTo(1)));

      let level: Record<string, unknown> = copy?.event_properties as Record<string, unknown>;
      for (let depth = 1; depth < 10; depth += 1) {
        level = level.nested as Record<string, unknown>;
      }
      expect(level).toEqual({leaf: 'kept'});
    });

    it('an object the copy cannot own is dropped rather than shared', async () => {
      const {Amply} = load();
      class Session {
        id = 'live';
      }
      let copy: AmplitudeEventLike | undefined;
      const plugin = await install(Amply, {
        filter: (event) => {
          copy = event;
          return true;
        },
      });

      await plugin.execute(eventOf('Purchase', {session: new Session(), plan: 'pro'}));

      expect(copy?.event_properties).toEqual({plan: 'pro'});
    });
  });

  describe('what crosses the bridge', () => {
    const circular = (): Record<string, unknown> => {
      const properties: Record<string, unknown> = {plan: 'pro'};
      properties.self = properties;
      properties.nested = {back: properties};
      properties.list = [properties];
      return properties;
    };

    it.each<[string, AmplyPluginOptions | undefined]>([
      ['no callback', undefined],
      ['filter only', {filter: () => true}],
      ['transform returning nothing to change', {transform: () => ({})}],
    ])('a circular property does not reach the bridge with %s', async (_, options) => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply, options);

      await plugin.execute(eventOf('Purchase', circular()));
      await settle();

      expect(forwardEvent.mock.calls[0][0].properties).toEqual({plan: 'pro'});
    });

    it('a cycle behind toJSON does not reach the bridge', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply);

      await plugin.execute(eventOf('Purchase', {plan: 'pro', hidden: {toJSON: circular}}));
      await settle();

      expect(forwardEvent.mock.calls[0][0].properties).toEqual({plan: 'pro'});
    });

    it('a cycle returned by transform does not reach the bridge', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply, {transform: () => ({properties: circular()})});

      await plugin.execute(eventOf('Purchase'));
      await settle();

      expect(forwardEvent.mock.calls[0][0].properties).toEqual({plan: 'pro'});
    });

    it('passes strings, numbers, booleans and flat arrays of them', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply);
      const properties = {text: 'a', count: 0, price: 9.99, isPaid: false, tags: ['a', true], none: []};

      await plugin.execute(eventOf('Purchase', properties));
      await settle();

      expect(forwardEvent.mock.calls[0][0].properties).toEqual(properties);
    });

    it('numbers inside arrays become strings, so [1] joins as 1 on both platforms', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply);

      await plugin.execute(eventOf('Purchase', {tags: [1, 2.5, 'a', true], when: [new Date(5)]}));
      await settle();

      expect(forwardEvent.mock.calls[0][0].properties).toEqual({tags: ['1', '2.5', 'a', true], when: ['5']});
    });

    it('a number on its own stays a number', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply);

      await plugin.execute(eventOf('Purchase', {count: 1}));
      await settle();

      expect(forwardEvent.mock.calls[0][0].properties).toEqual({count: 1});
    });

    it.each([NaN, Infinity, -Infinity])('%s inside an array drops the array, as the native policy does', async (value) => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply);

      await plugin.execute(eventOf('Purchase', {tags: ['a', value], plan: 'pro'}));
      await settle();

      expect(forwardEvent.mock.calls[0][0].properties).toEqual({plan: 'pro'});
    });

    it('leaves out everything else, and an array with any other element whole', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply);

      await plugin.execute(
        eventOf('Purchase', {
          plan: 'pro',
          nothing: null,
          missing: undefined,
          callback: () => 1,
          object: {a: 1},
          objects: [{a: 1}],
          mixed: ['a', {a: 1}],
          nested: [['a']],
          withNull: ['a', null],
          // eslint-disable-next-line no-sparse-arrays
          withHole: ['a', , 'b'],
        }),
      );
      await settle();

      expect(forwardEvent.mock.calls[0][0].properties).toStrictEqual({plan: 'pro'});
    });

    it('one bigint or symbol costs that key, not the event', async () => {
      const {Amply, forwardEvent} = load();
      const plugin = await install(Amply);

      await plugin.execute(eventOf('Purchase', {plan: 'pro', big: BigInt(1), tag: Symbol('x')}));
      await settle();

      expect(forwardEvent.mock.calls[0][0].properties).toEqual({plan: 'pro'});
    });
  });

  describe('pascalCaseEventName', () => {
    it.each([
      ['paywall_shown', 'PaywallShown'],
      ['Paywall Viewed', 'PaywallViewed'],
      ['paywall-shown.twice', 'PaywallShownTwice'],
      ['  already__Spaced  ', 'AlreadySpaced'],
      ['PaywallShown', 'PaywallShown'],
    ])('%s becomes %s', (input, expected) => {
      const {Amply} = load();

      expect(Amply.pascalCaseEventName(input)).toBe(expected);
    });
  });

  it('stays out of the main entry point, so an app without Amplitude never loads it', () => {
    jest.isolateModules(() => {
      jest.doMock('../amplitudePlugin', () => {
        throw new Error('the main entry point loaded the plugin');
      });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const main = require('../index');

      expect(Object.keys(main)).not.toContain('amplyPlugin');
      expect(Object.keys(main.default)).not.toContain('amplyPlugin');
    });
    jest.dontMock('../amplitudePlugin');
  });
});
