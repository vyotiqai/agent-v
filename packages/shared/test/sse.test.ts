import { describe, expect, it } from "vitest";
import { readSse } from "../src/sse.ts";

function streamOf(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("readSse", () => {
  it("parses events split across chunks", async () => {
    const out = [];
    for await (const message of readSse(
      streamOf(['data: {"a":', "1}\n\nevent: ping\nda", "ta: x\r\n\r\n: comment\n\ndata: tail"]),
    ))
      out.push(message);
    expect(out).toEqual([
      { event: "message", data: '{"a":1}', id: undefined },
      { event: "ping", data: "x", id: undefined },
      { event: "message", data: "tail", id: undefined },
    ]);
  });

  it("joins multi-line data", async () => {
    const out = [];
    for await (const message of readSse(streamOf(["id: 7\ndata: one\ndata: two\n\n"])))
      out.push(message);
    expect(out).toEqual([{ event: "message", data: "one\ntwo", id: "7" }]);
  });
});
