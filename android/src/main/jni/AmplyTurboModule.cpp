#include <fbjni/fbjni.h>
#include <react/newarchdefaults/DefaultTurboModuleManagerDelegate.h>
#include <memory>
#include <string>

#include "AmplyReactNative.h"

using namespace facebook;

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *) {
  return jni::initialize(vm, [] {
    const auto previousProvider =
        react::DefaultTurboModuleManagerDelegate::javaModuleProvider;

    react::DefaultTurboModuleManagerDelegate::javaModuleProvider =
        [previousProvider](
            const std::string &name,
            const react::JavaTurboModule::InitParams &params)
        -> std::shared_ptr<react::TurboModule> {
      if (auto module = react::AmplyReactNative_ModuleProvider(name, params)) {
        return module;
      }
      if (previousProvider) {
        return previousProvider(name, params);
      }
      return nullptr;
    };
  });
}
