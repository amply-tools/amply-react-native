#import "AmplyBridgeValues.h"

#import <AmplySDK/AmplySDK.h>

id _Nullable AmplyJSValueFromNative(id _Nullable value)
{
  if (value == nil || value == (id)kCFNull) {
    return value;
  }
  // Before the generic NSNumber case, and by class only: a Kotlin Byte has the same objCType ("c")
  // as a BOOL, so telling them apart by objCType would turn every Byte 0/1 into a boolean.
  if ([value isKindOfClass:[ASDKBoolean class]]) {
    return [(NSNumber *)value boolValue] ? @YES : @NO;
  }
  if ([value isKindOfClass:[NSString class]] || [value isKindOfClass:[NSNumber class]]) {
    return value;
  }
  if ([value isKindOfClass:[NSDictionary class]]) {
    NSDictionary *source = (NSDictionary *)value;
    NSMutableDictionary<NSString *, id> *converted = [NSMutableDictionary dictionaryWithCapacity:source.count];
    [source enumerateKeysAndObjectsUsingBlock:^(id key, id item, BOOL *stop) {
      NSString *name = [key isKindOfClass:[NSString class]] ? (NSString *)key : [key description];
      converted[name] = AmplyJSValueFromNative(item) ?: (id)kCFNull;
    }];
    return [converted copy];
  }
  if ([value isKindOfClass:[NSArray class]] || [value isKindOfClass:[NSSet class]]) {
    NSMutableArray *converted = [NSMutableArray array];
    for (id item in (id<NSFastEnumeration>)value) {
      [converted addObject:AmplyJSValueFromNative(item) ?: (id)kCFNull];
    }
    return [converted copy];
  }
  return [value description];
}

NSDictionary<NSString *, id> *AmplyJSDictionaryFromNative(id _Nullable value)
{
  id converted = [value isKindOfClass:[NSDictionary class]] ? AmplyJSValueFromNative(value) : nil;
  return converted ?: @{};
}

NSUInteger AmplyRunEachGuarded(NSArray<void (^)(id)> *ops,
                               id argument,
                               void (^_Nullable onFailure)(NSUInteger index, NSException *exception))
{
  NSUInteger failures = 0;
  NSUInteger index = 0;
  for (void (^op)(id) in ops) {
    @try {
      op(argument);
    } @catch (NSException *exception) {
      failures++;
      if (onFailure) {
        onFailure(index, exception);
      }
    }
    index++;
  }
  return failures;
}
