import { getEnvValue } from "@/lib/env";

export function imageBackend() {
  const selfHosted = getEnvValue(["STUDIO_IMAGE_BACKEND"]) === "qwen";
  const cloudflare = !selfHosted && getEnvValue(["STUDIO_IMAGE_BACKEND"]) !== "magic-hour";
  const configured = getEnvValue(["STUDIO_MAGIC_HOUR_IMAGE_MODEL"]);
  const model = ["qwen-edit", "qwen-image-2.1"].includes(configured)
    ? configured
    : "flux-2-klein";
  return {
    selfHosted,
    cloudflare,
    model: cloudflare ? "flux-2-klein-4b" : model,
    referenceLimit: cloudflare ? 4 : selfHosted || model === "flux-2-klein" ? 6 : 3,
  };
}
