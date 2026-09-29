// Every member of a gzip file, like Python's GzipFile. Current runtimes' DecompressionStream
// (Chromium, Node 24.21+) stops at the end of the first member and errors on what follows,
// so each member gets its own decompressor: when one fails, the member's trailer (CRC32 and
// length of what it produced) locates where the next member starts.

/** Input goes in at most this much at a time: Chromium drops output decoded from the same
 * write that runs into the next member, and 64 KiB keeps that loss at zero (measured). */
const SLICE = 65_536;
/** Input kept back to search for a trailer; a member's end is always in the last few writes. */
const KEEP = 4 * SLICE;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(crc: number, bytes: Uint8Array): number {
  let c = ~crc;
  for (let i = 0; i < bytes.length; i++)
    c = (CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  return ~c >>> 0;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

const u32 = (b: Uint8Array, at: number) =>
  ((b[at] ?? 0) | ((b[at + 1] ?? 0) << 8) | ((b[at + 2] ?? 0) << 16) | ((b[at + 3] ?? 0) << 24)) >>>
  0;

/**
 * What follows the member whose output had this CRC32 and length: the next member's bytes,
 * "end" for nothing or zero padding (Python ignores it), or null when no trailer matches
 * (a truncated or damaged file).
 */
function afterTrailer(
  tail: Uint8Array,
  crc: number,
  size: number,
): Uint8Array<ArrayBuffer> | "end" | null {
  for (let at = 0; at + 8 <= tail.length; at++) {
    if (u32(tail, at) !== crc || u32(tail, at + 4) !== size) continue;
    const rest = tail.subarray(at + 8);
    if (rest.every((b) => b === 0)) return "end";
    if (rest[0] === 0x1f && (rest.length < 2 || rest[1] === 0x8b)) return rest.slice();
  }
  return null;
}

/** Decompressed bytes of every member. Errors (after the good data) on a truncated or damaged file. */
export function gunzipAll(
  input: ReadableStream<Uint8Array<ArrayBuffer>>,
): ReadableStream<Uint8Array<ArrayBuffer>> {
  const source = input.getReader();
  const members = inflate(source);
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    async pull(controller) {
      const next = await members.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel(reason) {
      await members.return(undefined);
      await source.cancel(reason);
    },
  });
}

async function* inflate(
  source: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>,
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  let carry: Uint8Array<ArrayBuffer> | null = null;
  let sourceDone = false;
  for (;;) {
    const ds = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    const out = ds.readable.getReader();
    const recent: Uint8Array[] = [];
    let recentBytes = 0;
    const write = async (chunk: Uint8Array<ArrayBuffer>) => {
      for (let at = 0; at < chunk.length; at += SLICE) {
        const slice = chunk.subarray(at, at + SLICE);
        recent.push(slice);
        recentBytes += slice.length;
        while (recent.length > 1 && recentBytes - (recent[0]?.length ?? 0) >= KEEP) {
          recentBytes -= recent.shift()?.length ?? 0;
        }
        await writer.write(slice);
      }
    };
    const feeding = (async () => {
      if (carry !== null) await write(carry);
      carry = null;
      while (!sourceDone) {
        const r = await source.read();
        if (r.done) sourceDone = true;
        else await write(r.value);
      }
      await writer.close();
    })();
    feeding.catch(() => undefined); // a failure also errors `out`, handled below

    let crc = 0;
    let size = 0;
    let failure: unknown = null;
    for (;;) {
      let r: ReadableStreamReadResult<Uint8Array<ArrayBuffer>>;
      try {
        r = await out.read();
      } catch (err) {
        failure = err;
        break;
      }
      if (r.done) break;
      crc = crc32(crc, r.value);
      size = (size + r.value.length) >>> 0;
      yield r.value;
    }
    if (failure === null) return; // the input ended cleanly
    await feeding.catch(() => undefined); // every byte read so far is in `recent`
    const next = afterTrailer(concat(recent), crc, size);
    if (next === "end") {
      if (!sourceDone) await source.cancel();
      return;
    }
    if (next === null) throw failure;
    carry = next;
  }
}
