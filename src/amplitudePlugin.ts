/**
 * Destination plugin for Amplitude: `amplitude.add(amplyPlugin())` sends what the app already
 * tracks into Amply, on the device, in time to start a campaign.
 *
 * A thin adapter on purpose. It knows Amplitude and calls the host's callbacks; the rules for
 * names, properties and volume live behind `forwardEvent` in the native SDK, shared by every
 * platform. Types here are structural: importing Amplitude would make it a dependency of every
 * app that installs Amply.
 *
 * Published as its own entry point, `@amplytools/react-native-amply-sdk/amplitude`, so an app without
 * Amplitude never loads this file. `./index` must not import it, and it reaches the SDK through the
 * native module and {@link onSdkSignal}: its own `setUserId` must not read as the host's.
 */
import {
  clonePlain,
  isPlainObject,
  isUserPropertyKey,
  isUserPropertyValue,
  toBridgeProperties,
} from './amplitudePluginValues';
import type {FlatValue, Properties} from './amplitudePluginValues';
import {createNameTest, pickKeys} from './amplitudePluginLists';
import type {NameLists} from './amplitudePluginLists';

export type {NameLists, NameMatcher} from './amplitudePluginLists';
import getNativeModule from './nativeModule';
import {onSdkSignal} from './sdkSignals';

export type AmplitudeEventLike = {
  event_type: string;
  event_properties?: Record<string, unknown>;
  user_properties?: Record<string, unknown>;
  user_id?: string;
  time?: number;
};

export type AmplyPluginOptions = {
  /** Which events go to Amply by name: `{include: [...]}` only these, `{exclude: [...]}` all but these. */
  events?: NameLists;
  /** Which event properties go along, by key, the same way. By default all of them. */
  eventProperties?: NameLists;
  /** Whether an event goes to Amply, after the lists. By default every event the plugin's own rules let through. */
  filter?: (event: AmplitudeEventLike) => boolean;
  /** Renames or cleans an event. By default the name and properties stay as they are. */
  transform?: (event: AmplitudeEventLike) => {name?: string; properties?: Record<string, unknown>};
  /** Amplitude's own autocaptured events to keep, e.g. `[Amplitude] Screen Viewed`. By default none. */
  autocapture?: string[];
  /** Follow Amplitude's user id. On by default. */
  syncUserId?: boolean;
  /**
   * Which user properties to copy: a list of keys, `{include}` / `{exclude}` lists, or a function.
   * By default none.
   */
  userProperties?: string[] | NameLists | ((key: string, value: unknown) => boolean);
  /** Log what was skipped and why. */
  debug?: boolean;
};

type AmplitudeConfigLike = {optOut?: boolean; userId?: string};

/** Read structurally: the list of plugins core is really running, whatever `setup` was told. */
type AmplitudeClientLike = {timeline?: {plugins?: unknown}};

export type AmplitudePluginLike = {
  name: 'amply';
  type: 'destination';
  setup(config: AmplitudeConfigLike, client: object): Promise<void>;
  execute<E extends AmplitudeEventLike>(event: E): Promise<{event: E; code: number; message: string}>;
  onOptOutChanged(optOut: boolean): Promise<void>;
  teardown(): Promise<void>;
};

type Outgoing = {name: string; properties: Properties};
type Owner = object;
type QueueItem = {owner: Owner; kind: 'event' | 'identity' | 'property'; run: () => Promise<void>};
type Note = (message: string) => void;
type EnqueueOwn = (kind: QueueItem['kind'], run: QueueItem['run']) => void;
type UserProperties = AmplyPluginOptions['userProperties'];
/** `undefined` is unknown, `null` is empty: only a logout seen by the plugin makes it empty. */
type KnownUser = string | null | undefined;

const FORWARD_SOURCE = 'amplitude';
const QUEUE_LIMIT = 100;
const AUTOCAPTURE_PREFIX = '[Amplitude] ';
const SERVICE_EVENTS = new Set(['$identify', '$groupidentify', 'session_start', 'session_end']);
/** Losing an identity change is the worst case: the plugin believes it was sent and never repeats it. */
const EVICTION_ORDER: ReadonlyArray<QueueItem['kind']> = ['event', 'property', 'identity'];

/**
 * One queue and one worker however many plugins exist, so nothing can overtake what is parked:
 * every item goes through {@link enqueue}, there is no direct path to the bridge.
 */
let queue: readonly QueueItem[] = [];
let isDraining = false;
let evictedCount = 0;
/** Counts the host's own `Amply.setUserId` calls: each one makes what the plugins know out of date. */
let directUserIdCalls = 0;

/** The plugin doing the work for each client. Amplitude lets a second one through on the same tick. */
const clientOwners = new WeakMap<object, Owner>();
const issuedWarnings = new Set<string>();

/** A host's patched console must not reach the queue or Amplitude, and there is nowhere left to report it. */
function log(level: 'warn' | 'debug', message: string): void {
  try {
    console[level](`[Amply] ${message}`);
  } catch {
    // Deliberately empty, see above.
  }
}

function warnOnce(key: string, message: string): void {
  if (issuedWarnings.has(key)) {
    return;
  }
  issuedWarnings.add(key);
  log('warn', message);
}

/** Total: anything can be thrown or rejected, including values that cannot be turned into text. */
function messageOf(error: unknown): string {
  try {
    return String(error instanceof Error ? error.message : error);
  } catch {
    return 'unreadable error';
  }
}

/** How many times core lists [plugin], undefined if the list cannot be read. */
function countListings(client: AmplitudeClientLike | undefined, plugin: object): number | undefined {
  const listed = client?.timeline?.plugins;
  return Array.isArray(listed) ? listed.filter((entry) => entry === plugin).length : undefined;
}

/**
 * Whether [plugin] forwards for [client]. The claim alone decides, so two plugins can never both
 * be active. A holder off core's list gives way to a plugin on it: core 2.61 runs `setup` and skips
 * the listing for `add` and `remove` in one tick, and no `teardown` comes. Unreadable counts as
 * listed, the same as for repeat calls.
 */
function holdsClaim(client: AmplitudeClientLike | undefined, plugin: object): boolean {
  if (!client) {
    return false;
  }
  const holder = clientOwners.get(client);
  const isHolderGone = !holder || countListings(client, holder) === 0;
  if (isHolderGone && (countListings(client, plugin) ?? 1) > 0) {
    clientOwners.set(client, plugin);
  }
  return clientOwners.get(client) === plugin;
}

function isAmplyUp(): boolean {
  try {
    return getNativeModule().isInitialized();
  } catch (error) {
    warnOnce('native', `Amplitude events are not reaching Amply: ${messageOf(error)}`);
    return false;
  }
}

/** Each bridge call starts after the previous one settled, so native sees JS order. */
async function drain(): Promise<void> {
  if (isDraining) {
    return;
  }
  isDraining = true;
  try {
    while (queue.length > 0 && isAmplyUp()) {
      const [next, ...rest] = queue;
      queue = rest;
      await next.run();
    }
  } finally {
    isDraining = false;
  }
}

function evictOne(note: Note): void {
  const victim = EVICTION_ORDER.map((kind) => queue.findIndex((item) => item.kind === kind)).find(
    (index) => index >= 0,
  );
  queue = queue.filter((_, index) => index !== victim);
  evictedCount += 1;
  note(`queue full, ${evictedCount} dropped so far`);
}

/** Parks [item] behind everything already waiting. Its failure costs that item, not the queue. */
function enqueue(item: QueueItem, note: Note): void {
  if (queue.length >= QUEUE_LIMIT) {
    evictOne(note);
  }
  const guarded = async (): Promise<void> => {
    try {
      await item.run();
    } catch (error) {
      note(`dropped a queued ${item.kind}: ${messageOf(error)}`);
    }
  };
  queue = [...queue, {...item, run: guarded}];
  void drain();
}

onSdkSignal((signal) => {
  if (signal === 'initialized') {
    void drain();
    return;
  }
  directUserIdCalls += 1;
  queue = queue.filter((item) => item.kind !== 'identity');
});

function withoutAutocapturePrefix(text: string): string {
  return text.startsWith(AUTOCAPTURE_PREFIX) ? text.slice(AUTOCAPTURE_PREFIX.length) : text;
}

/** Step 3: Amplitude's autocaptured events stay out unless asked for, and lose their prefix. */
function admitAutocaptured<E extends AmplitudeEventLike>(event: E, autocapture?: string[]): E | null {
  if (!event.event_type.startsWith(AUTOCAPTURE_PREFIX)) {
    return event;
  }
  if (!autocapture?.includes(event.event_type)) {
    return null;
  }
  return {
    ...event,
    event_type: withoutAutocapturePrefix(event.event_type),
    event_properties: Object.fromEntries(
      Object.entries(event.event_properties ?? {}).map(([key, value]) => [
        withoutAutocapturePrefix(key),
        value,
      ]),
    ),
  };
}

/** Step 4: only a real `true` lets an event through. */
function passesFilter(
  event: AmplitudeEventLike,
  filter: AmplyPluginOptions['filter'],
  cutAt: readonly object[],
): boolean {
  if (!filter) {
    return true;
  }
  try {
    const answer: unknown = filter(clonePlain(event, cutAt) as AmplitudeEventLike);
    swallowRejection(answer);
    return answer === true;
  } catch {
    warnOnce('filter', 'filter threw, events it failed on are not forwarded');
    return false;
  }
}

/** Step 5: a transform that fails, or that is async, must not let the raw event through. */
function applyTransform(
  event: AmplitudeEventLike,
  transform: AmplyPluginOptions['transform'],
  cutAt: readonly object[],
): {name?: unknown; properties?: unknown} | null {
  if (!transform) {
    return {};
  }
  try {
    const result: unknown = transform(clonePlain(event, cutAt) as AmplitudeEventLike);
    swallowRejection(result);
    if (isPlainObject(result)) {
      return result;
    }
    warnOnce('transform-result', 'transform must return an object, events are not forwarded');
  } catch {
    warnOnce('transform', 'transform threw, events it failed on are not forwarded');
  }
  return null;
}

/** The include and exclude lists, prepared once per plugin. */
type Lists = {
  isEventAllowed: (name: string) => boolean;
  /** Absent without lists, so the event's own properties go on untouched. */
  isEventPropertyAllowed?: (key: string) => boolean;
};

/** Step 3a: the lists see names and keys as Amplitude has them, before anything renames them. */
function applyLists(event: AmplitudeEventLike, lists: Lists): AmplitudeEventLike | null {
  if (!lists.isEventAllowed(event.event_type)) {
    return null;
  }
  if (!lists.isEventPropertyAllowed || !isPlainObject(event.event_properties)) {
    return event;
  }
  return {...event, event_properties: pickKeys(event.event_properties, lists.isEventPropertyAllowed)};
}

/** Steps 3-5. Null means the event stays out of Amply. */
function toOutgoing(event: AmplitudeEventLike, options: AmplyPluginOptions, lists: Lists, note: Note): Outgoing | null {
  const listed = applyLists(event, lists);
  // The copies for the host's callbacks stop at the original properties: a nested reference back
  // to them would otherwise bring a key the lists dropped back into view.
  const isPicked = listed !== null && listed.event_properties !== event.event_properties;
  const cutAt = isPicked && isPlainObject(event.event_properties) ? [event.event_properties] : [];
  if (!listed) {
    note(`skipped ${event.event_type}: events list`);
    return null;
  }
  const admitted = admitAutocaptured(listed, options.autocapture);
  if (!admitted) {
    note(`skipped ${event.event_type}: not listed in autocapture`);
    return null;
  }
  if (!passesFilter(admitted, options.filter, cutAt)) {
    note(`skipped ${event.event_type}: filter`);
    return null;
  }
  const transformed = applyTransform(admitted, options.transform, cutAt);
  if (!transformed) {
    note(`skipped ${event.event_type}: transform`);
    return null;
  }
  return {
    name: typeof transformed.name === 'string' ? transformed.name : admitted.event_type,
    properties: toBridgeProperties(
      isPlainObject(transformed.properties) ? transformed.properties : admitted.event_properties,
    ),
  };
}

/**
 * A host callback that returns a promise would leave an unhandled rejection in the host's app when
 * it fails, and its answer is not a real `true` either way. The rejection is taken here; a thenable
 * hostile enough to throw from `then` costs nothing more than the answer it never gave.
 */
function swallowRejection(result: unknown): void {
  try {
    const then = (result as {then?: unknown} | null)?.then;
    if (typeof then === 'function') {
      then.call(result, undefined, () => undefined);
    }
  } catch {
    // Deliberately empty, see above.
  }
}

/** Anything that is not a real id is nobody: `setUserId` must never see an empty string. */
function toUserId(value: unknown): string | null {
  return value === undefined || value === null || value === '' ? null : String(value);
}

/**
 * §7. Knows two ids: the last one queued, which decides what to do next, and the last one that
 * reached native, which is where a cleared queue goes back to. They live per plugin, so clearing
 * one plugin cannot forget an id another one delivered. A direct `Amply.setUserId` makes both
 * unknown: otherwise a logout made there and a login as the same user would never reach Amply.
 */
function createUserSync(
  options: AmplyPluginOptions,
  readConfig: () => AmplitudeConfigLike | undefined,
  enqueueOwn: EnqueueOwn,
  isIdentityQueued: () => boolean,
): {sync(event: AmplitudeEventLike): void; forgetUndelivered(): void} {
  let queuedUser: KnownUser;
  let deliveredUser: KnownUser;
  let seenDirectCalls = directUserIdCalls;

  const deliver = async (userId: string | null): Promise<void> => {
    try {
      getNativeModule().setUserId(userId);
      deliveredUser = userId;
    } catch (error) {
      // With another id still on its way, that one decides what is known next.
      if (!isIdentityQueued()) {
        queuedUser = deliveredUser;
      }
      throw error;
    }
  };

  return {
    sync(event) {
      if (options.syncUserId === false) {
        return;
      }
      if (seenDirectCalls !== directUserIdCalls) {
        seenDirectCalls = directUserIdCalls;
        queuedUser = undefined;
        deliveredUser = undefined;
      }
      const userId = toUserId(readConfig()?.userId);
      if (toUserId(event.user_id) !== userId) {
        // The id moved while the event was in the pipeline, or the host overrode it for this event.
        if (options.debug) {
          warnOnce(
            'user-id-mismatch',
            "event.user_id differs from Amplitude's user id, Amply's id stays as it is for that event. " +
              'If the host rewrites user_id, pass syncUserId: false and call Amply.setUserId itself',
          );
        }
        return;
      }
      const isNewsOfNothing = userId === null && queuedUser === undefined;
      if (userId !== queuedUser && !isNewsOfNothing) {
        queuedUser = userId;
        enqueueOwn('identity', () => deliver(userId));
      }
    },

    forgetUndelivered() {
      queuedUser = deliveredUser;
    },
  };
}

function operationEntries(event: AmplitudeEventLike, operation: '$set' | '$unset'): Array<[string, unknown]> {
  const entries = event.user_properties?.[operation];
  return isPlainObject(entries) ? Object.entries(entries) : [];
}

type UserPropertyTest = (key: string, value: unknown) => boolean;

const warnUserPropertyLists = (): void =>
  warnOnce('user-properties-lists', 'userProperties lists are not readable, no user properties are copied');

/**
 * `true` is not an option on purpose: "everything" must not be one typo away. Copying everything
 * takes an object that says so, `{exclude: [...]}` or `{}`.
 */
function toUserPropertyTest(allowed: UserProperties): UserPropertyTest {
  if (Array.isArray(allowed)) {
    const isListed = createNameTest({include: allowed}, warnUserPropertyLists);
    return (key) => isListed(key);
  }
  if (typeof allowed === 'function') {
    return (key, value) => {
      try {
        const answer: unknown = allowed(key, value);
        swallowRejection(answer);
        return answer === true;
      } catch {
        warnOnce('user-properties', 'userProperties threw, keys it failed on are not copied');
        return false;
      }
    };
  }
  if (isPlainObject(allowed)) {
    const isListed = createNameTest(allowed, warnUserPropertyLists);
    return (key) => isListed(key);
  }
  return () => false;
}

/** §8. Only `$set` and `$unset`: `$clearAll` would wipe what Amply owns. */
function copyUserProperties(event: AmplitudeEventLike, isAllowed: UserPropertyTest, enqueueOwn: EnqueueOwn): void {
  const set = Object.fromEntries(
    operationEntries(event, '$set').filter(
      ([key, value]) => isUserPropertyKey(key) && isUserPropertyValue(value) && isAllowed(key, value),
    ),
  ) as Record<string, FlatValue>;
  const unset = operationEntries(event, '$unset')
    .filter(([key, value]) => isUserPropertyKey(key) && isAllowed(key, value))
    .map(([key]) => key);

  if (Object.keys(set).length > 0) {
    enqueueOwn('property', async () => getNativeModule().setCustomProperties(set));
  }
  if (unset.length > 0) {
    enqueueOwn('property', async () => {
      unset.forEach((key) => getNativeModule().removeCustomProperty(key));
    });
  }
}

/** A list the plugin cannot read sends nothing it governs, and says so once. */
function prepareLists(options: AmplyPluginOptions): Lists {
  const warnEvents = (): void => warnOnce('events-list', 'events lists are not readable, no events are forwarded');
  const warnProperties = (): void =>
    warnOnce('event-properties-list', 'eventProperties lists are not readable, events go without properties');
  try {
    const eventProperties = options.eventProperties;
    return {
      isEventAllowed: createNameTest(options.events, warnEvents),
      isEventPropertyAllowed:
        eventProperties === undefined ? undefined : createNameTest(eventProperties, warnProperties),
    };
  } catch {
    warnEvents();
    return {isEventAllowed: () => false};
  }
}

function prepareUserPropertyTest(options: AmplyPluginOptions): UserPropertyTest {
  try {
    return toUserPropertyTest(options.userProperties);
  } catch {
    warnUserPropertyLists();
    return () => false;
  }
}

export function amplyPlugin(options: AmplyPluginOptions = {}): AmplitudePluginLike {
  let config: AmplitudeConfigLike | undefined;
  let client: AmplitudeClientLike | undefined;
  let executeCalls = 0;

  const note: Note = (message) => {
    if (options.debug) {
      log('debug', message);
    }
  };

  const lists = prepareLists(options);
  const isUserPropertyAllowed = prepareUserPropertyTest(options);

  const enqueueOwn: EnqueueOwn = (kind, run) => enqueue({owner: plugin, kind, run}, note);
  const userSync = createUserSync(options, () => config, enqueueOwn, () =>
    queue.some((item) => item.owner === plugin && item.kind === 'identity'),
  );

  /** The only way items leave unsent, so the id goes back with them and is sent again later. */
  const clearOwnItems = (): void => {
    queue = queue.filter((item) => item.owner !== plugin);
    userSync.forgetUndelivered();
  };

  /**
   * Core 2.27 lists one object twice when it is added twice in one tick, then calls `execute` once
   * per listing for every event. Only the list tells that apart from 2.61, which can run `setup`
   * twice and list once. Those calls are synchronous, one event's run never mixes with the next.
   */
  const isRepeatCall = (): boolean => {
    const listed = countListings(client, plugin) ?? 1;
    if (listed < 2) {
      return false;
    }
    executeCalls = (executeCalls + 1) % listed;
    return executeCalls !== 0;
  };

  // Steps 1 and 2 of the spec table. Step 1 runs first and for service events too.
  const handle = (event: AmplitudeEventLike): void => {
    userSync.sync(event);
    if (SERVICE_EVENTS.has(event.event_type)) {
      if (event.event_type === '$identify') {
        copyUserProperties(event, isUserPropertyAllowed, enqueueOwn);
      }
      note(`skipped ${event.event_type}: Amplitude service event`);
      return;
    }
    const outgoing = toOutgoing(event, options, lists, note);
    if (outgoing) {
      const run = async (): Promise<void> =>
        getNativeModule().forwardEvent({source: FORWARD_SOURCE, ...outgoing});
      enqueueOwn('event', run);
    }
  };

  const plugin: AmplitudePluginLike = {
    name: 'amply',
    type: 'destination',

    async setup(nextConfig, nextClient) {
      if (client && client !== nextClient) {
        warnOnce(
          'shared-plugin',
          'one amplyPlugin() was added to two Amplitude clients, the last one sets its opt-out and user. ' +
            'Call amplyPlugin() once per client',
        );
      }
      if (!clientOwners.has(nextClient)) {
        clientOwners.set(nextClient, plugin);
      }
      config = nextConfig;
      client = nextClient;
    },

    async execute(event) {
      try {
        // Amplitude checks opt-out at `track`, this runs later: an event from the same tick as
        // `setOptOut(true)` still arrives here.
        if (holdsClaim(client, plugin) && !isRepeatCall() && !config?.optOut) {
          handle(event);
        }
      } catch {
        warnOnce('execute', 'an Amplitude event was not forwarded');
      }
      return {event, code: 200, message: 'amply'};
    },

    async onOptOutChanged(optOut) {
      if (optOut) {
        clearOwnItems();
      }
    },

    async teardown() {
      // `remove` takes the listing away before this runs, `reset` right after it starts.
      await Promise.resolve();
      if (!holdsClaim(client, plugin) || (countListings(client, plugin) ?? 0) > 0) {
        return;
      }
      clearOwnItems();
      if (client) {
        clientOwners.delete(client);
      }
    },
  };

  return plugin;
}

/** For apps that sent PascalCase names to Amply before moving to the plugin. */
export function pascalCaseEventName(name: string): string {
  return name
    .split(/[\s_\-.]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}
