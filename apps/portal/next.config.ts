import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

/**
 * Load the monorepo-root `.env` so a single file configures both apps.
 * Existing process.env values always win (CI, Docker, shell exports).
 */
function loadRootEnv(): void {
  const candidates = [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match || line.trim().startsWith("#")) continue;
      const key = match[1] as string;
      const value = (match[2] as string).replace(/^["']|["']$/g, "").trim();
      if (process.env[key] === undefined) process.env[key] = value;
    }
    return;
  }
}

loadRootEnv();

const nextConfig: NextConfig = {
  transpilePackages: ["@aegiscore/core"],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
