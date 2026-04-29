import { configure, observeOpenAI, tool, trace } from "../dist/index.js";

configure({
  apiKey: process.env.TRACEBEE_API_KEY,
  baseUrl: process.env.TRACEBEE_BASE_URL ?? "http://localhost:3000",
});

const fakeOpenAI = {
  chat: {
    completions: {
      async create(params) {
        await new Promise((r) => setTimeout(r, 30));
        return {
          id: "chatcmpl-fake",
          model: params.model,
          choices: [
            { index: 0, message: { role: "assistant", content: "hello!" } },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        };
      },
    },
  },
};

const client = observeOpenAI(fakeOpenAI);

const result = await trace("smoke-with-llm", async () => {
  const weather = await tool("fetch-weather", async () => {
    await new Promise((r) => setTimeout(r, 20));
    return { city: "Bangalore", tempC: 28 };
  });

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "user", content: `Weather is ${JSON.stringify(weather)}` },
    ],
  });
  return res.choices[0].message.content;
});

console.log("trace returned:", result);
console.log("waiting 1s for drain...");
await new Promise((r) => setTimeout(r, 1000));
