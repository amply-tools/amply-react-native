package tools.amply.sdk.reactnative.model

/**
 * Log level for SDK debug output.
 */
enum class LogLevel(val level: Int) {
    NONE(0),
    ERROR(1),
    WARN(2),
    INFO(3),
    DEBUG(4);

    companion object {
        fun fromString(value: String?): LogLevel = when (value?.lowercase()) {
            "none" -> NONE
            "error" -> ERROR
            "warn" -> WARN
            "info" -> INFO
            "debug" -> DEBUG
            else -> NONE
        }
    }

    override fun toString(): String = name.lowercase()
}

data class AmplyInitializationOptions(
  val appId: String,
  val apiKeyPublic: String,
  val apiKeySecret: String?,
  val configBaseUrl: String?,
  val backendBaseUrl: String?,
  /** Older single-URL spelling of [backendBaseUrl]; see [effectiveBackendBaseUrl]. */
  val endpoint: String?,
  val defaultConfig: String?,
  val debug: Boolean?,
  val logLevel: LogLevel?,
) {
    /**
     * Get the effective log level, resolving debug vs logLevel precedence.
     * logLevel takes precedence if specified, otherwise debug: true = DEBUG level.
     */
    fun getEffectiveLogLevel(): LogLevel {
        return logLevel ?: if (debug == true) LogLevel.DEBUG else LogLevel.NONE
    }

    /**
     * The backend host to use, resolving the legacy [endpoint] spelling.
     *
     * [backendBaseUrl] wins when both are given: a caller who names the new field
     * has said what they mean, and silently preferring the deprecated one would
     * make the migration surprising.
     */
    fun effectiveBackendBaseUrl(): String? = backendBaseUrl ?: endpoint
}
