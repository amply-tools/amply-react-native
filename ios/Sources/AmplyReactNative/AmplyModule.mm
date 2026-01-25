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

@interface Amply : NativeAmplyModuleSpecBase <NativeAmplyModuleSpec, ASDKDeepLinkListener, ASDKSystemEventsListener, ASDKLogListener>
@property (nonatomic, strong) ASDKAmply *amplyInstance;
@property (nonatomic, assign) BOOL deepLinkListenerRegistered;
@property (nonatomic, assign) BOOL systemEventsListenerRegistered;
@property (nonatomic, assign) BOOL lifecycleObserversRegistered;
@property (nonatomic, assign) AmplyLogLevel currentLogLevel;
@end

@implementation Amply

RCT_EXPORT_MODULE()

- (void)initialize:(JS::NativeAmplyModule::AmplyInitializationConfig &)config
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  @try {
    // Clear any existing log listener from previous instance (prevents crash on hot reload)
    [[ASDKLogger shared] setListenerListener:nil];

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

    // Set log level and listener BEFORE creating Amply instance to capture init logs
    if (self.currentLogLevel != AmplyLogLevelNone) {
      RCTLogInfo(@"[AmplyReactNative] Setting log level to: %@ BEFORE instance creation", AmplyLogLevelToString(self.currentLogLevel));
      [[ASDKLogger shared] setLevelLevel:AmplyLogLevelToString(self.currentLogLevel)];
      [[ASDKLogger shared] setListenerListener:self];
    }

    // Create Amply instance (this triggers initialization and config fetch)
    self.amplyInstance = [[ASDKAmply alloc] initWithConfig:amplyConfig];

    // Register system events listener
    [self registerSystemEventsListenerInternal];

    // Register for app lifecycle notifications to manage session state
    [self registerLifecycleObservers];

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

  NSString *kind = type[@"kind"];
  RCTLogInfo(@"[AmplyReactNative] getDataSetSnapshot called with kind: %@", kind);

  // Convert JS type to native ASDKDataSetType
  ASDKDataSetType *dataSetType = nil;

  if ([kind isEqualToString:@"@device"]) {
    dataSetType = ASDKDataSetTypeDevice.shared;
  } else if ([kind isEqualToString:@"@user"]) {
    dataSetType = ASDKDataSetTypeUser.shared;
  } else if ([kind isEqualToString:@"@session"]) {
    dataSetType = ASDKDataSetTypeSession.shared;
  } else {
    if (reject) {
      reject(@"AMP_INVALID_TYPE", [NSString stringWithFormat:@"Unknown dataset type: %@", kind], nil);
    }
    return;
  }

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

- (void)setLogLevel:(NSString *)level
{
  self.currentLogLevel = AmplyLogLevelFromString(level);
  RCTLogInfo(@"[AmplyReactNative] Log level set to: %@", level);
  [[ASDKLogger shared] setLevelLevel:level];

  // Ensure log listener is registered when enabling logging
  if (self.currentLogLevel != AmplyLogLevelNone) {
    [[ASDKLogger shared] setListenerListener:self];
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

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
  // Clear log listener to prevent crash when Logger tries to call deallocated object
  [[ASDKLogger shared] setListenerListener:nil];
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
  // Convert log level to string
  NSString *levelString = @"unknown";
  if (entry.level == ASDKLogLevel.debug) {
    levelString = @"debug";
  } else if (entry.level == ASDKLogLevel.info) {
    levelString = @"info";
  } else if (entry.level == ASDKLogLevel.warn) {
    levelString = @"warn";
  } else if (entry.level == ASDKLogLevel.error) {
    levelString = @"error";
  } else if (entry.level == ASDKLogLevel.none) {
    levelString = @"none";
  }

  NSMutableDictionary *properties = [NSMutableDictionary dictionary];
  properties[@"level"] = levelString;
  properties[@"category"] = entry.category ?: @"";
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
