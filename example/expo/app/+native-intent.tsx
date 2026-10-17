import Amply from '@amplytools/react-native-amply-sdk';

/**
 * Runs for every link expo-router is about to route, before it picks a screen. This is the one
 * place the Expo example hands incoming links to Amply (the shared provider is told not to).
 *
 * A link Amply recognises as its own (a test-launch link) is not a screen of this app: Amply takes
 * it and the router is sent to the home route instead of its not-found screen. Every other link
 * goes through unchanged. Recognition is Amply's: `handleUrl` answers `true` only for its own links.
 *
 * On native, `path` is the full incoming URL, which is what `Amply.handleUrl` takes.
 */
export function redirectSystemPath({path}: {path: string; initial: boolean}): string {
  if (Amply.handleUrl(path)) {
    return '/';
  }
  return path;
}
