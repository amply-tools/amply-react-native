# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# This source code is licensed under the MIT license found in the
# LICENSE file in the root directory of this source tree.

cmake_minimum_required(VERSION 3.13)
set(CMAKE_VERBOSE_MAKEFILE on)

# --- React Native 0.79: wire up compile flags ---
if(NOT DEFINED REACT_NATIVE_DIR)
  message(FATAL_ERROR "REACT_NATIVE_DIR is not defined; it must point to node_modules/react-native")
endif()

# Gradle (externalNativeBuild) passes REACT_NATIVE_DIR.
# From it we derive ReactCommon path used by RN CMake utils.
set(REACT_COMMON_DIR "${REACT_NATIVE_DIR}/ReactCommon")

# This provides target_compile_reactnative_options and imported targets
# like 'reactnative', 'jsi', 'fbjni', etc.
include(${REACT_COMMON_DIR}/cmake-utils/react-native-flags.cmake)
# --- end RN wiring ---
# Ensure fbjni is available as imported target
find_package(fbjni REQUIRED CONFIG)

# For OBJECT libraries, we need to explicitly add include directories since
# target_link_libraries doesn't propagate INTERFACE_INCLUDE_DIRECTORIES for OBJECT libs
set(REACT_JSI_DIR "${REACT_COMMON_DIR}/jsi")

file(GLOB react_codegen_SRCS CONFIGURE_DEPENDS *.cpp react/renderer/components/AmplyReactNative/*.cpp)

add_library(
  react_codegen_AmplyReactNative
  OBJECT
  ${react_codegen_SRCS}
)

target_include_directories(react_codegen_AmplyReactNative PUBLIC . react/renderer/components/AmplyReactNative ${REACT_JSI_DIR})


target_compile_reactnative_options(react_codegen_AmplyReactNative PRIVATE)
