import '@testing-library/jest-dom';

/**
 * `structuredClone` manque dans l'environnement jsdom de Jest, alors qu'il
 * existe dans tous les navigateurs visés et dans le runtime Node de Vercel.
 * Sans ce repli, un module parfaitement correct en production échoue au test
 * pour une raison qui n'a rien à voir avec ce qu'il fait.
 */
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
}

/**
 * `window.matchMedia` manque aussi dans jsdom. Il existe dans tous les
 * navigateurs visés depuis dix ans, et `useIsMobile` — la bascule
 * tableau/cartes des écrans de travail — s'en sert pour écouter les
 * changements de largeur. Sans ce repli, tout test qui MONTE un de ces écrans
 * échoue sur « matchMedia is not a function », pour une raison qui n'a rien à
 * voir avec ce que le composant fait.
 *
 * LE REPLI RÉPOND VRAI, il ne renvoie pas `matches: false` en dur : il lit
 * `(max-width: Npx)` et le compare à `window.innerWidth`. Un stub qui mentirait
 * ferait passer pour du bureau un test qui aurait réglé la largeur exprès —
 * c'est-à-dire précisément le test qu'on voudrait écrire pour le mobile.
 *
 * jsdom part à 1 024 px : par défaut, on est donc en bureau, et les tests
 * existants gardent leurs assertions de tableau.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => {
    const max = /\(\s*max-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)/.exec(query);
    const min = /\(\s*min-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)/.exec(query);
    const largeur = window.innerWidth;
    const matches =
      (max ? largeur <= Number(max[1]) : true) && (min ? largeur >= Number(min[1]) : true);

    return {
      matches,
      media: query,
      onchange: null,
      // Aucun écouteur n'est jamais appelé : jsdom ne redimensionne pas de
      // fenêtre. Un test qui veut l'autre largeur pose `window.innerWidth`
      // avant le rendu.
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList;
  };
}
