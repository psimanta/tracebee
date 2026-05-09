import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { configure, tool, trace } from "./index.js";

type CapturedSpan = {
  id: string;
  traceId: string;
  name: string;
  kind: "llm" | "tool";
  status: "ok" | "error";
  errorMessage?: string;
};

type CapturedPayload = {
  trace: { id: string; name: string; status: "ok" | "error" };
  spans: CapturedSpan[];
};

type Captured = { url: string; body: CapturedPayload };

const captured: Captured[] = [];
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  configure({ apiKey: "test-key", baseUrl: "http://test.local" });
});

beforeEach(() => {
  captured.length = 0;
  fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, init?: RequestInit) => {
      const body: CapturedPayload = init?.body
        ? JSON.parse(String(init.body))
        : null;
      captured.push({ url: String(url), body });
      return new Response("", { status: 202 });
    });
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("tool() outside trace()", () => {
  it("runs fn, returns its value, records nothing", async () => {
    const result = await tool("orphan", async () => "hello");
    expect(result).toBe("hello");
    expect(captured).toHaveLength(0);
  });
});

describe("trace() + tool()", () => {
  it("records a single tool span on the active trace", async () => {
    await trace("t1", async () => {
      await tool("fetch", async () => ({ ok: true }));
    });

    expect(captured).toHaveLength(1);
    const { body } = captured[0]!;
    expect(body.trace.name).toBe("t1");
    expect(body.trace.status).toBe("ok");
    expect(body.spans).toHaveLength(1);
    expect(body.spans[0]!.name).toBe("fetch");
    expect(body.spans[0]!.kind).toBe("tool");
    expect(body.spans[0]!.status).toBe("ok");
    expect(body.spans[0]!.traceId).toBe(body.trace.id);
  });

  it("records sequential tool calls in order with the same traceId", async () => {
    await trace("t-seq", async () => {
      await tool("a", async () => 1);
      await tool("b", async () => 2);
      await tool("c", async () => 3);
    });

    const { body } = captured[0]!;
    expect(body.spans.map((s) => s.name)).toEqual(["a", "b", "c"]);
    expect(new Set(body.spans.map((s) => s.traceId))).toEqual(
      new Set([body.trace.id]),
    );
  });
});

describe("AsyncLocalStorage propagation", () => {
  it("attaches across deep await chains", async () => {
    async function deep() {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      return tool("deep", async () => "ok");
    }

    await trace("t-deep", async () => {
      await deep();
    });

    const { body } = captured[0]!;
    expect(body.spans).toHaveLength(1);
    expect(body.spans[0]!.name).toBe("deep");
  });

  it("attaches both branches of Promise.all", async () => {
    await trace("t-parallel", async () => {
      await Promise.all([
        tool("left", async () => "L"),
        tool("right", async () => "R"),
      ]);
    });

    const { body } = captured[0]!;
    expect(body.spans).toHaveLength(2);
    expect(body.spans.map((s) => s.name).sort()).toEqual(["left", "right"]);
    expect(new Set(body.spans.map((s) => s.traceId))).toEqual(
      new Set([body.trace.id]),
    );
  });
});

describe("trace isolation", () => {
  it("sibling traces do not share spans", async () => {
    await trace("t-A", async () => {
      await tool("a-only", async () => 1);
    });
    await trace("t-B", async () => {
      await tool("b-only", async () => 2);
    });

    expect(captured).toHaveLength(2);
    const [a, b] = captured;
    expect(a!.body.spans.map((s) => s.name)).toEqual(["a-only"]);
    expect(b!.body.spans.map((s) => s.name)).toEqual(["b-only"]);
    expect(a!.body.trace.id).not.toBe(b!.body.trace.id);
  });
});

describe("error capture", () => {
  it("tool throws: span has error status, errorMessage set, error re-thrown", async () => {
    await expect(
      trace("t-tool-err", async () => {
        await tool("boom", async () => {
          throw new Error("kaboom");
        });
      }),
    ).rejects.toThrow("kaboom");

    const { body } = captured[0]!;
    expect(body.trace.status).toBe("error");
    expect(body.spans).toHaveLength(1);
    expect(body.spans[0]!.status).toBe("error");
    expect(body.spans[0]!.errorMessage).toBe("kaboom");
  });

  it("trace fn throws without tool: trace status flips to error, no spans", async () => {
    await expect(
      trace("t-trace-err", async () => {
        throw new Error("top-level");
      }),
    ).rejects.toThrow("top-level");

    const { body } = captured[0]!;
    expect(body.trace.status).toBe("error");
    expect(body.spans).toHaveLength(0);
  });
});
