import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export const LOCALES = ['en', 'ta', 'hi'] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = 'sa.locale';

/**
 * Locale comes from a cookie (no /en, /ta, /hi URL prefixes) so deep links,
 * bookmarks and the API stay identical across languages.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  const locale: Locale = (LOCALES as readonly string[]).includes(raw ?? '')
    ? (raw as Locale)
    : 'en';

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
