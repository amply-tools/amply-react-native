package tools.amply.sdk.reactnative.model

sealed interface DataSetType {
  data object Device : DataSetType
  data object User : DataSetType
  data object Session : DataSetType

  data class TriggeredEvent(
    val countStrategy: CountStrategy,
    val params: List<EventParam>,
    val eventName: String?
  ) : DataSetType {
    enum class CountStrategy(val wireName: String) {
      TOTAL("total"),
      SESSION("session"),
      USER("user");

      companion object {
        fun fromWireName(name: String?): CountStrategy? = entries.firstOrNull { it.wireName == name }
      }
    }
  }

  data class Events(val events: List<Event>) : DataSetType {
    data class Event(
      val name: String,
      val type: EventType,
      val params: List<EventParam>
    )

    enum class EventType(val wireName: String) {
      CUSTOM("custom"),
      SYSTEM("system");

      companion object {
        fun fromWireName(name: String?): EventType? = entries.firstOrNull { it.wireName == name }
      }
    }
  }

  data class EventParam(val name: String, val value: Any?)
}
