cmake_minimum_required(VERSION 3.13)

project(AmplyReactNative LANGUAGES CXX)

set(CMAKE_VERBOSE_MAKEFILE on)

# React Native dir передаётся Gradle
set(REACT_SRC_ROOT "${REACT_NATIVE_DIR}")
set(REACT_COMMON_DIR "${REACT_SRC_ROOT}/ReactCommon")
set(REACT_ANDROID_SRC_DIR "${REACT_SRC_ROOT}/ReactAndroid/src/main/jni")
set(REACT_JAVA_TURBO_DIR "${REACT_COMMON_DIR}/react/nativemodule/core/platform/android")
set(REACT_CALL_INVOKER_DIR "${REACT_COMMON_DIR}/callinvoker")
set(REACT_TURBO_CORE_DIR "${REACT_COMMON_DIR}/react/nativemodule/core")
include(${REACT_COMMON_DIR}/cmake-utils/react-native-flags.cmake)
find_package(ReactAndroid REQUIRED CONFIG)
find_package(fbjni REQUIRED CONFIG)

# Add codegen subdirectory (this will define react_codegen_AmplyReactNative target)
add_subdirectory(
  ${CMAKE_CURRENT_SOURCE_DIR}/../../newarch/jni
  ${CMAKE_CURRENT_BINARY_DIR}/codegen
)

# Now that targets are defined, propagate includes to the codegen target
# This ensures OBJECT libraries can access all necessary headers (including folly)
get_target_property(FBJNI_IFACE_INCLUDES fbjni::fbjni INTERFACE_INCLUDE_DIRECTORIES)
if(FBJNI_IFACE_INCLUDES)
  target_include_directories(react_codegen_AmplyReactNative PUBLIC ${FBJNI_IFACE_INCLUDES})
endif()

# Get includes from ReactAndroid::reactnative target (includes JSI, folly, etc.)
# These includes contain folly/dynamic.h and other necessary React Native headers
get_target_property(REACTNATIVE_IFACE_INCLUDES ReactAndroid::reactnative INTERFACE_INCLUDE_DIRECTORIES)
if(REACTNATIVE_IFACE_INCLUDES)
  target_include_directories(react_codegen_AmplyReactNative PUBLIC ${REACTNATIVE_IFACE_INCLUDES})
endif()

target_include_directories(
  react_codegen_AmplyReactNative
  PUBLIC
  ${REACT_SRC_ROOT}
  ${REACT_ANDROID_SRC_DIR}
  ${REACT_COMMON_DIR}
  ${REACT_CALL_INVOKER_DIR}
  ${REACT_TURBO_CORE_DIR}
  ${REACT_JAVA_TURBO_DIR}
)

add_library(
  AmplyReactNative
  SHARED
  AmplyTurboModule.cpp
)

target_include_directories(
  AmplyReactNative
  PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_CURRENT_SOURCE_DIR}/../../newarch/jni
  ${REACT_ANDROID_SRC_DIR}
  ${REACT_SRC_ROOT}
  ${REACT_COMMON_DIR}
  ${REACT_CALL_INVOKER_DIR}
  ${REACT_TURBO_CORE_DIR}
  ${REACT_JAVA_TURBO_DIR}
)

target_link_libraries(
  AmplyReactNative
  react_codegen_AmplyReactNative # важно
  ReactAndroid::reactnative
  ReactAndroid::jsi
  fbjni::fbjni
)

target_compile_reactnative_options(AmplyReactNative PRIVATE)
