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

    // The set mutations left this table on purpose: they are string sets now, see below.
    it.each(['$setOnce', '$add', '$clearAll'])(
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

  describe('string sets', () => {
    const TAGS = {userProperties: ['tags']};

    describe('$set with a list', () => {
      it('a list of strings sets the whole set', async () => {
        const sdk = await identify(TAGS, {$set: {tags: ['a', 'b']}});

        expect(sdk.setCustomProperties.mock.calls).toEqual([[{tags: ['a', 'b']}]]);
      });

      it('an empty list is a value', async () => {
        const sdk = await identify(TAGS, {$set: {tags: []}});

        expect(sdk.setCustomProperties.mock.calls).toEqual([[{tags: []}]]);
      });

      it('numbers become text, integers without .0', async () => {
        const sdk = await identify(TAGS, {$set: {tags: [1, 1.5, 'a', 0, -2]}});

        expect(sdk.setCustomProperties.mock.calls).toEqual([[{tags: ['1', '1.5', 'a', '0', '-2']}]]);
      });

      it('sits next to scalars in one call', async () => {
        const sdk = await identify({userProperties: ['tags', 'plan']}, {$set: {plan: 'pro', tags: ['a']}});

        expect(sdk.setCustomProperties.mock.calls).toEqual([[{plan: 'pro', tags: ['a']}]]);
      });

      it('limits are left to the native SDK', async () => {
        const many = Array.from({length: 101}, (_, index) => `t${index}`);
        const sdk = await identify(TAGS, {$set: {tags: many}});

        expect(sdk.setCustomProperties.mock.calls).toEqual([[{tags: many}]]);
      });
    });

    describe('mutations', () => {
      it.each(['$append', '$postInsert', '$prepend', '$preInsert'])('%s adds to the set', async (operation) => {
        const sdk = await identify(TAGS, {[operation]: {tags: ['a', 'b']}});

        expect(bridgeCalls(sdk)).toEqual(['add:tags:["a","b"]']);
      });

      it('$remove removes from the set', async () => {
        const sdk = await identify(TAGS, {$remove: {tags: ['a', 'b']}});

        expect(bridgeCalls(sdk)).toEqual(['remove:tags:["a","b"]']);
      });

      it.each<[string, unknown, string[]]>([
        ['a string', 'a', ['a']],
        ['an integer', 1, ['1']],
        ['a fraction', 1.5, ['1.5']],
      ])('%s on its own is a one-item list', async (_, value, expected) => {
        const sdk = await identify(TAGS, {$append: {tags: value}, $remove: {tags: value}});

        expect(sdk.addToCustomPropertySet.mock.calls).toEqual([['tags', expected]]);
        expect(sdk.removeFromCustomPropertySet.mock.calls).toEqual([['tags', expected]]);
      });

      it('numbers inside the list become text', async () => {
        const sdk = await identify(TAGS, {$append: {tags: [1, 1.5, 'x']}});

        expect(sdk.addToCustomPropertySet.mock.calls).toEqual([['tags', ['1', '1.5', 'x']]]);
      });

      it('copies only the allowed keys', async () => {
        const sdk = await identify(TAGS, {$append: {tags: 'a', other: 'b'}, $remove: {other: 'c'}});

        expect(bridgeCalls(sdk)).toEqual(['add:tags:["a"]']);
      });

      it('an exclude list holds for mutations', async () => {
        const sdk = await identify(
          {userProperties: {exclude: ['email']}},
          {$append: {email: 'a@b.c', tags: 'a'}, $remove: {email: 'a@b.c'}},
        );

        expect(bridgeCalls(sdk)).toEqual(['add:tags:["a"]']);
      });

      it('a predicate sees the key and the list as it will be sent', async () => {
        const userProperties = jest.fn(() => true);
        await identify({userProperties}, {$append: {tags: [1, 'a']}});

        expect(userProperties.mock.calls).toEqual([['tags', ['1', 'a']]]);
      });

      it('a blank key is dropped', async () => {
        const sdk = await identify({userProperties: () => true}, {$append: {' ': 'a'}, $remove: {'': 'a'}});

        expect(bridgeCalls(sdk)).toEqual([]);
      });

      it('a bad value costs its key, not the others', async () => {
        const sdk = await identify({userProperties: ['tags', 'tiers']}, {$append: {tags: [null], tiers: ['gold']}});

        expect(bridgeCalls(sdk)).toEqual(['add:tiers:["gold"]']);
      });

      it('an operation that is not an object is not an error', async () => {
        const sdk = await identify(TAGS, {$append: 'tags', $remove: ['tags']});

        expect(bridgeCalls(sdk)).toEqual([]);
      });

      it('a parked mutation keeps the values it was given', async () => {
        const sdk = load({}, false);
        const plugin = await install(sdk.Amply, TAGS);
        const values = ['a'];
        await plugin.execute(identifyOf({$append: {tags: values}}));

        values.push('changed-later');
        await sdk.Amply.initialize(CONFIG);
        await settle();

        expect(sdk.addToCustomPropertySet.mock.calls).toEqual([['tags', ['a']]]);
      });

      it('a mutation that throws costs that item, not the queue', async () => {
        const sdk = load();
        sdk.addToCustomPropertySet.mockImplementationOnce(() => {
          throw new Error('bridge threw');
        });
        const plugin = await install(sdk.Amply, TAGS);

        await plugin.execute(identifyOf({$append: {tags: 'a'}}));
        await plugin.execute(eventFor('next'));
        await settle();

        expect(names(sdk.forwardEvent)).toEqual(['next']);
      });
    });

    describe('order within one identify', () => {
      it('$set goes before $append on the same key', async () => {
        const sdk = await identify(TAGS, {$set: {tags: ['a']}, $append: {tags: 'b'}});

        expect(bridgeCalls(sdk)).toEqual(['set:{"tags":["a"]}', 'add:tags:["b"]']);
      });

      it("follows Amplitude's order of operations, not the order of the keys", async () => {
        const sdk = await identify(TAGS, {
          $remove: {tags: 'e'},
          $postInsert: {tags: 'd'},
          $preInsert: {tags: 'c'},
          $prepend: {tags: 'b'},
          $append: {tags: 'a'},
          $set: {tags: ['s']},
        });

        expect(bridgeCalls(sdk)).toEqual([
          'set:{"tags":["s"]}',
          'add:tags:["a"]',
          'add:tags:["b"]',
          'add:tags:["c"]',
          'add:tags:["d"]',
          'remove:tags:["e"]',
        ]);
      });

      it('$unset goes before the mutations, as in Amplitude', async () => {
        const sdk = await identify(TAGS, {$append: {tags: 'a'}, $unset: {tags: '-'}});

        expect(bridgeCalls(sdk)).toEqual(['unset:tags', 'add:tags:["a"]']);
      });
    });

    describe('a list that cannot be a set', () => {
      it.each<[string, unknown]>([
        ['null', null],
        ['undefined', undefined],
        ['true', true],
        ['an object', {tier: 'pro'}],
        ['a nested list', ['a']],
        ['NaN', NaN],
        ['Infinity', Infinity],
        ['a Date', new Date(5)],
      ])('a list holding %s is dropped whole', async (_, item) => {
        const sdk = await identify(TAGS, {
          $set: {tags: ['ok', item]},
          $append: {tags: ['ok', item]},
          $remove: {tags: ['ok', item]},
        });

        expect(bridgeCalls(sdk)).toEqual([]);
      });

      it.each<[string, unknown]>([
        ['null', null],
        ['true', true],
        ['an object', {tier: 'pro'}],
        ['NaN', NaN],
      ])('a mutation of %s on its own is dropped', async (_, value) => {
        const sdk = await identify(TAGS, {$append: {tags: value}, $remove: {tags: value}});

        expect(bridgeCalls(sdk)).toEqual([]);
      });

      it('says so under debug, naming the key and the operation', async () => {
        const debug = jest.spyOn(console, 'debug').mockImplementation(() => {});

        await identify({...TAGS, debug: true}, {$set: {tags: ['a', null]}, $append: {tags: [true]}});

        const lines = debug.mock.calls.map(([line]) => String(line));
        expect(lines).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/^\[Amply\] .*\$set tags.*text or a number/),
            expect.stringMatching(/^\[Amply\] .*\$append tags.*text or a number/),
          ]),
        );
      });

      it('a single bad operand is named as a value, not as a list', async () => {
        const debug = jest.spyOn(console, 'debug').mockImplementation(() => {});

        await identify({...TAGS, debug: true}, {$append: {tags: true}});

        const lines = debug.mock.calls.map(([line]) => String(line));
        expect(lines).toContain('[Amply] skipped $append tags: value must be text, a number or a list of them');
        expect(lines.some((line) => line.includes('every list item'))).toBe(false);
      });

      it('is quiet without debug', async () => {
        const debug = jest.spyOn(console, 'debug').mockImplementation(() => {});

        await identify(TAGS, {$set: {tags: ['a', null]}});

        expect(debug).not.toHaveBeenCalled();
      });

      it('does not mention a key the host did not ask for', async () => {
        const debug = jest.spyOn(console, 'debug').mockImplementation(() => {});

        await identify({...TAGS, debug: true}, {$set: {secret_list: ['a', null]}});

        const lines = debug.mock.calls.map(([line]) => String(line));
        expect(lines.some((line) => line.includes('secret_list'))).toBe(false);
      });
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
