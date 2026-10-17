// @ts-expect-error Node's native TypeScript runner requires source extensions.
import { VideoGenerationProviderError, generateWithGroqPrimary } from "../lib/video-generation-provider-fallback.ts";

async function rejects(message: string): Promise<never> {
  throw new Error(message);
}

async function run() {
  let groqCalls = 0;
  let geminiCalls = 0;
  const groqResult = await generateWithGroqPrimary({
    groq: async () => { groqCalls += 1; return "groq-story"; },
    gemini: async () => { geminiCalls += 1; return "gemini-story"; },
  });
  if (groqResult !== "groq-story" || groqCalls !== 1 || geminiCalls !== 0) {
    throw new Error("Groq success must not invoke Gemini.");
  }

  for (const failure of ["timeout", "rate limit", "invalid JSON", "Urdu script validation failed"]) {
    groqCalls = 0;
    geminiCalls = 0;
    const result = await generateWithGroqPrimary({
      groq: async () => { groqCalls += 1; return rejects(failure); },
      gemini: async () => { geminiCalls += 1; return "gemini-story"; },
    });
    if (result !== "gemini-story" || groqCalls !== 1 || geminiCalls !== 1) {
      throw new Error(`Groq ${failure} must make one Gemini fallback attempt.`);
    }
  }

  const geminiOnly = await generateWithGroqPrimary({ gemini: async () => "gemini-story" });
  if (geminiOnly !== "gemini-story") throw new Error("Gemini must remain available when Groq is unconfigured.");

  try {
    await generateWithGroqPrimary({
      groq: async () => rejects("provider failure"),
      gemini: async () => rejects("provider failure"),
    });
    throw new Error("Both provider failures must reject.");
  } catch (error) {
    if (!(error instanceof VideoGenerationProviderError) || error.configurationError || error.attemptedProviders.join(",") !== "groq,gemini") {
      throw new Error("Both provider failures must produce a sanitized aggregate error.");
    }
  }

  try {
    await generateWithGroqPrimary({});
    throw new Error("Missing provider configuration must reject.");
  } catch (error) {
    if (!(error instanceof VideoGenerationProviderError) || !error.configurationError) {
      throw new Error("Missing configuration must be identifiable without provider internals.");
    }
  }
}

await run();
console.log("Video generation provider fallback tests passed.");
