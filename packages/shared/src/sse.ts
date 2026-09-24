/**
 * Minimal Server-Sent Events reader for `fetch` response bodies. Works in browsers, Node and
 * React Native (with `expo/fetch`, which exposes a streaming body).
 */
export interface SseMessage {
  event: string;
  data: string;
  id?: string;
}

export async function* readSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const abort = () => void reader.cancel().catch(() => {});
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = findBoundary(buffer);
      while (boundary) {
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        const message = parseBlock(block);
        if (message) yield message;
        boundary = findBoundary(buffer);
      }
    }
    buffer += decoder.decode();
    const last = parseBlock(buffer);
    if (last) yield last;
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

function findBoundary(buffer: string): { index: number; length: number } | null {
  const match = /\r?\n\r?\n/.exec(buffer);
  return match ? { index: match.index, length: match[0].length } : null;
}

function parseBlock(block: string): SseMessage | null {
  let event = "message";
  let id: string | undefined;
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    else if (field === "id") id = value;
  }
  return data.length ? { event, data: data.join("\n"), id } : null;
}
