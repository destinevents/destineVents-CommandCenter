// Shared error path for domain services: log + user-facing toast.
// (Replaces the classic shared/utils/errorHandler.js handleServiceError.)
import { logger } from '../utils/logger.ts';
import { showToast } from '../components/toast.ts';

export function handleServiceError(context: string, error: { message?: string } | null) {
  if (!error) return null;
  logger.error(context, error.message || String(error), error);
  showToast(`Something went wrong: ${error.message || 'Unknown error'}. Try refreshing.`);
  return { error, userMessage: error.message || 'Something went wrong.' };
}
