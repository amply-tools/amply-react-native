//
//  AmplyBareExample-Bridging-Header.h
//
//  React-RCTLinking builds as a static pod without a Swift module, so
//  `import React_RCTLinking` does not resolve. RCTLinkingManager comes in
//  through this bridging header instead (the approach React Native's own
//  linking docs use for Swift AppDelegates).
//

#import <React/RCTLinkingManager.h>
