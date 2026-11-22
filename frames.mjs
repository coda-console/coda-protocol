// Frame streams: ndjson, one JSON object a line, every line ended by `\n`; a blank line is a heartbeat. Web standards only
// (streams, TextEncoder, TextDecoder), so the same two functions run in Node and in a page.
const MAX_BYTES = 1024 * 1024, NEWLINE = 0x0a;
// The whitespace JSON knows, beside the newline itself.
const isBlank = byte => byte === 0x20 || byte === 0x09 || byte === 0x0d;

// `code`: truncated (the stream ended inside a line), too_large (a line over `maxBytes`), invalid (not a JSON object).
export class FrameError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FrameError';
    this.code = code;
  }
}

// The frames of a ReadableStream<Uint8Array>, one by one. Heartbeats are skipped and not counted. Lines are cut before they are
// decoded (no byte of a multi-byte character is a newline), so how the bytes are chunked makes no difference.
export function readFrames(stream, { maxBytes = MAX_BYTES } = {}) {
  const reader = stream.getReader(), decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  // The line being received, its first `size` bytes.
  let line = new Uint8Array(1024), size = 0, count = 0, ended = false;
  const error = (code, problem) => new FrameError(code, `第 ${count + 1} 帧：${problem}`);

  function append(bytes) {
    const needed = size + bytes.length;
    if (needed > maxBytes) throw error('too_large', `一行超过 ${maxBytes} 字节`);
    if (needed > line.length) {
      const grown = new Uint8Array(Math.max(needed, line.length * 2));
      grown.set(line.subarray(0, size));
      line = grown;
    }
    line.set(bytes, size);
    size = needed;
  }

  function parse(bytes) {
    let frame;
    try {
      frame = JSON.parse(decoder.decode(bytes));
    } catch {
      throw error('invalid', '不是合法的 JSON');
    }
    if (frame === null || typeof frame !== 'object' || Array.isArray(frame)) throw error('invalid', '不是 JSON 对象');
    return frame;
  }

  // The source is told to stop and the stream let go of; nothing waits for the source to have stopped.
  function close(reason) {
    reader.cancel(reason).catch(() => {});
    reader.releaseLock();
  }

  async function* read() {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        let from = 0;
        for (let to; (to = value.indexOf(NEWLINE, from)) !== -1; from = to + 1) {
          append(value.subarray(from, to));
          const bytes = line.subarray(0, size);
          size = 0;
          if (bytes.every(isBlank)) continue;
          const frame = parse(bytes);
          count++;
          yield frame;
        }
        append(value.subarray(from));
      }
      if (!line.subarray(0, size).every(isBlank)) throw error('truncated', '流在这一行收尾之前结束，被截断');
    } catch (problem) {
      close(problem);
      throw problem;
    }
    close();
  }

  const frames = read();
  return {
    // One still waiting when `return` is called ends as well: no frame, and the line cut off is no error.
    async next() {
      try {
        const step = await frames.next();
        if (!ended) return step;
      } catch (problem) {
        if (!ended) throw problem;
      }
      return { done: true, value: undefined };
    },
    async return(value) {
      ended = true;
      close();
      return { done: true, value };
    },
    [Symbol.asyncIterator]() { return this; },
  };
}

// Also an object of another realm, and one without a prototype; not an array, nor an instance of a class.
function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

// A ReadableStream<Uint8Array> of the (async or sync) iterable's objects. With `heartbeatMs`, a blank line is written when
// nothing has been for that long, unless what was written is still unread: then it looks again after as long.
export function writeFrames(iterable, { heartbeatMs, timers = globalThis } = {}) {
  const iterator = iterable[Symbol.asyncIterator]?.() ?? iterable[Symbol.iterator]();
  const encoder = new TextEncoder();
  let timer, open = true, count = 0;

  function encode(value) {
    if (!isPlainObject(value)) throw new FrameError('invalid', `第 ${count + 1} 帧：不是普通对象`);
    const line = JSON.stringify(value);
    // What a `toJSON` gives in its place need not be an object.
    if (!line?.startsWith('{')) throw new FrameError('invalid', `第 ${count + 1} 帧：写出来不是 JSON 对象`);
    return encoder.encode(`${line}\n`);
  }
  function rest(controller) {
    if (heartbeatMs === undefined) return;
    timers.clearTimeout(timer);
    timer = timers.setTimeout(() => {
      if (controller.desiredSize > 0) controller.enqueue(encoder.encode('\n'));
      rest(controller);
    }, heartbeatMs);
  }
  function stop() {
    open = false;
    timers.clearTimeout(timer);
  }
  // The rest of the iterable is given up without waiting for it.
  function abandon() {
    stop();
    (async () => iterator.return?.())().catch(() => {});
  }

  return new ReadableStream({
    start: rest,
    async pull(controller) {
      let step;
      try {
        step = await iterator.next();
      } catch (problem) {
        stop();
        throw problem;
      }
      if (!open) return;
      if (step.done) {
        stop();
        controller.close();
        return;
      }
      try {
        controller.enqueue(encode(step.value));
      } catch (problem) {
        abandon();
        throw problem;
      }
      count++;
      rest(controller);
    },
    cancel: abandon,
  });
}
