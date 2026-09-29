// Streamed parse for files: works in a browser Web Worker and in Node.
// file.stream() -> [gunzipAll (every member) when the magic bytes say so]
//   -> TextDecoderStream (BOM kept) -> LineSplitter -> LogSession.
import { gunzipAll } from "./gunzip.js";
import { LineSplitter, LogSession, type ParseOptions, type ParseResult } from "./session.js";

export interface StreamOptions extends ParseOptions {
  /** Input bytes read so far (compressed bytes for gzip). Called every progressEvery bytes and at the end. */
  onProgress?: ((bytesRead: number) => void) | undefined;
  signal?: AbortSignal | undefined;
  progressEvery?: number | undefined;
}

function concat(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export async function parseLogStream(
  source: ReadableStream<Uint8Array>,
  options: StreamOptions = {},
): Promise<ParseResult> {
  options.signal?.throwIfAborted();
  const session = new LogSession(options);
  const splitter = new LineSplitter();
  const emit = (line: string) => session.consume(line);
  const every = options.progressEvery ?? 1_048_576;
  const reader = source.getReader();

  // Peek at the first two bytes for the gzip magic.
  const head: Uint8Array[] = [];
  let headLength = 0;
  let sourceDone = false;
  while (headLength < 2 && !sourceDone) {
    const r = await reader.read();
    if (r.done) sourceDone = true;
    else {
      head.push(r.value);
      headLength += r.value.length;
    }
  }
  const first = concat(head);
  const gzip = first.length >= 2 && first[0] === 0x1f && first[1] === 0x8b;

  let bytesRead = first.length;
  let lastReport = 0;
  const counted = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      if (first.length > 0) controller.enqueue(first);
      if (sourceDone) controller.close();
    },
    async pull(controller) {
      const r = await reader.read();
      if (r.done) {
        controller.close();
        return;
      }
      bytesRead += r.value.length;
      if (bytesRead - lastReport >= every) {
        lastReport = bytesRead;
        options.onProgress?.(bytesRead);
      }
      controller.enqueue(r.value as Uint8Array<ArrayBuffer>); // stream chunks are never shared memory
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  const bytes = gzip ? gunzipAll(counted) : counted;
  const text = bytes.pipeThrough(new TextDecoderStream("utf-8", { ignoreBOM: true })).getReader();
  try {
    for (;;) {
      options.signal?.throwIfAborted();
      let chunk: ReadableStreamReadResult<string>;
      try {
        chunk = await text.read();
      } catch (err) {
        if (!gzip) throw err;
        session.truncated = true; // like Python: keep complete lines, drop the partial one
        break;
      }
      if (chunk.done) {
        splitter.end(emit);
        break;
      }
      splitter.push(chunk.value, emit);
    }
  } catch (err) {
    await text.cancel().catch(() => undefined);
    throw err;
  }
  options.onProgress?.(bytesRead);
  return session.result();
}
