// Shared error path for domain services: log + user-facing toast.
// (Replaces the classic shared/utils/errorHandler.js handleServiceError.)
import { logger } from '@shared/utils/logger.ts';
import { showToast } from '@shared/components/toast.ts';
import { explainTransitionError } from '@shared/documents/docTransitions.ts';

export function handleServiceError(context: string, error: { message?: string } | null) {
  if (!error) return null;
  const raw = error.message || String(error);
  logger.error(context, raw, error);

  // A refused status change is not a fault the user can refresh away — it means
  // the document has to take a step it has not taken yet. Say which.
  const transition = explainTransitionError(raw);
  const userMessage = transition ?? `Something went wrong: ${raw || 'Unknown error'}. Try refreshing.`;

  showToast(userMessage);
  return { error, userMessage };
}
