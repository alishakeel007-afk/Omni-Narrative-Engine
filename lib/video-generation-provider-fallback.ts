export type VideoGenerationProvider = "groq" | "gemini";

export type ProviderAttempt<T> = () => Promise<T>;

export class VideoGenerationProviderError extends Error {
  readonly attemptedProviders: VideoGenerationProvider[];
  readonly configurationError: boolean;

  constructor(options: {
    attemptedProviders: VideoGenerationProvider[];
    configurationError?: boolean;
  }) {
    super(
      options.configurationError
        ? "Story generation is unavailable because no AI provider is configured."
        : "Story generation is temporarily unavailable. Please try again later."
    );
    this.name = "VideoGenerationProviderError";
    this.attemptedProviders = options.attemptedProviders;
    this.configurationError = Boolean(options.configurationError);
  }
}

/**
 * Runs Groq first, then makes one Gemini attempt only when Groq is unavailable
 * or its response cannot be used. Individual provider functions are
 * responsible for their own bounded request timeout and response validation.
 */
export async function generateWithGroqPrimary<T>(options: {
  gemini?: ProviderAttempt<T>;
  groq?: ProviderAttempt<T>;
}): Promise<T> {
  const attemptedProviders: VideoGenerationProvider[] = [];

  if (options.groq) {
    attemptedProviders.push("groq");
    try {
      return await options.groq();
    } catch {
      // A malformed, unavailable, rate-limited, or timed-out Groq response is
      // deliberately not exposed to the client. Gemini gets exactly one turn.
    }
  }

  if (options.gemini) {
    attemptedProviders.push("gemini");
    try {
      return await options.gemini();
    } catch {
      // Return a safe aggregate error instead of provider internals.
    }
  }

  throw new VideoGenerationProviderError({
    attemptedProviders,
    configurationError: attemptedProviders.length === 0,
  });
}
