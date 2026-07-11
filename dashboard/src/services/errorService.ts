import { pushToast } from '../hooks/useToast';

export interface ServiceErrorOptions {
  silent?: boolean;
  fallbackMessage?: string;
  context?: string;
}

/**
 * Standardized database and api service error handler.
 * Logs detailed trace to console and displays custom toast alert to the user.
 */
export const handleServiceError = (
  error: unknown,
  options: ServiceErrorOptions = {}
): never => {
  const message = error instanceof Error ? error.message : String(error);
  const contextPrefix = options.context ? `[${options.context}] ` : '';
  
  console.error(`${contextPrefix}Database operation failed:`, error);
  
  if (!options.silent) {
    pushToast({
      title: options.fallbackMessage || 'Database Error',
      description: message || 'An unexpected error occurred while communicating with the database.',
      tone: 'error'
    });
  }
  
  throw error;
};
