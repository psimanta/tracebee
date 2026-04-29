import { configure, observeOpenAI, tool, trace } from "../dist/index.js";

if (!process.env.TRACEBEE_API_KEY) {
  console.error("TRACEBEE_API_KEY is required");
  process.exit(1);
}

configure({
  apiKey: process.env.TRACEBEE_API_KEY,
  baseUrl: process.env.TRACEBEE_BASE_URL ?? "http://localhost:3000",
});

const ITERATIONS = Number(process.env.ITERATIONS ?? 15);

const fakeOpenAI = {
  chat: {
    completions: {
      async create(params) {
        const ms = 5 + Math.floor(Math.random() * 75);
        await new Promise((r) => setTimeout(r, ms));
        const promptTokens = 50 + Math.floor(Math.random() * 200);
        const completionTokens = 10 + Math.floor(Math.random() * 50);
        return {
          id: `chatcmpl-${Math.random().toString(36).slice(2, 8)}`,
          model: params.model,
          choices: [
            { index: 0, message: { role: "assistant", content: "ok" } },
          ],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          },
        };
      },
    },
  },
};

const client = observeOpenAI(fakeOpenAI);

await trace("long-trace-demo", async () => {
  await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "plan the work" }],
  });

  for (let i = 0; i < ITERATIONS; i++) {
    await tool(`fetch-source-${i}`, async () => {
      const ms =
        Math.random() < 0.3
          ? 1 + Math.floor(Math.random() * 4)
          : 20 + Math.floor(Math.random() * 30);
      await new Promise((r) => setTimeout(r, ms));
      return { source: `source-${i}`, length: 1000 + i };
    });

    await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: `summarize source ${i}` }],
    });
  }

  try {
    await tool("write-to-disk", async () => {
      await new Promise((r) => setTimeout(r, 10));
      throw new Error("ENOSPC: no space left on device");
    });
  } catch {
    // expected — surface as a failed span, keep the trace going
  }

  const final = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "synthesize the findings" }],
  });

  await tool("deliver-result", async () => {
    await new Promise((r) => setTimeout(r, 15));
    return { delivered: true };
  });

  return final.choices[0].message.content;
});

const totalSpans = 1 + ITERATIONS * 2 + 1 + 1 + 1;
console.log(`generated trace with ${totalSpans} spans`);
console.log("waiting 2s for drain...");
await new Promise((r) => setTimeout(r, 2000));
