export type Config = {
  apiKey: string;
  baseUrl: string;
};

let explicit: Partial<Config> = {};
let warned = false;

export function configure(c: Partial<Config>): void {
  explicit = { ...explicit, ...c };
}

export function getConfig(): Config | null {
  const apiKey = explicit.apiKey ?? process.env.TRACEBEE_API_KEY;
  const baseUrl = explicit.baseUrl ?? process.env.TRACEBEE_BASE_URL;
  if (!apiKey || !baseUrl) return null;
  return { apiKey, baseUrl };
}

export function warnNotConfigured(): void {
  if (warned) return;
  warned = true;
  console.warn(
    "[tracebee] not configured: set TRACEBEE_API_KEY and TRACEBEE_BASE_URL or call configure(). Tracing is disabled.",
  );
}
