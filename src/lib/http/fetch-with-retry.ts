export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  init?: RequestInit;
  sleep?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
}

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const USER_AGENT = "DynastyDesk/0.1 (personal dynasty research tool)";
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function fetchWithRetry(url: string, options: RetryOptions = {}): Promise<Response> {
  const {
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 15_000,
    timeoutMs = 60_000,
    init,
    sleep = defaultSleep,
    fetchImpl = fetch,
  } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchImpl(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, ...init?.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return response;
      if (!RETRYABLE_STATUS.has(response.status) || attempt === retries) {
        throw new HttpError(url, response.status, `${response.status} ${response.statusText} for ${url}`);
      }
      await sleep(retryDelay(attempt, baseDelayMs, maxDelayMs, response.headers.get("retry-after")));
    } catch (error) {
      lastError = error;
      if (error instanceof HttpError || attempt === retries) throw error;
      await sleep(retryDelay(attempt, baseDelayMs, maxDelayMs, null));
    }
  }
  throw lastError;
}

export async function fetchJson<T>(url: string, options?: RetryOptions): Promise<T> {
  const response = await fetchWithRetry(url, options);
  return (await response.json()) as T;
}

export async function fetchText(url: string, options?: RetryOptions): Promise<string> {
  const response = await fetchWithRetry(url, options);
  return response.text();
}

function retryDelay(attempt: number, base: number, max: number, retryAfter: string | null) {
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(retryAfterSeconds)) return Math.min(retryAfterSeconds * 1000, max);
  const exponential = base * 2 ** attempt;
  return Math.min(exponential + Math.random() * base, max);
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
