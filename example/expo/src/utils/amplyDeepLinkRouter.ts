import { router } from 'expo-router';

const INTERNAL_PREFIXES = ['amply://'] as const;

const isInternalUrl = (url: string): boolean =>
  INTERNAL_PREFIXES.some(prefix => url.startsWith(prefix));

/**
 * Routes Amply deeplinks through expo-router
 * @param url The deeplink URL from Amply SDK
 * @returns true if the URL was handled internally, false otherwise
 */
export const routeAmplyUrl = (url: string): boolean => {
  console.log('[routeAmplyUrl] Called with URL:', url);

  if (!isInternalUrl(url)) {
    // Not an Amply internal URL - ignore
    console.log('[routeAmplyUrl] Ignoring non-amply URL');
    return false;
  }

  // Extract the promo ID from the URL
  // Expected format: amply://campaign/promo/[id]
  const parts = url.split('/');
  const promoId = parts[parts.length - 1] || 'default';

  console.log('[routeAmplyUrl] Navigating to promo screen with ID:', promoId);

  // Navigate to promo screen with the extracted ID
  router.push({
    pathname: '/promo/[id]',
    params: { id: promoId },
  });

  return true;
};
