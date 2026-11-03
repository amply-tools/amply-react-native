/** What the plugin does with the host's own functions and with values it has to copy for them. */
import type {AmplyPluginOptions} from '../amplitudePlugin';
import {MAX_COPIED_VALUES, clonePlain} from '../amplitudePluginValues';
import {eventOf, identifyEvent, identifyOf, install, load, settle} from './amplitudePluginHarness';

/** Values in a copy, counted by walking it: a copy is a tree, so every node is one value. */
function countValues(value: unknown): number {
  if (value === null || typeof value !== 'object') {
    return 0;
  }
  const children = Array.isArray(value) ? value : Object.values(value);
  return 1 + children.reduce<number>((sum, child) => sum + countValues(child), 0);
}

describe('clonePlain budget', () => {
  it('copies a graph of shared objects within the budget, not once per path', () => {
    const REFERENCES = 6;
    const LEVELS = 7;
    let level: Record<string, unknown> = {leaf: true};
    for (let depth = 0; depth < LEVELS; depth += 1) {
      const next: Record<string, unknown> = {};
      for (let index = 0; index < REFERENCES; index += 1) {
        next[`ref${index}`] = level;
      }
      level = next;
    }

    const copy = clonePlain({event_properties: level});

    // 6^7 paths would be 279936 copied values.
    expect(countValues(copy)).toBeLessThanOrEqual(MAX_COPIED_VALUES);
    expect(countValues(copy)).toBeGreaterThan(0);
  });

  it('leaves a small event untouched by the budget', () => {
    const event = {event_type: 'Purchase', event_properties: {plan: 'pro', tags: ['a', 'b'], when: new Date(5)}};

    expect(clonePlain(event)).toEqual(event);
  });
});

describe('a host callback that returns a promise', () => {
  const unhandled: unknown[] = [];
  const record = (reason: unknown): void => {
    unhandled.push(reason);
  };

  beforeEach(() => {
    unhandled.length = 0;
    process.on('unhandledRejection', record);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.off('unhandledRejection', record);
    jest.restoreAllMocks();
  });

  const letRejectionsSurface = async (): Promise<void> => {
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await settle();
  };

  it('filter: a rejecting async function drops the event and leaves no unhandled rejection', async () => {
    const {Amply, forwardEvent} = load();
    const plugin = await install(Amply, {
      filter: (async () => {
        throw new Error('filter failed later');
      }) as never,
    });

    await plugin.execute(eventOf('Purchase', {plan: 'pro'}));
    await letRejectionsSurface();

    expect(forwardEvent).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
  });

  it('transform: a rejecting async function drops the event and leaves no unhandled rejection', async () => {
    const {Amply, forwardEvent} = load();
    const plugin = await install(Amply, {
      transform: (async () => {
        throw new Error('transform failed later');
      }) as never,
    });

    await plugin.execute(eventOf('Purchase', {plan: 'pro'}));
    await letRejectionsSurface();

    expect(forwardEvent).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
  });

  it('userProperties: a rejecting async function copies nothing and leaves no unhandled rejection', async () => {
    const {Amply, setCustomProperties} = load();
    const plugin = await install(Amply, {
      userProperties: (async () => {
        throw new Error('userProperties failed later');
      }) as never,
    });

    await plugin.execute(identifyOf({$set: {plan: 'pro'}}));
    await letRejectionsSurface();

    expect(setCustomProperties).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
  });

  it('a thenable whose then throws does not escape the plugin', async () => {
    const {Amply, forwardEvent} = load();
    const hostile = {
      get then(): never {
        throw new Error('no looking');
      },
    };
    const plugin = await install(Amply, {filter: (() => hostile) as never});

    await expect(plugin.execute(eventOf('Purchase'))).resolves.toBeDefined();
    await letRejectionsSurface();

    expect(forwardEvent).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
  });

  describe('what a callback threw stays out of the logs', () => {
    const secret = 'person@example.test';
    const failing = (): never => {
      throw new Error(`Invalid email: ${secret}`);
    };
    const logged = (...spies: jest.SpyInstance[]): string =>
      spies.flatMap((spy) => spy.mock.calls).flat().join(' ');

    it.each([
      ['filter', {filter: failing}],
      ['transform', {transform: failing}],
      ['userProperties', {userProperties: failing}],
    ])('%s, with debug on too', async (_, options) => {
      const warnings = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const debugs = jest.spyOn(console, 'debug').mockImplementation(() => {});
      const {Amply} = load();
      const plugin = await install(Amply, {...options, debug: true} as AmplyPluginOptions);

      await plugin.execute(eventOf('Signup', {email: secret}));
      await plugin.execute({...identifyEvent, user_properties: {$set: {email: secret}}});
      await settle();

      expect(warnings).toHaveBeenCalled();
      expect(logged(warnings, debugs)).not.toContain(secret);
    });
  });
});
