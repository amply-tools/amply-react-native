import * as Linking from 'expo-linking';
import { router } from 'expo-router';

const INTERNAL_PREFIXES = ['amply://campaign'] as const;

const isInternalUrl = (url: string): boolean =>
  INTERNAL_PREFIXES.some(prefix => url.startsWith(prefix));

/**
 * Routes Amply deeplinks through expo-router or opens external URLs
 * @param url The deeplink URL from Amply SDK
 * @returns true if the URL was handled internally, false if opened externally
 */
export const routeAmplyUrl = (url: string): boolean => {
  if (isInternalUrl(url)) {
    // Extract the promo ID from the URL
    // Expected format: amply://campaign/promo/[id]
    const parts = url.split('/');
    const promoId = parts[parts.length - 1] || 'default';

    // Navigate to promo screen with the extracted ID
    router.push({
      pathname: '/promo/[id]',
      params: { id: promoId },
    });

    return true;
  }

  // Open external URL
  setTimeout(() => {
    Linking.openURL(url).catch(error => {
      console.warn('Amply deep link open error', error);
    });
  }, 0);

  return false;
};
