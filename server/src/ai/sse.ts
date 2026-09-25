/**
 * Server-sent events, as the WHATWG HTML standard defines them (section 9.2.6, "Interpreting an
 * event stream"): how every AI provider streams its answer. Lines end in CRLF, LF or CR; a line
 * starting with ":" is a comment; "field: value" lines build an event; a blank line sends it. An
 * event left unfinished when the stream ends is dropped, as the standard says.
 *
 * `id` and `retry` are read past: we never reconnect to a stream, since a model's answer can't be
 * resumed from the middle.
 */

export interface ServerEvent {
  /** "message" when the stream doesn't name one. */
  event: string;
  data: string;
}

/** No single event may grow past this; a stream that tries is ended as broken. */
const MAX_EVENT_BYTES = 16 * 1024 * 1024;

export class StreamTooLarge extends Error {
  constructor() {
    super('An event in the stream is larger than allowed.');
    this.name = 'StreamTooLarge';
  }
}

export async function* readEvents(body: AsyncIterable<Uint8Array>): AsyncGenerator<ServerEvent> {
  const decoder = new TextDecoder('utf-8');
  let pending = '';
  let first = true;
  // A CR at the end of one chunk may be the first half of a CRLF split across two.
  let skipLf = false;
  let event = '';
  let data: string[] = [];
  let size = 0;

  function* line(text: string): Generator<ServerEvent> {
    if (text === '') {
      if (data.length > 0) yield { event: event || 'message', data: data.join('\n') };
      event = '';
      data = [];
      size = 0;
      return;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') {
      size += value.length;
      if (size > MAX_EVENT_BYTES) throw new StreamTooLarge();
      data.push(value);
    } else if (field === 'event') {
      event = value;
    }
  }

  function* take(text: string): Generator<ServerEvent> {
    let start = 0;
    // The LF of a CRLF whose CR ended the previous chunk.
    if (skipLf && text.charCodeAt(0) === 10) start = 1;
    skipLf = false;
    for (let i = start; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c !== 10 && c !== 13) continue;
      yield* line(pending + text.slice(start, i));
      pending = '';
      if (c === 13) {
        if (i + 1 === text.length) skipLf = true;
        else if (text.charCodeAt(i + 1) === 10) i++;
      }
      start = i + 1;
    }
    pending += text.slice(start);
    if (pending.length > MAX_EVENT_BYTES) throw new StreamTooLarge();
  }

  for await (const chunk of body) {
    let text = decoder.decode(chunk, { stream: true });
    if (first && text.length > 0) {
      first = false;
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    }
    if (text.length > 0) yield* take(text);
  }
  const rest = decoder.decode();
  if (rest) yield* take(rest);
}
