/**
 * Canonicalisation d'URL et de domaine — fonctions pures, sans dépendance
 * navigateur, donc utilisables aussi bien côté client que dans une route API.
 *
 * Ces deux helpers vivaient dans `src/utils/displayHelpers.tsx` et
 * `src/utils/api.tsx`. Ce dernier importe le client Supabase navigateur, ce qui
 * le rend inutilisable depuis une route serveur — d'où l'extraction ici. Les
 * deux modules d'origine réexportent ces fonctions, les appelants existants
 * n'ont pas changé.
 *
 * Elles servent à comparer une URL d'entreprise aux entrées de `url_blacklist`
 * (`scope: 'exact_url' | 'domain'`).
 */

/** Force https, retire protocole/www, slash final, query et fragment, en minuscules. */
export const canonicalizeUrl = (url: string): string => {
  if (!url) return '';

  try {
    // Le constructeur URL exige un protocole.
    let temp = url.trim();
    if (!temp.startsWith('http://') && !temp.startsWith('https://')) {
      temp = `https://${temp}`;
    }

    const parsed = new URL(temp);
    const hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const pathname = parsed.pathname.toLowerCase().replace(/\/$/, '');
    return `https://${hostname}${pathname}`;
  } catch {
    // Repli : nettoyage manuel quand l'URL est trop cassée pour être parsée.
    let cleaned = url.trim().toLowerCase();
    cleaned = cleaned.replace(/^https?:\/\//, '');
    cleaned = cleaned.replace(/^www\./, '');
    cleaned = cleaned.split(/[?#]/)[0];
    cleaned = cleaned.replace(/\/$/, '');
    return cleaned ? `https://${cleaned}` : '';
  }
};

/** Hostname seul, sans `www.`, en minuscules. */
export const canonicalizeDomain = (url: string): string => {
  try {
    const { hostname } = new URL(url.startsWith('http') ? url : `http://${url}`);
    return hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .toLowerCase();
  }
};
