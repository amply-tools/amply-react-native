/** What the plugin copies about the user: §8 of the spec, row by row. */
import type {AmplyPluginOptions} from '../amplitudePlugin';
import {bridgeCalls, CONFIG, eventFor, identifyOf, install, load, names, settle} from './amplitudePluginHarness';
import type {Sdk} from './amplitudePluginHarness';

type Config = {optOut: boolean; userId?: string};

describe('amplyPlugin user properties', () => {
  const NAMED = {userProperties: ['plan']};

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const identify = async (
    options: AmplyPluginOptions | undefined,
    userProperties: Record<string, unknown>,
  ): Promise<Sdk> => {
    const sdk = load();
    const plugin = await install(sdk.Amply, options);
    await plugin.execute(identifyOf(userProperties));
    await settle();
    return sdk;
  };

  describe('§8 operations, one row each', () => {
    it('$set goes to setCustomProperties for the allowed keys', async () => {
      const sdk = await identify(NAMED, {$set: {plan: 'pro'}});

      expect(sdk.setCustomProperties.mock.calls).toEqual([[{plan: 'pro'}]]);
    });

    it('$unset removes listed keys', async () => {
      const sdk = await identify({userProperties: ['plan', 'trial']}, {$unset: {plan: '-', trial: '-'}});

      expect(sdk.removeCustomProperty.mock.calls).toEqual([['plan'], ['trial']]);
    });

    it('$unset leaves keys that are not listed alone', async () => {
      const sdk = await identify(NAMED, {$unset: {other: '-'}});

      expect(sdk.removeCustomProperty).not.toHaveBeenCalled();
    });

    it.each(['$setOnce', '$add', '$append', '$prepend', '$preInsert', '$postInsert', '$remove', '$clearAll'])(
      '%s is ignored',
      async (operation) => {
        const sdk = await identify(NAMED, {[operation]: {plan: 'pro'}});

        expect(bridgeCalls(sdk)).toEqual([]);
      },
    );

    it('$setOnce, $add, $clearAll are ignored next to a $set', async () => {
      const sdk = await identify(NAMED, {
        $set: {plan: 'pro'},
        $setOnce: {plan: 'first'},
        $add: {plan: 1},
        $clearAll: '-',
      });

      expect(bridgeCalls(sdk)).toEqual(['set:{"plan":"pro"}']);
    });
  });

  describe('§8 values, one row each', () => {
    const EDGE_KEY = 'k'.repeat(32);
    const EDGE_TEXT = 's'.repeat(255);

    it.each<[string, unknown]>([
      ['a string of 255', EDGE_TEXT],
      ['an empty string', ''],
      ['a finite number', 9.5],
      ['zero', 0],
      ['true', true],
      ['false', false],
    ])('%s passes', async (_, value) => {
      const sdk = await identify(NAMED, {$set: {plan: value}});

      expect(sdk.setCustomProperties.mock.calls).toEqual([[{plan: value}]]);
    });

    it('a key of 32 passes', async () => {
      const sdk = await identify({userProperties: [EDGE_KEY]}, {$set: {[EDGE_KEY]: 'x'}});

      expect(sdk.setCustomProperties.mock.calls).toEqual([[{[EDGE_KEY]: 'x'}]]);
    });

    it('33 long key and 256 long string are dropped, not cut', async () => {
      const longKey = `${EDGE_KEY}k`;
      const sdk = await identify(
        {userProperties: [longKey, 'plan', 'kept']},
        {$set: {[longKey]: 'x', plan: `${EDGE_TEXT}s`, kept: 'x'}},
      );

      expect(sdk.setCustomProperties.mock.calls).toEqual([[{kept: 'x'}]]);
    });

    it.each<[string, unknown]>([
      ['null', null],
      ['undefined', undefined],
      ['an array', ['pro']],
      ['an object', {tier: 'pro'}],
      ['a Date', new Date(5)],
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['-Infinity', -Infinity],
    ])('%s is dropped and nothing crosses the bridge', async (_, value) => {
      const sdk = await identify(NAMED, {$set: {plan: value}});

      expect(sdk.setCustomProperties).not.toHaveBeenCalled();
    });

    it.each(['', '   '])('a blank key %j is dropped', async (key) => {
      const sdk = await identify({userProperties: () => true}, {$set: {[key]: 'x'}, $unset: {[key]: '-'}});

      expect(bridgeCalls(sdk)).toEqual([]);
    });

    it('a bad value costs its key, not the others', async () => {
      const sdk = await identify({userProperties: ['plan', 'tier']}, {$set: {plan: null, tier: 'gold'}});

      expect(sdk.setCustomProperties.mock.calls).toEqual([[{tier: 'gold'}]]);
    });
  });

  describe('which keys', () => {
    it('userProperties unset by default ignores $set', async () => {
      const sdk = await identify(undefined, {$set: {plan: 'pro'}, $unset: {trial: '-'}});

      expect(bridgeCalls(sdk)).toEqual([]);
    });

    it('key list copies only listed keys', async () => {
      const sdk = await identify(NAMED, {$set: {plan: 'pro', email: 'a@b.c'}});

      expect(sdk.setCustomProperties.mock.calls).toEqual([[{plan: 'pro'}]]);
    });

    it('true copies nothing, on purpose', async () => {
      const sdk = await identify({userProperties: true as never}, {$set: {plan: 'pro'}});

      expect(bridgeCalls(sdk)).toEqual([]);
    });

    it('a predicate decides per key and sees the key and the value', async () => {
      const userProperties = jest.fn((key: string) => key === 'plan');
      const sdk = await identify({userProperties}, {$set: {plan: 'pro', other: 1}});

      expect(sdk.setCustomProperties.mock.calls).toEqual([[{plan: 'pro'}]]);
      expect(userProperties.mock.calls).toEqual([
        ['plan', 'pro'],
        ['other', 1],
      ]);
    });

    it('a predicate that does not return true drops the key', async () => {
      const sdk = await identify({userProperties: (() => 'yes') as never}, {$set: {plan: 'pro'}});

      expect(sdk.setCustomProperties).not.toHaveBeenCalled();
    });

    it('predicate throwing drops that key', async () => {
      const userProperties = (key: string): boolean => {
        if (key === 'bad') {
          throw new Error('host bug');
        }
        return true;
      };
      const sdk = await identify({userProperties}, {$set: {bad: 1, plan: 'pro'}});

      expect(sdk.setCustomProperties.mock.calls).toEqual([[{plan: 'pro'}]]);
    });

    it('a predicate never sees a value that cannot be copied', async () => {
      const userProperties = jest.fn(() => true);
      await identify({userProperties}, {$set: {plan: {tier: 'pro'}}});

      expect(userProperties).not.toHaveBeenCalled();
    });

    it('a predicate decides $unset too', async () => {
      const sdk = await identify({userProperties: (key) => key === 'plan'}, {$unset: {plan: '-', other: '-'}});

      expect(sdk.removeCustomProperty.mock.calls).toEqual([['plan']]);
    });
  });

  describe('in the queue', () => {
    it('nothing to copy sends nothing', async () => {
      const sdk = await identify(NAMED, {$set: {other: 'x'}});

      expect(bridgeCalls(sdk)).toEqual([]);
    });

    it.each<[string, unknown]>([
      ['no operations', undefined],
      ['$set that is not an object', 'plan'],
    ])('%s is not an error', async (_, operation) => {
      const sdk = await identify({userProperties: () => true}, operation === undefined ? {} : {$set: operation});

      expect(bridgeCalls(sdk)).toEqual([]);
    });

    it('$identify is never forwarded as an event', async () => {
      const sdk = await identify(NAMED, {$set: {plan: 'pro'}});

      expect(sdk.forwardEvent).not.toHaveBeenCalled();
    });

    it('$groupidentify copies nothing', async () => {
      const sdk = load();
      const plugin = await install(sdk.Amply, NAMED);

      await plugin.execute({...eventFor('$groupidentify'), user_properties: {$set: {plan: 'pro'}}});
      await settle();

      expect(bridgeCalls(sdk)).toEqual([]);
    });

    it('the host filter has no say over $identify', async () => {
      const sdk = await identify({...NAMED, filter: () => false}, {$set: {plan: 'pro'}});

      expect(sdk.setCustomProperties).toHaveBeenCalledTimes(1);
    });

    it('parks with events and keeps their order', async () => {
      const sdk = load({}, false);
      const plugin = await install(sdk.Amply, NAMED);
      await plugin.execute(eventFor('before'));
      await plugin.execute(identifyOf({$set: {plan: 'pro'}, $unset: {plan: '-'}}));
      await plugin.execute(eventFor('after'));
      await settle();
      expect(bridgeCalls(sdk)).toEqual([]);

      await sdk.Amply.initialize(CONFIG);
      await settle();

      expect(bridgeCalls(sdk)).toEqual(['event:before', 'set:{"plan":"pro"}', 'unset:plan', 'event:after']);
    });

    it('a new id goes before the properties of the same identify', async () => {
      const sdk = load();
      const config: Config = {optOut: false, userId: 'A'};
      const plugin = await install(sdk.Amply, NAMED, {}, config);

      await plugin.execute(identifyOf({$set: {plan: 'pro'}}, 'A'));
      await settle();

      expect(bridgeCalls(sdk)).toEqual(['id:A', 'set:{"plan":"pro"}']);
    });

    it('a parked copy keeps the value it was set with', async () => {
      const sdk = load({}, false);
      const plugin = await install(sdk.Amply, NAMED);
      const set = {plan: 'pro'};
      await plugin.execute(identifyOf({$set: set}));

      set.plan = 'changed-later';
      await sdk.Amply.initialize(CONFIG);
      await settle();

      expect(sdk.setCustomProperties.mock.calls).toEqual([[{plan: 'pro'}]]);
    });

    it('opt-out and teardown clear parked copies', async () => {
      const sdk = load({}, false);
      const optedOut = await install(sdk.Amply, NAMED);
      const removed = await install(sdk.Amply, NAMED);
      await optedOut.execute(identifyOf({$set: {plan: 'pro'}}));
      await removed.execute(identifyOf({$unset: {plan: '-'}}));

      await optedOut.onOptOutChanged(true);
      await removed.teardown();
      await sdk.Amply.initialize(CONFIG);
      await settle();

      expect(bridgeCalls(sdk)).toEqual([]);
    });

    it('a setCustomProperties that throws costs that item, not the queue', async () => {
      const sdk = load();
      sdk.setCustomProperties.mockImplementationOnce(() => {
        throw new Error('bridge threw');
      });
      const plugin = await install(sdk.Amply, NAMED);

      await plugin.execute(identifyOf({$set: {plan: 'pro'}}));
      await plugin.execute(eventFor('next'));
      await settle();

      expect(names(sdk.forwardEvent)).toEqual(['next']);
    });

    it('does nothing while opted out', async () => {
      const sdk = load();
      const plugin = await install(sdk.Amply, NAMED, {}, {optOut: true});

      await plugin.execute(identifyOf({$set: {plan: 'pro'}}));
      await settle();

      expect(bridgeCalls(sdk)).toEqual([]);
    });
  });
});
