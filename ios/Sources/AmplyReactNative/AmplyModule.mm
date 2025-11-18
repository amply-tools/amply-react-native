#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTConvert.h>
#import <React/RCTLog.h>
#import <ReactCommon/RCTTurboModule.h>
#import "AmplyReactNative/AmplyReactNative.h"

using namespace facebook::react;

@interface Amply : NativeAmplyModuleSpecBase <NativeAmplyModuleSpec>
@end

@implementation Amply

RCT_EXPORT_MODULE()

- (void)initialize:(JS::NativeAmplyModule::AmplyInitializationConfig &)config
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  if (reject) {
    reject(@"AMP_NO_IOS_SDK", @"Amply iOS SDK not yet available", nil);
  }
}

- (NSNumber *)isInitialized
{
  return @(NO);
}

- (void)track:(JS::NativeAmplyModule::TrackEventPayload &)payload
      resolve:(RCTPromiseResolveBlock)resolve
       reject:(RCTPromiseRejectBlock)reject
{
  if (reject) {
    reject(@"AMP_NO_IOS_SDK", @"Amply iOS SDK not yet available", nil);
  }
}

- (void)getRecentEvents:(double)limit
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
  if (reject) {
    reject(@"AMP_NO_IOS_SDK", @"Amply iOS SDK not yet available", nil);
  }
}

- (void)getDataSetSnapshot:(NSDictionary *)type
                   resolve:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject
{
  if (reject) {
    reject(@"AMP_NO_IOS_SDK", @"Amply iOS SDK not yet available", nil);
  }
}

- (void)registerDeepLinkListener
{
  // Not available on iOS yet.
}

- (void)addListener:(NSString *)eventName
{
  // Required by RN EventEmitter contracts.
}

- (void)removeListeners:(double)count
{
  // Required by RN EventEmitter contracts.
}

- (std::shared_ptr<TurboModule>)getTurboModule:(const ObjCTurboModule::InitParams &)params
{
  return std::make_shared<NativeAmplyModuleSpecJSI>(params);
}

@end
