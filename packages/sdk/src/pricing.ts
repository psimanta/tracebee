type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
};

const PRICING: Record<string, ModelPricing> = {
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4-turbo": { inputPerMillion: 10.0, outputPerMillion: 30.0 },
  "gpt-3.5-turbo": { inputPerMillion: 0.5, outputPerMillion: 1.5 },
};

const PRICING_ENTRIES = Object.entries(PRICING).sort(
  ([a], [b]) => b.length - a.length,
);

function lookup(model: string): ModelPricing | undefined {
  if (PRICING[model]) return PRICING[model];
  for (const [base, pricing] of PRICING_ENTRIES) {
    if (model === base || model.startsWith(`${base}-`)) return pricing;
  }
  return undefined;
}

export function computeCost(
  model: string | undefined,
  promptTokens: number | undefined,
  completionTokens: number | undefined,
): string | null {
  if (!model || promptTokens === undefined || completionTokens === undefined) {
    return null;
  }
  const pricing = lookup(model);
  if (!pricing) return null;
  const cost =
    (promptTokens * pricing.inputPerMillion +
      completionTokens * pricing.outputPerMillion) /
    1_000_000;
  return cost.toFixed(10);
}
