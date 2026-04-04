export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  onRetry?: (attempt: number, error: unknown) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: Partial<RetryOptions> = {}
): Promise<T> {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt > options.maxRetries) break;

      const delay = Math.min(
        options.baseDelayMs * Math.pow(2, attempt - 1),
        options.maxDelayMs
      );

      if (options.onRetry) {
        options.onRetry(attempt, err);
      } else {
        console.warn(`[Retry] Attempt ${attempt}/${options.maxRetries} failed, retrying in ${delay}ms...`);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
