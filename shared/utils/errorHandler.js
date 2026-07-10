function handleServiceError(context, error) {
  if (!error) return null;
  logger.error(context, error.message || error, error);
  if (toast) toast(`Something went wrong: ${error.message || 'Unknown error'}. Try refreshing.`);
  return { error, userMessage: error.message || 'Something went wrong.' };
}

function handleAuthError(error) {
  if (!error) return null;
  const messages = {
    'Invalid login credentials': 'Invalid email or password.',
    'Email not confirmed': 'Please confirm your email address before signing in.',
    'Rate limit exceeded': 'Too many attempts. Please try again later.',
  };
  const userMsg = messages[error.message] || error.message || 'Authentication failed.';
  logger.error('auth', error.message || error, error);
  return userMsg;
}

async function safeAsync(fn, context) {
  try {
    return await fn();
  } catch (err) {
    handleServiceError(context, err);
    return { error: err };
  }
}
