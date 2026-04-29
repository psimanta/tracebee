import OpenAI from "openai";
import { configure, observeOpenAI, tool, trace } from "../dist/index.js";

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required");
  process.exit(1);
}
if (!process.env.TRACEBEE_API_KEY) {
  console.error("TRACEBEE_API_KEY is required");
  process.exit(1);
}

configure({
  apiKey: process.env.TRACEBEE_API_KEY,
  baseUrl: process.env.TRACEBEE_BASE_URL ?? "http://localhost:3000",
});

const openai = observeOpenAI(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

const reply = await trace("smoke-real", async () => {
  const lookup = await tool("lookup-something", async () => {
    await new Promise((r) => setTimeout(r, 20));
    return { topic: "ping-pong" };
  });

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `Topic is ${JSON.stringify(lookup)}. Reply with one word: pong`,
      },
    ],
  });

  return res.choices[0].message.content;
});

console.log("openai replied:", reply);
console.log("waiting 1s for drain...");
await new Promise((r) => setTimeout(r, 1000));
