package tools.amply.sdk.reactnative

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

class AmplyPackage : TurboReactPackage() {

  override fun getModule(
    name: String,
    reactContext: ReactApplicationContext
  ): NativeModule? =
    when (name) {
      AmplyModule.NAME -> AmplyModule(reactContext)
      else -> null
    }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    val moduleInfos = mapOf(
      AmplyModule.NAME to ReactModuleInfo(
        AmplyModule.NAME,
        AmplyModule::class.java.name,
        false,
        false,
        false,
        false,
        true,
      )
    )
    return ReactModuleInfoProvider { moduleInfos }
  }

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> = emptyList()
}
