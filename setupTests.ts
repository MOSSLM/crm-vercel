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
