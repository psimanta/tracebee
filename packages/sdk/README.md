# @tracebee/sdk

TypeScript SDK for [Tracebee](https://github.com/psimanta/tracebee) —
observability for LLM agents. Wrap your OpenAI client and your tool calls,
and every LLM call and tool execution shows up as a span in the Tracebee
dashboard, grouped into traces.

> **Status:** `v0.1.x` — early. The API may change before `1.0`. Pin an
> exact version in production.

## Install

```sh
npm install @tracebee/sdk
# or: pnpm add @tracebee/sdk
```

Requires Node 20+.

## Quickstart

```ts
import OpenAI from "openai";
import { configure, observeOpenAI, trace, tool } from "@tracebee/sdk";

configure({
  apiKey: process.env.TRACEBEE_API_KEY!,
  baseUrl: "https://your-tracebee-instance.example.com",
});

const openai = observeOpenAI(new OpenAI());

await trace("answer-question", async () => {
  const docs = await tool("fetch-docs", async () => {
    return await fetchRelevantDocs();
  });

  return await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: `Using ${docs}, answer...` }],
  });
});
```

## Docs

Full README, API reference, and architecture notes land in `v0.1.x`. For
now see the
[repository](https://github.com/psimanta/tracebee/tree/main/packages/sdk).

## License

MIT — see [LICENSE](./LICENSE).
