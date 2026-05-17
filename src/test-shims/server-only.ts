// Test shim for the `server-only` package, which throws when imported from a
// non-server bundle. Tests evaluate server-only modules to assert behaviour,
// so we expose an empty no-op module instead.
export {};
