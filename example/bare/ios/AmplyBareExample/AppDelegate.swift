import UIKit
import React
import React_RCTAppDelegate
// RCTLinkingManager comes from AmplyBareExample-Bridging-Header.h —
// React-RCTLinking is a static pod without a Swift module.
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    // Verification affordance: `-amplyAutogate "amplybare://autogate?action=bonus&outcome=watched"`
    // is injected as the launch URL, which is what Linking.getInitialURL() reads.
    //
    // It exists because `simctl openurl` cannot drive this app unattended — iOS puts up an
    // "Open in …?" confirmation for any custom scheme and the simulator cannot be tapped from
    // outside in this setup. Without it the gate path on RN iOS can only be checked by hand,
    // and a check nobody can script is one that happens once.
    var options = launchOptions ?? [:]
    if let autogate = UserDefaults.standard.string(forKey: "amplyAutogate"),
       let url = URL(string: autogate) {
      options[.url] = url
      NSLog("[AmplyBareExample] autogate launch URL: %@", autogate)
    }

    factory.startReactNative(
      withModuleName: "AmplyBareExample",
      in: window,
      launchOptions: options
    )

    return true
  }

  // Handle deep links via custom URL schemes (e.g., amply://)
  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return RCTLinkingManager.application(app, open: url, options: options)
  }

  // Handle universal links
  func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    return RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
