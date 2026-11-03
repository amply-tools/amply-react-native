/** Include and exclude lists: which events go to Amply, and which of their properties and user properties. */
import type {AmplyPluginOptions} from '../amplitudePlugin';
import {eventOf, identifyOf, install, load, names, settle} from './amplitudePluginHarness';
import type {Sdk} from './amplitudePluginHarness';

describe('amplyPlugin include and exclude lists', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const send = async (options: AmplyPluginOptions, ...events: Array<ReturnType<typeof eventOf>>): Promise<Sdk> => {
    const sdk = load();
    const plugin = await install(sdk.Amply, options);
    for (const event of events) {
      await plugin.execute(event);
    }
    await settle();
    return sdk;
  };

  describe('events', () => {
    it('include forwards only the listed events', async () => {
      const sdk = await send(
        {events: {include: ['Purchase Completed', 'Paywall Viewed']}},
        eventOf('Purchase Completed'),
        eventOf('Screen Opened'),
        eventOf('Paywall Viewed'),
      );

      expect(names(sdk.forwardEvent)).toEqual(['Purchase Completed', 'Paywall Viewed']);
    });

    it('exclude forwards everything but the listed events', async () => {
      const sdk = await send(
        {events: {exclude: ['Screen Opened']}},
        eventOf('Purchase Completed'),
        eventOf('Screen Opened'),
      );

      expect(names(sdk.forwardEvent)).toEqual(['Purchase Completed']);
    });

    it('a pattern matches by name', async () => {
      const sdk = await send(
        {events: {exclude: [/^debug_/]}},
        eventOf('debug_tap'),
        eventOf('debug_scroll'),
        eventOf('Purchase Completed'),
      );

      expect(names(sdk.forwardEvent)).toEqual(['Purchase Completed']);
    });

    it('a global pattern answers the same for every event, its lastIndex never moves', async () => {
      const pattern = /^Purchase/g;
      const sdk = await send({events: {include: [pattern]}}, eventOf('Purchase A'), eventOf('Purchase B'));

      expect(names(sdk.forwardEvent)).toEqual(['Purchase A', 'Purchase B']);
      expect(pattern.lastIndex).toBe(0);
    });

    it('exclude wins over include', async () => {
      const sdk = await send(
        {events: {include: [/^Purchase/], exclude: ['Purchase Failed']}},
        eventOf('Purchase Completed'),
        eventOf('Purchase Failed'),
      );

      expect(names(sdk.forwardEvent)).toEqual(['Purchase Completed']);
    });

    it('an empty include forwards nothing', async () => {
      const sdk = await send({events: {include: []}}, eventOf('Purchase Completed'));

      expect(sdk.forwardEvent).not.toHaveBeenCalled();
    });

    it('names are matched as Amplitude shows them, before a transform renames the event', async () => {
      const sdk = await send(
        {events: {include: ['purchase_completed']}, transform: () => ({name: 'PurchaseCompleted'})},
        eventOf('purchase_completed'),
      );

      expect(names(sdk.forwardEvent)).toEqual(['PurchaseCompleted']);
    });

    it('an autocaptured event is matched by its full name and still needs autocapture', async () => {
      const sdk = await send(
        {events: {exclude: ['[Amplitude] Screen Viewed']}, autocapture: ['[Amplitude] Screen Viewed', '[Amplitude] Deep Link Opened']},
        eventOf('[Amplitude] Screen Viewed'),
        eventOf('[Amplitude] Deep Link Opened'),
        eventOf('[Amplitude] Element Clicked'),
      );

      expect(names(sdk.forwardEvent)).toEqual(['Deep Link Opened']);
    });

    it('the filter runs after the lists and only sees what they let through', async () => {
      const filter = jest.fn(() => true);
      await send({events: {exclude: ['Screen Opened']}, filter}, eventOf('Screen Opened'), eventOf('Purchase'));

      expect(filter).toHaveBeenCalledTimes(1);
      expect(filter.mock.calls[0]).toEqual([expect.objectContaining({event_type: 'Purchase'})]);
    });
  });

  describe('event properties', () => {
    const purchase = () => eventOf('Purchase', {plan: 'pro', price: 9.99, email: 'a@b.c'});

    it('exclude drops the listed keys', async () => {
      const sdk = await send({eventProperties: {exclude: ['email']}}, purchase());

      expect(sdk.forwardEvent.mock.calls[0][0].properties).toEqual({plan: 'pro', price: 9.99});
    });

    it('include keeps only the listed keys', async () => {
      const sdk = await send({eventProperties: {include: ['plan']}}, purchase());

      expect(sdk.forwardEvent.mock.calls[0][0].properties).toEqual({plan: 'pro'});
    });

    it('the filter and the transform never see a dropped key', async () => {
      const seen: unknown[] = [];
      await send(
        {
          eventProperties: {exclude: [/mail/]},
          filter: (event) => {
            seen.push(event.event_properties);
            return true;
          },
          transform: (event) => {
            seen.push(event.event_properties);
            return {};
          },
        },
        purchase(),
      );

      expect(seen).toEqual([
        {plan: 'pro', price: 9.99},
        {plan: 'pro', price: 9.99},
      ]);
    });

    it('autocaptured keys are matched with their prefix', async () => {
      const sdk = await send(
        {autocapture: ['[Amplitude] Screen Viewed'], eventProperties: {exclude: ['[Amplitude] Screen Name']}},
        eventOf('[Amplitude] Screen Viewed', {'[Amplitude] Screen Name': 'Home', '[Amplitude] Page Counter': 2}),
      );

      expect(sdk.forwardEvent.mock.calls[0][0].properties).toEqual({'Page Counter': 2});
    });

    it('the event Amplitude keeps is not changed', async () => {
      const event = purchase();
      await send({eventProperties: {exclude: ['email']}}, event);

      expect(event.event_properties).toEqual({plan: 'pro', price: 9.99, email: 'a@b.c'});
    });
  });

  describe('lists the plugin cannot read', () => {
    it.each([
      ['an include that is not an array', {events: {include: 'Purchase'}}],
      ['an entry that is neither a string nor a pattern', {events: {exclude: [42]}}],
      ['a proxy that only pretends to be a pattern', {events: {include: [new Proxy(/Purchase/, {})]}}],
      ['lists that are not an object', {events: 'Purchase'}],
    ])('%s forwards nothing and warns once, without throwing at creation', async (_, options) => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const sdk = await send(options as unknown as AmplyPluginOptions, eventOf('Purchase'), eventOf('Other'));

      expect(sdk.forwardEvent).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('a getter that throws on the options does not escape amplyPlugin()', () => {
      const {Amply} = load();
      const options = Object.defineProperty({}, 'events', {
        get() {
          throw new Error('hostile');
        },
      }) as AmplyPluginOptions;

      expect(() => Amply.amplyPlugin(options)).not.toThrow();
    });

    it('unreadable eventProperties lists send the event without properties', async () => {
      const sdk = await send(
        {eventProperties: {exclude: 'email'}} as unknown as AmplyPluginOptions,
        eventOf('Purchase', {plan: 'pro', email: 'a@b.c'}),
      );

      expect(sdk.forwardEvent.mock.calls[0][0].properties).toEqual({});
    });

    it('unreadable userProperties lists copy nothing', async () => {
      const sdk = load();
      const plugin = await install(sdk.Amply, {userProperties: {exclude: 'email'}} as unknown as AmplyPluginOptions);
      await plugin.execute(identifyOf({$set: {plan: 'pro'}}));
      await settle();

      expect(sdk.setCustomProperties).not.toHaveBeenCalled();
    });
  });

  describe('patterns keep their flags', () => {
    it('a sticky pattern still matches only at the start', async () => {
      const sdk = await send({events: {include: [/Purchase/y]}}, eventOf('Purchase'), eventOf('Not Purchase'));

      expect(names(sdk.forwardEvent)).toEqual(['Purchase']);
    });

    it('a case-insensitive pattern stays case-insensitive', async () => {
      const sdk = await send({events: {exclude: [/^debug/i]}}, eventOf('DEBUG tap'), eventOf('Purchase'));

      expect(names(sdk.forwardEvent)).toEqual(['Purchase']);
    });
  });

  describe('a property that points back at its own object', () => {
    it('does not bring an excluded key back to the filter or transform', async () => {
      const properties: Record<string, unknown> = {plan: 'pro', secret: 'private'};
      properties.self = properties;
      const seen: string[] = [];
      await send(
        {
          eventProperties: {exclude: ['secret']},
          filter: (event) => {
            seen.push(JSON.stringify(event.event_properties));
            return true;
          },
        },
        eventOf('Purchase', properties),
      );

      expect(seen).toEqual([JSON.stringify({plan: 'pro'})]);
    });
  });

  describe('only the kept keys are copied', () => {
    it('an excluded branch does not use up the copy budget of the kept keys', async () => {
      const sdk = await send(
        {eventProperties: {include: ['tags', 'when']}},
        eventOf('Purchase', {noise: Array.from({length: 1000}, () => ({})), tags: ['a'], when: new Date(5)}),
      );

      expect(sdk.forwardEvent.mock.calls[0][0].properties).toEqual({tags: ['a'], when: 5});
    });

    it('an array with a hole is still refused whole, as without lists', async () => {
      const sdk = await send({eventProperties: {}}, eventOf('Purchase', {tags: ['a', undefined, 'b'], plan: 'pro'}));

      expect(sdk.forwardEvent.mock.calls[0][0].properties).toEqual({plan: 'pro'});
    });

    it('a throwing getter on an excluded key is never read', async () => {
      const properties = Object.defineProperty({plan: 'pro'}, 'secret', {
        enumerable: true,
        get() {
          throw new Error('hostile');
        },
      });
      const sdk = await send({eventProperties: {exclude: ['secret']}}, eventOf('Purchase', properties));

      expect(sdk.forwardEvent.mock.calls[0][0].properties).toEqual({plan: 'pro'});
    });

    it('a throwing getter under an excluded key does not drop the event', async () => {
      const sdk = await send(
        {eventProperties: {include: ['plan']}},
        eventOf('Purchase', {
          plan: 'pro',
          ignored: {
            get value() {
              throw new Error('hostile');
            },
          },
        }),
      );

      expect(sdk.forwardEvent.mock.calls[0][0].properties).toEqual({plan: 'pro'});
    });
  });

  describe('user properties', () => {
    const identify = async (options: AmplyPluginOptions, userProperties: Record<string, unknown>): Promise<Sdk> => {
      const sdk = load();
      const plugin = await install(sdk.Amply, options);
      await plugin.execute(identifyOf(userProperties));
      await settle();
      return sdk;
    };

    it('exclude copies every key but the listed ones', async () => {
      const sdk = await identify(
        {userProperties: {exclude: ['email']}},
        {$set: {plan: 'pro', email: 'a@b.c', trial: true}, $unset: {email: '-', coupon: '-'}},
      );

      expect(sdk.setCustomProperties.mock.calls).toEqual([[{plan: 'pro', trial: true}]]);
      expect(sdk.removeCustomProperty.mock.calls).toEqual([['coupon']]);
    });

    it('include works like the plain list', async () => {
      const sdk = await identify({userProperties: {include: [/^plan/]}}, {$set: {plan: 'pro', plan_tier: 2, email: 'x'}});

      expect(sdk.setCustomProperties.mock.calls).toEqual([[{plan: 'pro', plan_tier: 2}]]);
    });

    it('an object with neither list copies every key', async () => {
      const sdk = await identify({userProperties: {}}, {$set: {plan: 'pro'}});

      expect(sdk.setCustomProperties.mock.calls).toEqual([[{plan: 'pro'}]]);
    });
  });
});
