const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
let _logLevel = LOG_LEVELS.INFO;

function setLogLevel(level) { _logLevel = level; }

function _log(level, label, context, message, data) {
  if (_logLevel > level) return;
  const ts = new Date().toISOString().slice(11, 23);
  const prefix = `[${ts}][${label}]`;
  if (data !== undefined) {
    console[level === LOG_LEVELS.ERROR ? 'error' : level === LOG_LEVELS.WARN ? 'warn' : 'log'](prefix, context, message, data);
  } else if (message !== undefined) {
    console[level === LOG_LEVELS.ERROR ? 'error' : level === LOG_LEVELS.WARN ? 'warn' : 'log'](prefix, context, message);
  } else {
    console[level === LOG_LEVELS.ERROR ? 'error' : level === LOG_LEVELS.WARN ? 'warn' : 'log'](prefix, context);
  }
}

const logger = {
  debug: (ctx, msg, data) => _log(LOG_LEVELS.DEBUG, 'DEBUG', ctx, msg, data),
  info: (ctx, msg, data) => _log(LOG_LEVELS.INFO, 'INFO', ctx, msg, data),
  warn: (ctx, msg, data) => _log(LOG_LEVELS.WARN, 'WARN', ctx, msg, data),
  error: (ctx, msg, data) => _log(LOG_LEVELS.ERROR, 'ERROR', ctx, msg, data),
};

// ESM export so TypeScript services can import it
export { logger };
