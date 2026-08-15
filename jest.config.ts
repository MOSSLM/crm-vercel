import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/setupTests.ts'],
  // Les fichiers `*.manual.*` sont des outils de relecture, pas des tests : ils
  // écrivent un rendu sur disque pour qu'on l'ouvre au navigateur. jsdom ne met
  // rien en page, donc certaines vérifications (chevauchements, troncatures)
  // n'existent qu'à l'œil. On les lance à la main :
  //     npx jest --testMatch='**/canvas-dump.manual.tsx'
  testPathIgnorePatterns: ['/node_modules/', '\\.manual\\.'],
  moduleNameMapper: {
    // Order matters: only the FIRST matching pattern is applied. The stylesheet
    // rule has to come before the '@/' alias, otherwise an aliased CSS import
    // ("@/components/.../theme.css") is rewritten to a real path and then fed
    // to the TS transform, which chokes on the first selector.
    '\\.(css|sass|scss)$': '<rootDir>/src/test-shims/style-mock.ts',
    // d3-geo n'expose que des sources ESM (`main` pointe sur src/index.js), que
    // le transform TypeScript de ce projet ne touche pas : tout test important
    // une carte échouait sur « Unexpected token 'export' ». On pointe donc sur
    // le bundle UMD que le paquet fournit déjà. C'est la VRAIE projection, pas
    // un simulacre : l'orientation nord-sud de la grille de tuiles est
    // justement ce qu'on veut vérifier.
    // (d3-array vient avec : le bundle UMD de d3-geo le laisse en dépendance
    // externe, et ses sources sont ESM elles aussi.)
    '^d3-geo$': '<rootDir>/node_modules/d3-geo/dist/d3-geo.js',
    '^d3-array$': '<rootDir>/node_modules/d3-array/dist/d3-array.js',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^server-only$': '<rootDir>/src/test-shims/server-only.ts',
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { module: 'commonjs', jsx: 'react-jsx' } }],
  },
};

export default config;
