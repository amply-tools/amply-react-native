// Pure helpers for what crosses the bridge, kept apart from AmplyModule.mm so they compile without
// React Native and can be tested against the real AmplySDK framework: ios/Tests/run.sh.
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * [value] as React Native should see it: every Kotlin Boolean, at any depth, as `@YES` / `@NO`.
 *
 * Kotlin/Native boxes a Boolean as `KotlinBoolean` (`ASDKBoolean`), an NSNumber subclass that is
 * not `__NSCFBoolean`. React Native tells a boolean from a number by exactly that class, so without
 * this every `true` the SDK returns reaches JS as `1` — on iOS only; the Android bridge has always
 * kept the type. Every value the bridge hands to JS from the SDK goes through here.
 *
 * Dictionaries, arrays and sets are copied with their contents converted; a set becomes an array,
 * which React Native can carry. Strings, numbers and NSNull pass through. Anything else becomes its
 * description, as the Android bridge does with `toString()`. nil stays nil.
 */
FOUNDATION_EXTERN id _Nullable AmplyJSValueFromNative(id _Nullable value);

/** [AmplyJSValueFromNative] for a dictionary; nil or not-a-dictionary gives an empty one. */
FOUNDATION_EXTERN NSDictionary<NSString *, id> *AmplyJSDictionaryFromNative(id _Nullable value);

/**
 * Runs every op with [argument], each inside its own @try, so one that raises cannot skip the rest
 * or propagate into the caller. [onFailure] hears about each one that raised, by position.
 * Returns how many raised.
 */
FOUNDATION_EXTERN NSUInteger AmplyRunEachGuarded(NSArray<void (^)(id)> *ops,
                                                 id argument,
                                                 void (^_Nullable onFailure)(NSUInteger index, NSException *exception));

NS_ASSUME_NONNULL_END
