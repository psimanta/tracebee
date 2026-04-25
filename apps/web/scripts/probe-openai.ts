import { loadEnvConfig } from "@next/env";
import OpenAI from "openai";

loadEnvConfig(process.cwd());

const client = new OpenAI();
const MODEL = "gpt-4o-mini";

async function probeBasic() {
  console.log("\n--- Probe 1: basic call ---");
  const t0 = Date.now();
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: "Say hello in five words." }],
  });
  console.log("response.model:", res.model);
  console.log("text:", res.choices[0].message.content);
  console.log("usage:", res.usage);
  console.log("elapsed_ms:", Date.now() - t0);
}

async function probeSystem() {
  console.log("\n--- Probe 2: system message ---");
  const t0 = Date.now();
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "You are terse. Reply in 5 words or fewer." },
      { role: "user", content: "What is the capital of France?" },
    ],
  });
  console.log("text:", res.choices[0].message.content);
  console.log("usage:", res.usage);
  console.log("elapsed_ms:", Date.now() - t0);
}

async function probeStream() {
  console.log("\n--- Probe 3: streaming ---");
  const t0 = Date.now();
  let firstByteAt: number | null = null;
  let chunkCount = 0;
  let lastChunk: OpenAI.Chat.Completions.ChatCompletionChunk | null = null;
  let assembled = "";

  const stream = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: "Count from 1 to 5." }],
    stream: true,
    stream_options: { include_usage: true },
  });

  for await (const chunk of stream) {
    chunkCount++;
    if (firstByteAt === null) firstByteAt = Date.now();
    assembled += chunk.choices[0]?.delta?.content ?? "";
    lastChunk = chunk;
  }

  console.log("assembled:", assembled);
  console.log("chunks:", chunkCount);
  console.log("first_byte_ms:", firstByteAt! - t0);
  console.log("total_ms:", Date.now() - t0);
  console.log("usage (from final chunk):", lastChunk?.usage);
}

async function main() {
  await probeBasic();
  await probeSystem();
  await probeStream();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
