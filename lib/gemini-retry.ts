const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_SHORT_RATE_LIMIT_DELAY_MS = 3_000;

export class GeminiRequestError extends Error {
  readonly status?: number;

  constructor(
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "GeminiRequestError";
    this.status = status;
  }
}

type GeminiRequestFactory = (signal: AbortSignal) => Promise<Response>;

export type GeminiRetryOptions = {
  random?: () => number;
  request: GeminiRequestFactory;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
};

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterMilliseconds(response: Response) {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1_000);
}

async function isClearlyTemporaryRateLimit(response: Response) {
  const delay = retryAfterMilliseconds(response);
  if (delay === null || delay > MAX_SHORT_RATE_LIMIT_DELAY_MS) return false;
  const body = (await response.clone().text()).toLowerCase();
  return !/daily|per day|quota exceeded|resource exhausted|limit reached/.test(body);
}

async function shouldRetry(response: Response) {
  if ([502, 503, 504].includes(response.status)) return true;
  return response.status === 429 && isClearlyTemporaryRateLimit(response);
}

function retryDelay(response: Response, random: () => number) {
  const requestedDelay = response.status === 429 ? retryAfterMilliseconds(response) : null;
  if (requestedDelay !== null) return requestedDelay;
  // Small jitter prevents synchronized retries without burning free-tier RPM.
  return 350 + Math.round(Math.max(0, Math.min(1, random())) * 350);
}

/**
 * Makes at most one safe retry after an unambiguously failed Gemini HTTP
 * response. It deliberately does not retry fetch/network failures because a
 * request may have reached the provider even when the response was lost.
 */
export async function fetchGeminiWithRetry(options: GeminiRetryOptions): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const wait = options.sleep ?? sleep;
  const random = options.random ?? Math.random;

  try {
    let response: Response;
    try {
      response = await options.request(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw new GeminiRequestError("Gemini is taking too long to respond. Please try again later.");
      throw error;
    }

    if (!await shouldRetry(response)) return response;
    await wait(retryDelay(response, random));

    try {
      return await options.request(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw new GeminiRequestError("Gemini is taking too long to respond. Please try again later.");
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
}

/** Creates a safe user-facing error without exposing provider internals. */
export async function toGeminiRequestError(response: Response, operation = "request") {
  const body = (await response.text()).toLowerCase();
  if ([502, 503, 504].includes(response.status)) {
    return new GeminiRequestError("Gemini is temporarily unavailable due to high demand. Please try again later.", response.status);
  }
  if (response.status === 429) {
    const quotaExhausted = /daily|per day|quota exceeded|resource exhausted|limit reached/.test(body);
    return new GeminiRequestError(
      quotaExhausted
        ? "Gemini's available quota has been reached. Please try again later."
        : "Gemini is temporarily rate-limited. Please wait a moment and try again.",
      response.status,
    );
  }
  return new GeminiRequestError(`Gemini ${operation} failed (${response.status}).`, response.status);
}
