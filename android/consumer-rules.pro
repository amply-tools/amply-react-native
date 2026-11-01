# DefaultAmplyClient.maybePrimeSessionTracker() reads these two private fields of the
# Amply KMP SDK by name through reflection to prime the first session. R8 renames them in a
# minified host app, getDeclaredField then throws and the first session is never primed.
# The reflection is the React Native bridge's, so the keep rules belong here and not in the host.
-keepclassmembers class tools.amply.sdk.Amply { ** amplyCore; }
-keepclassmembers class tools.amply.sdk.session.SessionManager { ** sessionTracker; }
