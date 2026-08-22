import { readFileSync } from "fs";
import { join } from "path";

type EnvMap = Record<string, string>;

function loadLooseEnvFile(filename: string): EnvMap {
  try {
    const content = readFileSync(join(process.cwd(), filename), "utf8");
    return content.split(/\r?\n/).reduce<EnvMap>((accumulator, line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        return accumulator;
      }

      const [rawKey, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
      accumulator[rawKey.trim().toLowerCase()] = value;
      return accumulator;
    }, {});
  } catch {
    return {};
  }
}

const looseEnv = {
  ...loadLooseEnvFile(".env.example"),
  ...loadLooseEnvFile(".env"),
  ...loadLooseEnvFile(".env.local")
};

export function getEnvValue(names: string[]): string {
  for (const name of names) {
    const runtimeValue = process.env[name];

    if (runtimeValue) {
      return runtimeValue;
    }

    const looseValue = looseEnv[name.toLowerCase()];

    if (looseValue) {
      return looseValue;
    }
  }

  return "";
}
