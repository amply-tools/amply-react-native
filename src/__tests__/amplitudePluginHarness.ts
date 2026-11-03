/** Shared by the amplyPlugin suites. Not a test file: lives here so the package leaves it out. */
import type {AmplitudeEventLike, AmplyPluginOptions} from '../amplitudePlugin';

export type SdkModule = typeof import('../index') & typeof import('../amplitudePlugin');
export type Payload = {source: string; name: string; properties?: Record<string, unknown> | null};

export const CONFIG = {apiKeyPublic: 'pub', apiKeySecret: 'sec', appId: 'app'};

export const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Both entry points of the package, in one copy of its modules, as a host app that uses both has. */
function requireSdk(): SdkModule {
  /* eslint-disable @typescript-eslint/no-var-requires */
  return {...require('../index'), ...require('../amplitudePlugin')};
  /* eslint-enable @typescript-eslint/no-var-requires */
}

/** The queue and the client marks are module state, so each test loads its own copy of the SDK. */
export function load(overrides: Record<string, unknown> = {}, isUp = true) {
  const state = {isUp};
  const forwardEvent = jest.fn<Promise<void>, [Payload]>(() => Promise.resolve());
  const setUserId = jest.fn<void, [string | null]>();
  const setCustomProperties = jest.fn<void, [Record<string, unknown>]>();
  const removeCustomProperty = jest.fn<void, [string]>();
  const native = {
    isInitialized: () => state.isUp,
    initialize: jest.fn(async () => {
      state.isUp = true;
    }),
    forwardEvent,
    setUserId,
    setCustomProperties,
    removeCustomProperty,
    ...overrides,
  };
  let Amply!: SdkModule;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../nativeModule').__setNativeModule(native as never);
    Amply = requireSdk();
  });
  return {Amply, state, forwardEvent, setUserId, setCustomProperties, removeCustomProperty};
}

export function loadWithoutNativeModule(): SdkModule {
  let Amply!: SdkModule;
  jest.isolateModules(() => {
    Amply = requireSdk();
  });
  return Amply;
}

export async function install(
  Amply: SdkModule,
  options?: AmplyPluginOptions,
  client: object = {},
  config: {optOut?: boolean; userId?: string} = {optOut: false},
) {
  const plugin = Amply.amplyPlugin(options);
  await plugin.setup(config, client);
  return plugin;
}

/** The part of Amplitude's client the plugin reads. */
export type ClientLike = {timeline: {plugins: readonly object[]}};

export const coreClient = (): ClientLike => ({timeline: {plugins: []}});

type Plugin = Awaited<ReturnType<typeof install>>;

/** Core's `add`: `setup` first, the listing after it. */
export async function list(
  plugin: Plugin,
  client: ClientLike,
  config: {optOut?: boolean; userId?: string} = {optOut: false},
): Promise<void> {
  await plugin.setup(config, client);
  client.timeline.plugins = [...client.timeline.plugins, plugin];
}

/** Core's `remove`: off the list, then `teardown`. Only the first listing goes. */
export async function unlist(plugin: Plugin, client: ClientLike): Promise<void> {
  const index = client.timeline.plugins.indexOf(plugin);
  client.timeline.plugins = client.timeline.plugins.filter((_, position) => position !== index);
  await plugin.teardown();
}

/** Core's `reset`, the other way round: `teardown` for all, and the list is emptied right after. */
export async function resetCore(client: ClientLike): Promise<void> {
  const teardowns = client.timeline.plugins.map((plugin) => (plugin as Plugin).teardown());
  client.timeline.plugins = [];
  await Promise.all(teardowns);
}

/** What core hands a destination for `amplitude.track(name, properties)`. */
export function eventOf(name: string, properties?: Record<string, unknown>): AmplitudeEventLike {
  return {
    event_type: name,
    ...(properties ? {event_properties: properties} : {}),
    user_id: 'user-1',
    time: 1761800000000,
  };
}

export const identifyEvent: AmplitudeEventLike = {
  event_type: '$identify',
  user_properties: {$set: {plan: 'pro'}},
};

export const names = (forwardEvent: jest.Mock<Promise<void>, [Payload]>): string[] =>
  forwardEvent.mock.calls.map(([payload]) => payload.name);

export type Sdk = ReturnType<typeof load>;

export const eventFor = (name: string, userId?: string): AmplitudeEventLike => ({
  event_type: name,
  ...(userId === undefined ? {} : {user_id: userId}),
  time: 1761800000000,
});

export const identifyOf = (userProperties: Record<string, unknown>, userId?: string): AmplitudeEventLike => ({
  ...eventFor('$identify', userId),
  user_properties: userProperties,
});

/** Everything that crossed the bridge, in the order it crossed. */
export function bridgeCalls(sdk: Sdk): string[] {
  const entries = (mock: jest.Mock, describeCall: (args: never[]) => string) =>
    mock.mock.calls.map((args, index) => ({
      order: mock.mock.invocationCallOrder[index],
      text: describeCall(args as never[]),
    }));
  return [
    ...entries(sdk.forwardEvent, ([payload]: Array<{name: string}>) => `event:${payload.name}`),
    ...entries(sdk.setUserId, ([id]) => `id:${String(id)}`),
    ...entries(sdk.setCustomProperties, ([map]) => `set:${JSON.stringify(map)}`),
    ...entries(sdk.removeCustomProperty, ([key]) => `unset:${String(key)}`),
  ]
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.text);
}
