// Structured console logging with levels (debug/info/warn/error).
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
let _logLevel = LOG_LEVELS.INFO;

export function setLogLevel(level: number): void {
  _logLevel = level;
}

function _log(level: number, label: string, context: string, message?: unknown, data?: unknown): void {
  if (_logLevel > level) return;
  const ts = new Date().toISOString().slice(11, 23);
  const prefix = `[${ts}][${label}]`;
  const fn = level === LOG_LEVELS.ERROR ? 'error' : level === LOG_LEVELS.WARN ? 'warn' : 'log';
  if (data !== undefined) {
    console[fn](prefix, context, message, data);
  } else if (message !== undefined) {
    console[fn](prefix, context, message);
  } else {
    console[fn](prefix, context);
  }
}

export const logger = {
  debug: (ctx: string, msg?: unknown, data?: unknown) => _log(LOG_LEVELS.DEBUG, 'DEBUG', ctx, msg, data),
  info: (ctx: string, msg?: unknown, data?: unknown) => _log(LOG_LEVELS.INFO, 'INFO', ctx, msg, data),
  warn: (ctx: string, msg?: unknown, data?: unknown) => _log(LOG_LEVELS.WARN, 'WARN', ctx, msg, data),
  error: (ctx: string, msg?: unknown, data?: unknown) => _log(LOG_LEVELS.ERROR, 'ERROR', ctx, msg, data),
};
