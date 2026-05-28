#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTConvert.h>
#import <React/RCTLog.h>
#import <ReactCommon/RCTTurboModule.h>
#import "AmplyReactNative/AmplyReactNative.h"

// Import the KMP SDK
#import <AmplySDK/AmplySDK.h>

using namespace facebook::react;

/**
 * Log level enum for SDK debug output.
 */
typedef NS_ENUM(NSInteger, AmplyLogLevel) {
    AmplyLogLevelNone = 0,
    AmplyLogLevelError = 1,
    AmplyLogLevelWarn = 2,
    AmplyLogLevelInfo = 3,
    AmplyLogLevelDebug = 4
};

static AmplyLogLevel AmplyLogLevelFromString(NSString *level) {
    if (!level) return AmplyLogLevelNone;
    NSString *lowercased = [level lowercaseString];
    if ([lowercased isEqualToString:@"none"]) return AmplyLogLevelNone;
    if ([lowercased isEqualToString:@"error"]) return AmplyLogLevelError;
    if ([lowercased isEqualToString:@"warn"]) return AmplyLogLevelWarn;
    if ([lowercased isEqualToString:@"info"]) return AmplyLogLevelInfo;
    if ([lowercased isEqualToString:@"debug"]) return AmplyLogLevelDebug;
    return AmplyLogLevelNone;
}

static NSString* AmplyLogLevelToString(AmplyLogLevel level) {
    switch (level) {
        case AmplyLogLevelNone: return @"none";
        case AmplyLogLevelError: return @"error";
        case AmplyLogLevelWarn: return @"warn";
        case AmplyLogLevelInfo: return @"info";
        case AmplyLogLevelDebug: return @"debug";
    }
    return @"none";
}

// Maps a JS-reported result string to the KMP CampaignResult enum. Strict semantics:
// anything other than a deliberate user "Dismissed" or explicit "Completed" fails open
// to Unavailable (proceed) — never strand the continuation on a malformed value.
static ASDKCampaignResult* AmplyCampaignResultFromString(NSString *result) {
    if ([result isEqualToString:@"Completed"]) return ASDKCampaignResult.completed;
    if ([result isEqualToString:@"Dismissed"]) return ASDKCampaignResult.dismissed;
    if ([result isEqualToString:@"Unavailable"]) return ASDKCampaignResult.unavailable;
    RCTLogWarn(@"[AmplyReactNative] Unknown campaign result '%@'; treating as Unavailable (fail-open)", result);
    return ASDKCampaignResult.unavailable;
}

@interface Amply : NativeAmplyModuleSpecBase <NativeAmplyModuleSpec, ASDKDeepLinkListener, ASDKCampaignPresenter, ASDKSystemEventsListener, ASDKLogListener>
@property (nonatomic, strong) ASDKAmply *amplyInstance;
@property (nonatomic, assign) BOOL deepLinkListenerRegistered;
@property (nonatomic, assign) BOOL campaignPresenterRegistered;
@property (nonatomic, assign) BOOL systemEventsListenerRegistered;
@property (nonatomic, assign) BOOL lifecycleObserversRegistered;
@property (nonatomic, assign) BOOL logListenerRegistered;
@property (nonatomic, assign) AmplyLogLevel currentLogLevel;
@property (nonatomic, strong) NSMutableArray<void (^)(ASDKAmply *)> *pendingPropertyOps;
// Maps a bridge-minted mediationId -> the KMP CampaignResolution token awaiting an
// outcome from JS. Guarded by @synchronized(self.pendingCompletions).
@property (nonatomic, strong) NSMutableDictionary<NSString *, id<ASDKCampaignResolution>> *pendingCompletions;
@end

@implementation Amply

RCT_EXPORT_MODULE()

- (void)initialize:(JS::NativeAmplyModule::AmplyInitializationConfig &)config
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  @try {
    NSString *appId = config.appId();
    NSString *apiKeyPublic = config.apiKeyPublic();
    NSString *apiKeySecret = config.apiKeySecret();
    NSString *defaultConfig = config.defaultConfig();

    if (!appId || appId.length == 0) {
      if (reject) {
        reject(@"AMP_INVALID_CONFIG", @"'appId' is required", nil);
      }
      return;
    }

    if (!apiKeyPublic || apiKeyPublic.length == 0) {
      if (reject) {
        reject(@"AMP_INVALID_CONFIG", @"'apiKeyPublic' is required", nil);
      }
      return;
    }

    // Build the Amply config using the builder pattern
    ASDKAmplyConfigBuilder *configBuilder = [[ASDKAmplyConfigBuilder alloc] init];

    // Configure API settings using the api block
    [configBuilder apiBlock:^(ASDKAmplyApiBuilder *apiBuilder) {
      apiBuilder.appId = appId;
      apiBuilder.apiKeyPublic = apiKeyPublic;
      if (apiKeySecret && apiKeySecret.length > 0) {
        apiBuilder.apiKeySecret = apiKeySecret;
      }
    }];

    // Set default config if provided
    if (defaultConfig && defaultConfig.length > 0) {
      configBuilder.defaultConfig = defaultConfig;
    }

    ASDKAmplyConfig *amplyConfig = [configBuilder build];

    // Parse debug and logLevel options BEFORE creating instance
    std::optional<bool> debugOpt = config.debug();
    BOOL debug = debugOpt.has_value() && debugOpt.value();
    NSString *logLevelStr = config.logLevel();

    // Resolve effective log level: logLevel takes precedence over debug
    if (logLevelStr && logLevelStr.length > 0) {
      self.currentLogLevel = AmplyLogLevelFromString(logLevelStr);
    } else if (debug) {
      self.currentLogLevel = AmplyLogLevelDebug;
    } else {
      self.currentLogLevel = AmplyLogLevelNone;
    }

    // Set log level and listener BEFORE creating Amply instance
    // so initialization logs are captured and forwarded to JS
    if (self.currentLogLevel != AmplyLogLevelNone) {
      RCTLogInfo(@"[AmplyReactNative] Setting log level to: %@ BEFORE instance creation", AmplyLogLevelToString(self.currentLogLevel));
      [[ASDKLogger shared] setLevelLevel:AmplyLogLevelToString(self.currentLogLevel)];

      // Set log listener to forward logs to JS
      if (!self.logListenerRegistered) {
        [[ASDKLogger shared] setListenerListener:self];
        self.logListenerRegistered = YES;
        RCTLogInfo(@"[AmplyReactNative] Log listener registered");
      }
    }

    // Create Amply instance (this triggers initialization and config fetch)
    self.amplyInstance = [[ASDKAmply alloc] initWithConfig:amplyConfig];

    // Register system events listener
    [self registerSystemEventsListenerInternal];

    // Register for app lifecycle notifications to manage session state
    [self registerLifecycleObservers];

    // Drain buffered property operations
    if (self.pendingPropertyOps.count > 0) {
      RCTLogInfo(@"[AmplyReactNative] Draining %lu buffered property operations", (unsigned long)self.pendingPropertyOps.count);
      for (void (^op)(ASDKAmply *) in self.pendingPropertyOps) {
        op(self.amplyInstance);
      }
      [self.pendingPropertyOps removeAllObjects];
    }

    RCTLogInfo(@"[AmplyReactNative] Initialized with appId=%@", appId);

    if (resolve) {
      resolve(nil);
    }
  } @catch (NSException *exception) {
    RCTLogError(@"[AmplyReactNative] Failed to initialize: %@", exception.reason);
    if (reject) {
      reject(@"AMP_INIT_FAILED", exception.reason, nil);
    }
  }
}

- (NSNumber *)isInitialized
{
  return @(self.amplyInstance != nil);
}

- (void)track:(JS::NativeAmplyModule::TrackEventPayload &)payload
      resolve:(RCTPromiseResolveBlock)resolve
       reject:(RCTPromiseRejectBlock)reject
{
  if (!self.amplyInstance) {
    if (reject) {
      reject(@"AMP_NOT_INITIALIZED", @"Amply has not been initialized yet", nil);
    }
    return;
  }

  @try {
    NSString *eventName = payload.name();

    if (!eventName || eventName.length == 0) {
      if (reject) {
        reject(@"AMP_INVALID_EVENT", @"Event 'name' is required", nil);
      }
      return;
    }

    // Convert properties to NSDictionary
    NSDictionary *properties = @{};
    id<NSObject> propsObj = payload.properties();
    if (propsObj && [propsObj isKindOfClass:[NSDictionary class]]) {
      properties = (NSDictionary *)propsObj;
    }

    // Use the correct method signature: trackEvent:properties:
    [self.amplyInstance trackEvent:eventName properties:properties];

    RCTLogInfo(@"[AmplyReactNative] Tracked event: %@", eventName);

    if (resolve) {
      resolve(nil);
    }
  } @catch (NSException *exception) {
    RCTLogError(@"[AmplyReactNative] Failed to track event: %@", exception.reason);
    if (reject) {
      reject(@"AMP_TRACK_FAILED", exception.reason, nil);
    }
  }
}

/**
 * Continuation form of track. The resolve block IS the continuation: it is resolved
 * with @"complete" or @"cancel" exactly once. The KMP trackEvent continuation overload
 * guarantees exactly-once main-thread delivery; __block + a resolved flag guards the
 * (defensive) double-settle. Fails open to @"complete" on any synchronous failure or
 * if the SDK is not initialized.
 *
 * The raw CampaignResult is never surfaced here — the SDK collapses it into the
 * onComplete/onCancel decision before this bridge ever sees it.
 */
- (void)trackEventGated:(NSString *)event
             properties:(NSDictionary *)properties
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
  if (!event || event.length == 0) {
    if (reject) {
      reject(@"AMP_INVALID_EVENT", @"Event 'event' is required", nil);
    }
    return;
  }

  NSDictionary *props = [properties isKindOfClass:[NSDictionary class]] ? properties : @{};

  __block BOOL settled = NO;
  void (^settle)(NSString *) = ^(NSString *decision) {
    if (settled) { return; }
    settled = YES;
    if (resolve) {
      resolve(decision);
    }
  };

  if (!self.amplyInstance) {
    // Fail open: not initialized -> proceed immediately (KMP state-machine row 1).
    RCTLogWarn(@"[AmplyReactNative] trackEventGated before init; proceeding (fail-open)");
    settle(@"complete");
    return;
  }

  @try {
    [self.amplyInstance trackEventEventName:event
                                 properties:props
                                  onProceed:^{ settle(@"complete"); }
                                   onCancel:^{ settle(@"cancel"); }];
    RCTLogInfo(@"[AmplyReactNative] trackEventGated dispatched: %@", event);
  } @catch (NSException *exception) {
    RCTLogError(@"[AmplyReactNative] trackEventGated failed; proceeding (fail-open): %@", exception.reason);
    settle(@"complete");
  }
}

- (void)resolveCampaign:(NSString *)mediationId
                 result:(NSString *)result
{
  id<ASDKCampaignResolution> completion = nil;
  @synchronized (self) {
    if (!self.pendingCompletions) { return; }
    completion = self.pendingCompletions[mediationId];
    if (completion) {
      [self.pendingCompletions removeObjectForKey:mediationId];
    }
  }
  if (!completion) {
    // Late/duplicate/unknown reply — the SDK token is the source of truth and is
    // already settled (or never existed). Ignore.
    RCTLogInfo(@"[AmplyReactNative] resolveCampaign for unknown/settled mediationId=%@; ignored", mediationId);
    return;
  }
  ASDKCampaignResult *mapped = AmplyCampaignResultFromString(result);
  RCTLogInfo(@"[AmplyReactNative] resolveCampaign mediationId=%@ result=%@", mediationId, result);
  [completion resolveResult:mapped];
}

- (void)registerCampaignPresenter
{
  if (!self.amplyInstance) {
    RCTLogWarn(@"[AmplyReactNative] Cannot register campaign presenter - Amply not initialized");
    return;
  }
  if (self.campaignPresenterRegistered) {
    RCTLogInfo(@"[AmplyReactNative] Campaign presenter already registered");
    return;
  }
  if (!self.pendingCompletions) {
    self.pendingCompletions = [NSMutableDictionary new];
  }
  RCTLogInfo(@"[AmplyReactNative] Registering campaign presenter");
  // Catch-all registration: JS is the single capability registry and routes by URL.
  [self.amplyInstance registerCampaignPresenterPresenter:self];
  self.campaignPresenterRegistered = YES;
}

#pragma mark - ASDKCampaignPresenter

/**
 * Called by the KMP SDK when a campaign dispatches a present (blocking) action.
 * We mint a mediationId, park the completion token, and surface the dispatch to JS.
 * JS later replies via resolveCampaign:result:.
 */
- (void)onCampaignPresentUrl:(NSString *)url
                        info:(NSDictionary<NSString *, id> *)info
                  completion:(id<ASDKCampaignResolution>)completion
{
  NSString *mediationId = [[NSUUID UUID] UUIDString];
  @synchronized (self) {
    if (!self.pendingCompletions) {
      self.pendingCompletions = [NSMutableDictionary new];
    }
    self.pendingCompletions[mediationId] = completion;
  }

  RCTLogInfo(@"[AmplyReactNative] Dispatching campaign present mediationId=%@ url=%@", mediationId, url);

  NSDictionary *payload = @{
    @"url": url ?: @"",
    @"info": info ?: @{},
    @"mediationId": mediationId
  };

  // Emitter delivery is async; emit on the main queue to match the deeplink path.
  dispatch_async(dispatch_get_main_queue(), ^{
    [self emitOnCampaignPresent:payload];
  });
}

- (void)getRecentEvents:(double)limit
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
  if (!self.amplyInstance) {
    if (reject) {
      reject(@"AMP_NOT_INITIALIZED", @"Amply has not been initialized yet", nil);
    }
    return;
  }

  // Use the async completion handler API
  [self.amplyInstance getRecentEventsLimit:(int32_t)limit completionHandler:^(NSArray<id<ASDKEventInterface>> *events, NSError *error) {
    if (error) {
      RCTLogError(@"[AmplyReactNative] Failed to get recent events: %@", error.localizedDescription);
      if (reject) {
        reject(@"AMP_EVENTS_FAILED", error.localizedDescription, error);
      }
      return;
    }

    NSMutableArray *result = [NSMutableArray array];

    for (id<ASDKEventInterface> event in events) {
      NSMutableDictionary *eventDict = [NSMutableDictionary dictionary];
      eventDict[@"name"] = event.name;
      eventDict[@"timestamp"] = @(event.timestamp);
      eventDict[@"type"] = event.type.name;
      eventDict[@"properties"] = event.properties ?: @{};
      [result addObject:eventDict];
    }

    RCTLogInfo(@"[AmplyReactNative] Fetched %lu recent events", (unsigned long)result.count);

    if (resolve) {
      resolve(result);
    }
  }];
}

// Parses an array of `{name, value}` dicts into native EventParam objects.
//
// Bad-shape entries (non-dict, missing/non-string name) are silently dropped — this
// matches Android's `toEventParams()`, which filters them at parse time without
// any signal. Entries whose name parsed cleanly but whose value is null/missing
// are also dropped from the result, but they additionally flip `outDroppedNullValue`
// to YES. Callers that need all-or-nothing semantics (i.e. `@events`) can use that
// flag to skip the surrounding event, matching Android's `toNativeEventOrNull()`.
static NSArray<ASDKDataSetTypeEventParam *> *AmplyEventParamsFromArray(id raw, BOOL *outDroppedNullValue) {
  if (outDroppedNullValue) *outDroppedNullValue = NO;
  if (![raw isKindOfClass:[NSArray class]]) {
    return @[];
  }
  NSArray *rawArray = (NSArray *)raw;
  NSMutableArray<ASDKDataSetTypeEventParam *> *result = [NSMutableArray arrayWithCapacity:rawArray.count];
  for (id item in rawArray) {
    if (![item isKindOfClass:[NSDictionary class]]) continue;
    NSDictionary *dict = item;
    NSString *name = dict[@"name"];
    if (![name isKindOfClass:[NSString class]]) continue;
    id value = dict[@"value"];
    if (value == nil || value == [NSNull null]) {
      if (outDroppedNullValue) *outDroppedNullValue = YES;
      continue;
    }
    [result addObject:[[ASDKDataSetTypeEventParam alloc] initWithName:name value:value compareType:@"==="]];
  }
  return result;
}

static ASDKDataSetType *AmplyDataSetTypeFromDictionary(NSDictionary *type, NSString **outError) {
  if (![type isKindOfClass:[NSDictionary class]]) {
    if (outError) *outError = @"DataSetType payload must be an object";
    return nil;
  }
  NSString *kind = type[@"kind"];
  if (![kind isKindOfClass:[NSString class]]) {
    if (outError) *outError = @"DataSetType.kind is required";
    return nil;
  }

  if ([kind isEqualToString:@"@device"]) return ASDKDataSetTypeDevice.shared;
  if ([kind isEqualToString:@"@user"]) return ASDKDataSetTypeUser.shared;
  if ([kind isEqualToString:@"@custom"]) return ASDKDataSetTypeCustom.shared;
  if ([kind isEqualToString:@"@session"]) return ASDKDataSetTypeSession.shared;

  if ([kind isEqualToString:@"@triggeredEvent"]) {
    NSDictionary *data = type[@"data"];
    if (![data isKindOfClass:[NSDictionary class]]) {
      if (outError) *outError = @"TriggeredEvent data is required";
      return nil;
    }
    id strategyValue = data[@"countStrategy"];
    NSString *strategyName = [strategyValue isKindOfClass:[NSString class]] ? (NSString *)strategyValue : nil;
    ASDKDataSetTypeTriggeredEventCountStrategy *strategy = nil;
    if ([strategyName isEqualToString:@"global"]) {
      strategy = ASDKDataSetTypeTriggeredEventCountStrategy.global;
    } else if ([strategyName isEqualToString:@"session"]) {
      strategy = ASDKDataSetTypeTriggeredEventCountStrategy.session;
    } else {
      if (outError) *outError = @"TriggeredEvent.countStrategy must be 'global' or 'session'";
      return nil;
    }
    NSArray<ASDKDataSetTypeEventParam *> *params = AmplyEventParamsFromArray(data[@"params"], NULL);
    NSString *eventName = [data[@"eventName"] isKindOfClass:[NSString class]] ? data[@"eventName"] : nil;
    return [[ASDKDataSetTypeTriggeredEvent alloc] initWithCountStrategy:strategy
                                                                 params:params
                                                              eventName:eventName];
  }

  if ([kind isEqualToString:@"@events"]) {
    NSArray *data = type[@"data"];
    if (![data isKindOfClass:[NSArray class]]) {
      if (outError) *outError = @"Events data list is required";
      return nil;
    }
    NSMutableArray<ASDKDataSetTypeEventsEvent *> *events = [NSMutableArray array];
    for (id item in data) {
      if (![item isKindOfClass:[NSDictionary class]]) continue;
      NSDictionary *eventDict = item;
      NSString *eventNameStr = eventDict[@"name"];
      if (![eventNameStr isKindOfClass:[NSString class]]) continue;
      id typeValue = eventDict[@"type"];
      NSString *typeName = [typeValue isKindOfClass:[NSString class]] ? (NSString *)typeValue : nil;
      ASDKEventType *eventType = [typeName isEqualToString:@"system"] ? ASDKEventType.system : ASDKEventType.custom;
      // Match Android: if any supplied param had a non-null name but null/missing value,
      // drop the whole event (mirrors toNativeEventOrNull()'s size-mismatch check).
      BOOL droppedNullValue = NO;
      NSArray<ASDKDataSetTypeEventParam *> *params = AmplyEventParamsFromArray(eventDict[@"params"], &droppedNullValue);
      if (droppedNullValue) continue;
      [events addObject:[[ASDKDataSetTypeEventsEvent alloc] initWithName:eventNameStr type:eventType params:params]];
    }
    return [[ASDKDataSetTypeEvents alloc] initWithData:events];
  }

  if (outError) *outError = [NSString stringWithFormat:@"Unknown dataset type: %@", kind];
  return nil;
}

- (void)getDataSetSnapshot:(NSDictionary *)type
                   resolve:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject
{
  if (!self.amplyInstance) {
    if (reject) {
      reject(@"AMP_NOT_INITIALIZED", @"Amply has not been initialized yet", nil);
    }
    return;
  }

  NSString *parseError = nil;
  ASDKDataSetType *dataSetType = AmplyDataSetTypeFromDictionary(type, &parseError);
  if (!dataSetType) {
    if (reject) {
      reject(@"AMP_INVALID_TYPE", parseError ?: @"Invalid dataset type payload", nil);
    }
    return;
  }

  RCTLogInfo(@"[AmplyReactNative] getDataSetSnapshot called with kind: %@", type[@"kind"]);

  [self.amplyInstance getDataSetSnapshotType:dataSetType completionHandler:^(NSDictionary<NSString *, id> *snapshot, NSError *error) {
    if (error) {
      RCTLogError(@"[AmplyReactNative] Failed to get data set snapshot: %@", error.localizedDescription);
      if (reject) {
        reject(@"AMP_DATASET_FAILED", error.localizedDescription, error);
      }
      return;
    }

    RCTLogInfo(@"[AmplyReactNative] Got dataset snapshot: %@", snapshot);

    if (resolve) {
      resolve(snapshot ?: @{});
    }
  }];
}

/**
 * Registers a listener for deep links triggered by Amply SDK campaigns.
 *
 * This listener allows app developers to:
 * 1. Know that a deep link originated from Amply SDK (vs. external sources like
 *    push notifications, browser links, or other SDKs)
 * 2. Access campaign metadata via the `info` dictionary (campaign ID, variant, etc.)
 *    that is not available in the URL itself
 * 3. Track/log Amply-specific deep link events for analytics
 *
 * Example use case:
 *   // In JS:
 *   Amply.addDeepLinkListener(event => {
 *     // We know this deep link came from an Amply campaign, not from elsewhere
 *     analytics.track('Amply campaign triggered', { url: event.url, info: event.info });
 *   });
 *
 * The deep link flow:
 *   Campaign triggers → KMP SDK → onDeepLink callback → JS event emitted
 *                                      ↓ (then)
 *                              UIApplication.openURL() → Linking API
 *
 * Note: The listener is an observer, not a controller. The SDK will still open
 * the URL via system after emitting the event.
 *
 * This ensures feature parity with Android implementation.
 */
- (void)registerDeepLinkListener
{
  if (!self.amplyInstance) {
    RCTLogWarn(@"[AmplyReactNative] Cannot register deep link listener - Amply not initialized");
    return;
  }

  if (self.deepLinkListenerRegistered) {
    RCTLogInfo(@"[AmplyReactNative] Deep link listener already registered");
    return;
  }

  RCTLogInfo(@"[AmplyReactNative] Registering deep link listener");
  [self.amplyInstance registerDeepLinkListenerListener:self];
  self.deepLinkListenerRegistered = YES;
}

#pragma mark - ASDKDeepLinkListener

/**
 * Called by KMP SDK when a campaign triggers a deep link action.
 *
 * @param url  The deep link URL configured in the campaign
 * @param info Campaign metadata (may include campaign ID, action data, etc.)
 * @return YES if the deep link was fully handled (SDK won't open URL via system)
 *         NO  to let SDK also open the URL via UIApplication.openURL()
 *
 * Current implementation:
 * 1. Emits event to JS via Amply.addDeepLinkListener() for custom handling/logging
 * 2. Opens URL using modern UIApplication.open(_:options:completionHandler:) API
 * 3. Returns YES to prevent SDK from using deprecated UIApplication.openURL()
 *
 * Note: KMP SDK uses deprecated UIApplication.openURL() which returns NO on iOS 18+,
 * so we handle URL opening ourselves using the modern API.
 */
- (BOOL)onDeepLinkUrl:(NSString *)url info:(NSDictionary<NSString *, id> *)info
{
  RCTLogInfo(@"[AmplyReactNative] Received deep link from Amply: url=%@", url);

  NSDictionary *payload = @{
    @"url": url ?: @"",
    @"info": info ?: @{},
    @"consumed": @NO
  };

  [self emitOnDeepLink:payload];

  // For custom scheme URLs (e.g., amply://), let JS handle navigation via the event above.
  // For external URLs (http/https), open via system.
  NSURL *nsUrl = [NSURL URLWithString:url];
  if (nsUrl) {
    NSString *scheme = nsUrl.scheme.lowercaseString;
    BOOL isExternalUrl = [scheme isEqualToString:@"http"] || [scheme isEqualToString:@"https"];

    if (isExternalUrl) {
      dispatch_async(dispatch_get_main_queue(), ^{
        [[UIApplication sharedApplication] openURL:nsUrl
                                           options:@{}
                                 completionHandler:^(BOOL success) {
          if (!success) {
            RCTLogWarn(@"[AmplyReactNative] Failed to open URL: %@", url);
          }
        }];
      });
    }
  }

  return YES; // Tell SDK we handled it
}

- (void)setCustomProperties:(NSDictionary *)properties
{
  void (^apply)(ASDKAmply *) = ^(ASDKAmply *instance) {
    for (NSString *key in properties) {
      id value = properties[key];
      if (value && ![value isKindOfClass:[NSNull class]]) {
        [instance setCustomPropertyKey:key value:value];
      }
    }
    RCTLogInfo(@"[AmplyReactNative] Custom properties set: %@", [properties allKeys]);
  };

  if (self.amplyInstance) {
    apply(self.amplyInstance);
  } else {
    RCTLogInfo(@"[AmplyReactNative] Buffering setCustomProperties until init: %@", [properties allKeys]);
    if (!self.pendingPropertyOps) self.pendingPropertyOps = [NSMutableArray new];
    [self.pendingPropertyOps addObject:apply];
  }
}

- (void)getCustomProperty:(NSString *)key
                   resolve:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject
{
  if (!self.amplyInstance) {
    if (reject) {
      reject(@"AMP_NOT_INITIALIZED", @"Amply has not been initialized yet", nil);
    }
    return;
  }

  [self.amplyInstance getCustomPropertyKey:key completionHandler:^(id _Nullable_result value, NSError * _Nullable error) {
    if (error) {
      if (reject) {
        reject(@"AMP_CUSTOM_PROP_FAILED", error.localizedDescription, error);
      }
      return;
    }

    NSMutableDictionary *result = [NSMutableDictionary dictionary];
    if (value && ![value isKindOfClass:[NSNull class]]) {
      result[@"value"] = value;
    }

    if (resolve) {
      resolve(result);
    }
  }];
}

- (void)removeCustomProperty:(NSString *)key
{
  void (^apply)(ASDKAmply *) = ^(ASDKAmply *instance) {
    [instance removeCustomPropertyKey:key];
    RCTLogInfo(@"[AmplyReactNative] Custom property removed: %@", key);
  };

  if (self.amplyInstance) {
    apply(self.amplyInstance);
  } else {
    RCTLogInfo(@"[AmplyReactNative] Buffering removeCustomProperty until init: %@", key);
    if (!self.pendingPropertyOps) self.pendingPropertyOps = [NSMutableArray new];
    [self.pendingPropertyOps addObject:apply];
  }
}

- (void)clearCustomProperties
{
  void (^apply)(ASDKAmply *) = ^(ASDKAmply *instance) {
    [instance clearCustomProperties];
    RCTLogInfo(@"[AmplyReactNative] All custom properties cleared");
  };

  if (self.amplyInstance) {
    apply(self.amplyInstance);
  } else {
    RCTLogInfo(@"[AmplyReactNative] Buffering clearCustomProperties until init");
    if (!self.pendingPropertyOps) self.pendingPropertyOps = [NSMutableArray new];
    [self.pendingPropertyOps addObject:apply];
  }
}

- (void)addListener:(NSString *)eventName
{
  // Required by RN EventEmitter contracts.
  RCTLogInfo(@"[AmplyReactNative] addListener called for event: %@", eventName);
}

- (void)removeListeners:(double)count
{
  // Required by RN EventEmitter contracts.
  RCTLogInfo(@"[AmplyReactNative] removeListeners called with count: %f", count);
}

- (void)setUserId:(NSString *)userId
{
  if (self.amplyInstance) {
    [self.amplyInstance setUserIdUserId:userId];
    RCTLogInfo(@"[AmplyReactNative] User ID set to: %@", userId ?: @"<null>");
  }
}

- (void)setLogLevel:(NSString *)level
{
  self.currentLogLevel = AmplyLogLevelFromString(level);
  RCTLogInfo(@"[AmplyReactNative] Log level set to: %@", level);
  [[ASDKLogger shared] setLevelLevel:level];

  // Register log listener if not already registered and level is not none
  if (self.currentLogLevel != AmplyLogLevelNone && !self.logListenerRegistered) {
    [[ASDKLogger shared] setListenerListener:self];
    self.logListenerRegistered = YES;
    RCTLogInfo(@"[AmplyReactNative] Log listener registered via setLogLevel");
  }
}

- (NSString *)getLogLevel
{
  return AmplyLogLevelToString(self.currentLogLevel);
}

#pragma mark - Internal Listener Registration

- (void)registerSystemEventsListenerInternal
{
  if (self.systemEventsListenerRegistered) {
    return;
  }
  if (!self.amplyInstance) {
    return;
  }
  [self.amplyInstance setSystemEventsListenerListener:self];
  self.systemEventsListenerRegistered = YES;
  RCTLogInfo(@"[AmplyReactNative] System events listener registered");
}

#pragma mark - App Lifecycle Management

- (void)registerLifecycleObservers
{
  if (self.lifecycleObserversRegistered) {
    return;
  }

  [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(handleAppDidEnterBackground:)
                                               name:UIApplicationDidEnterBackgroundNotification
                                             object:nil];

  [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(handleAppWillEnterForeground:)
                                               name:UIApplicationWillEnterForegroundNotification
                                             object:nil];

  [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(handleAppWillTerminate:)
                                               name:UIApplicationWillTerminateNotification
                                             object:nil];

  self.lifecycleObserversRegistered = YES;
  RCTLogInfo(@"[AmplyReactNative] App lifecycle observers registered");
}

- (void)handleAppDidEnterBackground:(NSNotification *)notification
{
  RCTLogInfo(@"[AmplyReactNative] App entered background - pausing session");
  if (self.amplyInstance) {
    [self.amplyInstance pauseSession];
  }
}

- (void)handleAppWillEnterForeground:(NSNotification *)notification
{
  RCTLogInfo(@"[AmplyReactNative] App entering foreground - resuming session");
  if (self.amplyInstance) {
    [self.amplyInstance resumeSession];
  }
}

- (void)handleAppWillTerminate:(NSNotification *)notification
{
  RCTLogInfo(@"[AmplyReactNative] App terminating - stopping session");
  if (self.amplyInstance) {
    [self.amplyInstance stopSession];
  }
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];

  // Fail open any in-flight mediated actions so no continuation is left hanging.
  NSArray<id<ASDKCampaignResolution>> *inFlight = nil;
  @synchronized (self) {
    inFlight = self.pendingCompletions.allValues;
    [self.pendingCompletions removeAllObjects];
  }
  for (id<ASDKCampaignResolution> completion in inFlight) {
    @try {
      [completion resolveResult:ASDKCampaignResult.unavailable];
    } @catch (NSException *exception) {
      // Best-effort cleanup during teardown.
    }
  }
}

#pragma mark - ASDKSystemEventsListener

- (void)onEventEvent:(id<ASDKEventInterface>)event
{
  RCTLogInfo(@"[AmplyReactNative] System event received: %@", event.name);

  NSDictionary *payload = @{
    @"name": event.name ?: @"",
    @"type": @"system",
    @"timestamp": @(event.timestamp),
    @"properties": event.properties ?: @{}
  };

  [self emitOnSystemEvent:payload];
}

#pragma mark - ASDKLogListener

- (void)onLogEntry:(ASDKLogEntry *)entry
{
  // Forward log entries to JS as DebugLog events via the system event channel
  NSString *levelStr = @"debug";
  ASDKLogLevel *level = entry.level;
  if (level == ASDKLogLevel.error) {
    levelStr = @"error";
  } else if (level == ASDKLogLevel.warn) {
    levelStr = @"warn";
  } else if (level == ASDKLogLevel.info) {
    levelStr = @"info";
  }

  NSMutableDictionary *properties = [NSMutableDictionary dictionary];
  properties[@"level"] = levelStr;
  properties[@"category"] = entry.category ?: @"sdk";
  properties[@"message"] = entry.message ?: @"";
  if (entry.details) {
    properties[@"details"] = entry.details;
  }

  NSDictionary *payload = @{
    @"name": @"DebugLog",
    @"type": @"log",
    @"timestamp": @(entry.timestamp),
    @"properties": properties
  };

  [self emitOnSystemEvent:payload];
}

- (std::shared_ptr<TurboModule>)getTurboModule:(const ObjCTurboModule::InitParams &)params
{
  return std::make_shared<NativeAmplyModuleSpecJSI>(params);
}

@end
