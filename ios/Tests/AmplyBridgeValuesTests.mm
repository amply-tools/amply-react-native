// Behavioural tests for ios/Sources/AmplyReactNative/AmplyBridgeValues.mm, run against the real
// AmplySDK framework on an iOS simulator by ios/Tests/run.sh. There is no Xcode test target for
// the bridge; this is a plain executable that exits non-zero when a check fails.
//
// The Kotlin values come from the SDK itself (its JsonLogic engine), not from hand-built
// ASDKBoolean instances, so what is tested is the boxing Kotlin/Native really does.
#import <Foundation/Foundation.h>
#import <AmplySDK/AmplySDK.h>

#import "AmplyBridgeValues.h"

static int failures = 0;

static void check(BOOL condition, NSString *name)
{
  printf("%s %s\n", condition ? "PASS" : "FAIL", name.UTF8String);
  if (!condition) {
    failures++;
  }
}

// React Native's own test, verbatim from convertObjCObjectToJSIValue (RCTTurboModule.mm): an
// NSNumber is a JS boolean only if it is of the class of @YES.
static BOOL isJSBoolean(id value)
{
  return [value isKindOfClass:[NSNumber class]] && [value isKindOfClass:[@YES class]];
}

static BOOL isJSNumber(id value)
{
  return [value isKindOfClass:[NSNumber class]] && !isJSBoolean(value);
}

/** What Kotlin returns for [expression], boxed by Kotlin/Native exactly as on every SDK exit. */
static id kotlinValue(NSDictionary<NSString *, id> *expression)
{
  static id<ASDKJsonLogicEngine> engine;
  if (!engine) {
    engine = [[[ASDKJsonLogicEngineBuilder alloc] init] build];
  }
  ASDKJsonLogicResult *result = [engine evaluateExpression:expression data:nil];
  if (![result isKindOfClass:[ASDKJsonLogicResultSuccess class]]) {
    printf("FAIL could not evaluate %s: %s\n", expression.description.UTF8String, result.description.UTF8String);
    failures++;
    return nil;
  }
  return ((ASDKJsonLogicResultSuccess *)result).value;
}

static void testKotlinBooleansBecomeJSBooleans(void)
{
  id kotlinTrue = kotlinValue(@{@"==": @[@1, @1]});
  id kotlinFalse = kotlinValue(@{@"==": @[@1, @2]});

  // The defect itself, so this file fails loudly if Kotlin/Native ever changes its boxing and the
  // conversion stops being needed (or starts being wrong).
  check([kotlinTrue isKindOfClass:[ASDKBoolean class]], @"precondition: Kotlin true arrives as ASDKBoolean");
  check(!isJSBoolean(kotlinTrue), @"precondition: unconverted, React Native would send Kotlin true as a number");

  id convertedTrue = AmplyJSValueFromNative(kotlinTrue);
  id convertedFalse = AmplyJSValueFromNative(kotlinFalse);
  check(isJSBoolean(convertedTrue) && [(NSNumber *)convertedTrue boolValue], @"Kotlin true becomes JS true");
  check(isJSBoolean(convertedFalse) && ![(NSNumber *)convertedFalse boolValue], @"Kotlin false becomes JS false");
}

static void testNestedValues(void)
{
  id kotlinTrue = kotlinValue(@{@"==": @[@1, @1]});
  // A list built by Kotlin, holding a Kotlin Boolean and a Kotlin number.
  id kotlinList = kotlinValue(@{@"merge": @[@[@YES], @[@1]]});
  check([kotlinList isKindOfClass:[NSArray class]], @"precondition: Kotlin list arrives as NSArray");

  NSDictionary *payload = @{
    @"flag": kotlinTrue,
    @"list": kotlinList ?: @[],
    @"inner": @{@"deeper": @{@"flag": kotlinTrue}},
    @"tags": [NSSet setWithObject:@"vip"],
    @"name": @"Rex",
    @"nothing": [NSNull null],
  };

  NSDictionary *converted = AmplyJSDictionaryFromNative(payload);
  check(isJSBoolean(converted[@"flag"]), @"a top-level Kotlin Boolean in a dictionary becomes a JS boolean");
  NSArray *list = converted[@"list"];
  check(list.count == 2 && isJSBoolean(list[0]), @"a Kotlin Boolean inside a Kotlin list becomes a JS boolean");
  check(list.count == 2 && isJSNumber(list[1]) && [(NSNumber *)list[1] intValue] == 1, @"a Kotlin number beside it stays a number");
  check(isJSBoolean(converted[@"inner"][@"deeper"][@"flag"]), @"a Kotlin Boolean two dictionaries down becomes a JS boolean");
  check([converted[@"tags"] isEqual:@[@"vip"]], @"a set becomes an array React Native can carry");
  check([converted[@"name"] isEqual:@"Rex"], @"a string passes through");
  check(converted[@"nothing"] == (id)kCFNull, @"NSNull passes through");
}

static void testNumbersStayNumbers(void)
{
  // Kotlin Byte has objCType "c", the same as a BOOL — a check by objCType would turn it into a
  // boolean. Only the KotlinBoolean class may be converted.
  id kotlinByte = [ASDKByte numberWithChar:1];
  id kotlinLong = [ASDKLong numberWithLongLong:1];
  id kotlinSum = kotlinValue(@{@"+": @[@1, @2]});
  check(isJSNumber(AmplyJSValueFromNative(kotlinByte)), @"a Kotlin Byte 1 stays a number");
  check(isJSNumber(AmplyJSValueFromNative(kotlinLong)), @"a Kotlin Long 1 stays a number");
  check(isJSNumber(AmplyJSValueFromNative(kotlinSum)) && [(NSNumber *)AmplyJSValueFromNative(kotlinSum) doubleValue] == 3,
        @"a number computed by Kotlin stays a number");
  check(isJSNumber(AmplyJSValueFromNative(@1)), @"a Foundation 1 stays a number");
  check(isJSBoolean(AmplyJSValueFromNative(@YES)), @"a Foundation YES stays a boolean");
}

static void testEdges(void)
{
  check(AmplyJSValueFromNative(nil) == nil, @"nil stays nil");
  check([AmplyJSDictionaryFromNative(nil) isEqual:@{}], @"a nil dictionary becomes an empty one");
  check([AmplyJSDictionaryFromNative(@"not a dictionary") isEqual:@{}], @"a non-dictionary becomes an empty one");
  NSURL *url = [NSURL URLWithString:@"https://example.test"];
  check([AmplyJSValueFromNative(url) isEqual:url.description], @"an unknown object becomes its description, as on Android");
}

/** Spins the main run loop until [isDone] or the deadline; the SDK answers on its own threads. */
static BOOL waitUntil(BOOL (^isDone)(void), NSTimeInterval seconds)
{
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:seconds];
  while (!isDone() && deadline.timeIntervalSinceNow > 0) {
    [[NSRunLoop mainRunLoop] runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
  }
  return isDone();
}

/**
 * The two exits the defect was measured on, through a real SDK instance: a boolean custom property
 * read back with getCustomProperty and in the @custom snapshot. The backend is an unroutable local
 * port, so nothing leaves the machine; storage is local to this simulator.
 */
static void testRealSdkExits(void)
{
  ASDKAmplyConfigBuilder *builder = [[ASDKAmplyConfigBuilder alloc] init];
  [builder apiBlock:^(ASDKAmplyApiBuilder *api) {
    api.appId = @"tools.amply.bridge-tests";
    api.apiKeyPublic = @"public";
    api.apiKeySecret = @"secret";
  }];
  [builder networkBlock:^(ASDKAmplyNetworkBuilder *network) {
    network.configBaseUrl = @"http://127.0.0.1:9";
    network.backendBaseUrl = @"http://127.0.0.1:9";
  }];
  ASDKAmply *amply = [[ASDKAmply alloc] initWithConfig:[builder build]];
  [amply setCustomPropertyKey:@"is_subscriber" value:@YES];

  // The write is fire-and-forget, so read until it has landed.
  __block id stored = nil;
  __block BOOL isReading = NO;
  BOOL landed = waitUntil(^BOOL {
    if (stored) {
      return YES;
    }
    if (!isReading) {
      isReading = YES;
      [amply getCustomPropertyKey:@"is_subscriber" completionHandler:^(id value, NSError *error) {
        stored = value;
        isReading = NO;
      }];
    }
    return NO;
  }, 15);
  check(landed, @"precondition: the SDK stores and returns the custom property");
  check([stored isKindOfClass:[ASDKBoolean class]] && !isJSBoolean(stored), @"precondition: getCustomProperty hands the bridge a Kotlin boolean, which React Native calls a number");
  check(landed && isJSBoolean(AmplyJSValueFromNative(stored)) && [(NSNumber *)AmplyJSValueFromNative(stored) boolValue],
        @"getCustomProperty's true reaches JS as true");

  __block NSDictionary *snapshot = nil;
  [amply getDataSetSnapshotType:ASDKDataSetTypeCustom.shared completionHandler:^(NSDictionary *value, NSError *error) {
    snapshot = value ?: @{};
  }];
  BOOL hasSnapshot = waitUntil(^BOOL { return snapshot != nil; }, 15);
  check([snapshot[@"is_subscriber"] isKindOfClass:[ASDKBoolean class]], @"precondition: the @custom snapshot holds the same Kotlin boolean");
  check(hasSnapshot && isJSBoolean(AmplyJSDictionaryFromNative(snapshot)[@"is_subscriber"]),
        @"the @custom snapshot's true reaches JS as true");
}

static void testGuardedOpsRunEveryOp(void)
{
  NSMutableArray<NSString *> *ran = [NSMutableArray array];
  NSMutableArray<NSNumber *> *failedAt = [NSMutableArray array];
  NSArray<void (^)(id)> *ops = @[
    ^(id argument) { [ran addObject:@"first"]; },
    ^(id argument) { [NSException raise:NSInvalidArgumentException format:@"second op failed"]; },
    ^(id argument) { [ran addObject:[NSString stringWithFormat:@"third:%@", argument]]; },
  ];

  NSUInteger failed = 0;
  BOOL escaped = NO;
  @try {
    failed = AmplyRunEachGuarded(ops, @"instance", ^(NSUInteger index, NSException *exception) {
      [failedAt addObject:@(index)];
    });
  } @catch (NSException *exception) {
    escaped = YES;
  }

  check(!escaped, @"an op that raises does not propagate into the caller");
  check([ran isEqual:(@[@"first", @"third:instance"])], @"the ops after the one that raised still run, in order");
  check(failed == 1 && [failedAt isEqual:@[@1]], @"the failure is reported once, by position");
}

int main(int argc, const char *argv[])
{
  @autoreleasepool {
    testKotlinBooleansBecomeJSBooleans();
    testNestedValues();
    testNumbersStayNumbers();
    testEdges();
    testRealSdkExits();
    testGuardedOpsRunEveryOp();
    printf("%s: %d failed\n", failures == 0 ? "OK" : "FAILED", failures);
  }
  return failures == 0 ? 0 : 1;
}
