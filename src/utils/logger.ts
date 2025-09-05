import type {} from 'node:crypto';

/** Determine environment variables in both Node and Deno */
const getEnv = (key: string): string | undefined => {
  if (typeof process !== 'undefined' && process.env) return process.env[key];
  // @ts-ignore Deno global for edge functions
  if (typeof Deno !== 'undefined' && Deno.env) return Deno.env.get(key);
  return undefined;
};

const levelNames = ['debug', 'info', 'warn', 'error'] as const;
type LogLevel = typeof levelNames[number];
const levelOrder: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const envLevel = (getEnv('LOG_LEVEL') || 'info').toLowerCase() as LogLevel;
const currentLevel: LogLevel = levelNames.includes(envLevel) ? envLevel : 'info';

const shouldLog = (level: LogLevel) => levelOrder[level] >= levelOrder[currentLevel];

export const logger = {
  info: (...args: unknown[]) => {
    if (shouldLog('info')) console.log(...args);
  },
  error: (...args: unknown[]) => {
    if (shouldLog('error')) console.error(...args);
  },
  debug: (...args: unknown[]) => {
    if (shouldLog('debug')) console.debug(...args);
  },
};

export default logger;
