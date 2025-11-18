package tools.amply.sdk.reactnative.model

import tools.amply.sdk.datasets.DataSetType as NativeDataSetType
import tools.amply.sdk.events.EventType as NativeEventType

fun DataSetType.toNativeDataSetType(): NativeDataSetType = when (this) {
  DataSetType.Device -> NativeDataSetType.Device
  DataSetType.User -> NativeDataSetType.User
  DataSetType.Session -> NativeDataSetType.Session
is DataSetType.TriggeredEvent ->
    NativeDataSetType.TriggeredEvent(
      countStrategy = this.countStrategy.toNativeCountStrategy(),
      params = params.mapNotNull { it.toNativeParamOrNull() },
      eventName = eventName
    )
  is DataSetType.Events -> NativeDataSetType.Events(events.map { it.toNativeEventOrNull() }.filterNotNull())
}

private fun DataSetType.TriggeredEvent.CountStrategy.toNativeCountStrategy(): NativeDataSetType.TriggeredEvent.CountStrategy {
  return NativeDataSetType.TriggeredEvent.CountStrategy.values().firstOrNull {
    it.name.equals(name, ignoreCase = true)
  } ?: throw IllegalArgumentException("Unsupported TriggeredEvent count strategy: $name")
}

private fun DataSetType.EventParam.toNativeParamOrNull(): NativeDataSetType.EventParam? =
  value?.let { NativeDataSetType.EventParam(name, it) }

private fun DataSetType.Events.Event.toNativeEventOrNull(): NativeDataSetType.Events.Event? {
  val transformedParams = params.mapNotNull { it.toNativeParamOrNull() }
  if (transformedParams.size != params.size) {
    return null
  }
  return NativeDataSetType.Events.Event(
    name = name,
    type = NativeEventType.valueOf(type.name.uppercase()),
    params = transformedParams
  )
}
