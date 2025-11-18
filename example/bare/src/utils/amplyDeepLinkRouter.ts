import {Linking} from 'react-native';
import {
  getStateFromPath as defaultGetStateFromPath,
  type LinkingOptions,
  type NavigationState,
  type ParamListBase,
  type PartialState,
} from '@react-navigation/native';

const INTERNAL_PREFIXES = ['amply://campaign'] as const;

let latestInternalUrl: string | null = null;
const pendingInternalUrls: string[] = [];
let navigationListener: ((url: string) => void) | null = null;

const isInternalUrl = (url: string): boolean =>
  INTERNAL_PREFIXES.some(prefix => url.startsWith(prefix));

const emitOrQueue = (url: string) => {
  if (navigationListener) {
    navigationListener(url);
  } else {
    pendingInternalUrls.push(url);
  }
};

const setNavigationUrlListener = (listener: ((url: string) => void) | null) => {
  navigationListener = listener;
  if (!listener) {
    return;
  }
  while (pendingInternalUrls.length > 0) {
    const next = pendingInternalUrls.shift();
    if (next) {
      listener(next);
    }
  }
};

const rememberAmplyUrl = (url: string): void => {
  if (isInternalUrl(url)) {
    latestInternalUrl = url;
  }
};

const getLatestAmplyUrl = () => latestInternalUrl;

const attachUrlToState = <
  State extends NavigationState | PartialState<NavigationState>,
>(
  state: State,
  url: string | null,
  promoRouteName: string,
): State => {
  const routes = state.routes.map(route => {
    let updatedRoute = route;
    if ('state' in route && route.state) {
      updatedRoute = {
        ...route,
        state: attachUrlToState(
          route.state as NavigationState | PartialState<NavigationState>,
          url,
          promoRouteName,
        ),
      } as typeof route;
    }
    if (url && route.name === promoRouteName) {
      updatedRoute = {
        ...updatedRoute,
        params: {
          ...(updatedRoute.params ?? {}),
          url,
        },
      };
    }
    return updatedRoute;
  }) as State['routes'];

  return {
    ...state,
    routes,
  } as State;
};

type AmplyLinkingAugment<ParamList extends ParamListBase> = Pick<
  LinkingOptions<ParamList>,
  'prefixes' | 'getInitialURL' | 'subscribe' | 'getStateFromPath'
>;

type CreateOptions<ParamList extends ParamListBase> = {
  promoRouteName: keyof ParamList & string;
  additionalPrefixes?: readonly string[];
};

export const createAmplyLinkingOptions = <ParamList extends ParamListBase>({
  promoRouteName,
  additionalPrefixes,
}: CreateOptions<ParamList>): AmplyLinkingAugment<ParamList> => {
  const prefixes = Array.from(
    new Set<string>([
      ...(additionalPrefixes?.map(prefix => prefix.toString()) ?? []),
      ...INTERNAL_PREFIXES,
    ]),
  );

  return {
    prefixes,
    async getInitialURL() {
      const url = await Linking.getInitialURL();
      if (url) {
        rememberAmplyUrl(url);
      }
      return url;
    },
    subscribe(listener) {
      setNavigationUrlListener(listener);

      const onReceiveURL = ({url}: {url: string}) => {
        rememberAmplyUrl(url);
        listener(url);
      };
      const subscription = Linking.addEventListener('url', onReceiveURL);

      return () => {
        setNavigationUrlListener(null);
        subscription.remove();
      };
    },
    getStateFromPath(path, options) {
      const state = defaultGetStateFromPath<ParamList>(path, options);
      if (!state) {
        return state;
      }
      return attachUrlToState(state, getLatestAmplyUrl(), promoRouteName);
    },
  };
};

export const routeAmplyUrl = (url: string): boolean => {
  if (isInternalUrl(url)) {
    latestInternalUrl = url;
    emitOrQueue(url);
    return true;
  }
  setTimeout(() => {
    Linking.openURL(url).catch(error => {
      console.warn('Amply deep link open error', error);
    });
  }, 0);
  return false;
};
