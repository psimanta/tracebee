import { configure, trace } from "../dist/index.js";

configure({
  apiKey: process.env.TRACEBEE_API_KEY,
  baseUrl: process.env.TRACEBEE_BASE_URL ?? "http://localhost:3000",
});

const result = await trace("smoke-run", async () => {
  await new Promise((r) => setTimeout(r, 50));
  return 42;
});

console.log("trace() returned:", result);
console.log("waiting 1s for in-flight POST to drain...");
await new Promise((r) => setTimeout(r, 1000));
