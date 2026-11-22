// The frame reader and writer: every way to cut the bytes, every refusal, and heartbeats by a clock the test moves.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspect } from 'node:util';
import { FrameError, readFrames, writeFrames } from '../frames.mjs';

const encoder = new TextEncoder(), decoder = new TextDecoder();
const bytes = text => encoder.encode(text);
const streamOf = chunks => new ReadableStream({
  start(controller) {
    for (const chunk of chunks) controller.enqueue(chunk);
    controller.close();
  },
});
// What reading gives: the frames before it ended, and what it ended with.
async function outcome(chunks, options) {
  const frames = [];
  try {
    for await (const frame of readFrames(streamOf(chunks), options)) frames.push(frame);
  } catch (error) {
    assert.ok(error instanceof FrameError, String(error));
    return { frames, code: error.code, message: error.message };
  }
  return { frames };
}
// Settled within a turn of the event loop, or an error: what must not wait is not waited for.
const soon = promise => Promise.race([promise, new Promise((_, reject) => setImmediate(reject, new Error('still waiting')))]);
const twoWays = all => Array.from({ length: all.length + 1 }, (_, at) => [all.subarray(0, at), all.subarray(at)]);
const byByte = all => Array.from(all, byte => Uint8Array.of(byte));
function* threeWays(all) {
  for (let a = 0; a <= all.length; a++) for (let b = a; b <= all.length; b++) yield [all.subarray(0, a), all.subarray(a, b), all.subarray(b)];
}
// Every cut in two, byte by byte and whole.
async function everyCut(text, expected, options) {
  const all = typeof text === 'string' ? bytes(text) : text;
  for (const chunks of [[all], byByte(all), ...twoWays(all)])
    assert.deepEqual(await outcome(chunks, options), expected, `chunks of ${chunks.map(chunk => chunk.length).slice(0, 3)}`);
}

const sequence = [
  { text: '你好，世界', version: 1 },
  { text: '👩‍👩‍👧 é 𝒳', version: 2, steps: [{ text: '你', delayMs: 0 }, { text: '你好 👋', delayMs: 180 }] },
  {},
  { nested: { list: [1, [2, { deep: null }], '换\n行'], on: true } },
  { text: '长 long 🙂 '.repeat(300) },
];

test('frames read the same however the bytes are cut', async () => {
  const [one, two, three, four, five] = sequence.map(frame => JSON.stringify(frame));
  const text = `\n${one}\n\n \t\r\n${two}\n${three}\n\n\n  ${four} \r\n${five}\n\n`;
  assert.ok(bytes(five).length > 4096);
  await everyCut(text, { frames: sequence });
});

test('a short sequence reads the same cut in three anywhere', async () => {
  const all = bytes('\n{"a":"中"}\n \n{"b":{"c":"🙂"}}\n\n');
  let cuts = 0;
  for (const chunks of threeWays(all)) {
    assert.deepEqual(await outcome(chunks), { frames: [{ a: '中' }, { b: { c: '🙂' } }] }, String(chunks.map(chunk => chunk.length)));
    cuts++;
  }
  assert.equal(cuts, (all.length + 1) * (all.length + 2) / 2);
});

test('a stream of heartbeats only, and an empty one, have no frames', async () => {
  for (const text of ['', '\n', '\n\n\n', ' \t\r\n', '  ']) await everyCut(text, { frames: [] });
});

test('a stream that ends inside a line is truncated, after the frames before it', async () => {
  for (const tail of ['{"b":"中', '{"b":2}', '{', '  {"b":2} '])
    await everyCut(`{"a":1}\n\n${tail}`, { frames: [{ a: 1 }], code: 'truncated', message: '第 2 帧：流在这一行收尾之前结束，被截断' });
  await everyCut('{}', { frames: [], code: 'truncated', message: '第 1 帧：流在这一行收尾之前结束，被截断' });
  // cut inside a character
  await everyCut(bytes('{"a":1}\n{"b":"中').subarray(0, -1), { frames: [{ a: 1 }], code: 'truncated', message: '第 2 帧：流在这一行收尾之前结束，被截断' });
});

test('a line that is no JSON is invalid', async () => {
  for (const line of ['{"b":', 'nope', '{}{}', '{"a":1},', "{'a':1}", '{"a":\u00a01}', '\u00a0', '\ufeff{}'])
    await everyCut(`{"a":1}\n\n${line}\n{"c":3}\n`, { frames: [{ a: 1 }], code: 'invalid', message: '第 2 帧：不是合法的 JSON' });
  // bytes that are no UTF-8
  await everyCut(Uint8Array.of(...bytes('{"a":"'), 0xe4, 0xb8, ...bytes('"}\n')), { frames: [], code: 'invalid', message: '第 1 帧：不是合法的 JSON' });
});

test('a line that is JSON but no object is invalid', async () => {
  for (const line of ['[]', '[{"a":1}]', '1', '"text"', 'null', 'true'])
    await everyCut(`{"a":1}\n${line}\n{"c":3}\n`, { frames: [{ a: 1 }], code: 'invalid', message: '第 2 帧：不是 JSON 对象' });
});

test('a line over maxBytes is too large, counted in bytes without its newline', async () => {
  const fits = '{"a":"中中"}';
  assert.equal(bytes(fits).length, 14);
  await everyCut(`${fits}\n${fits}\n`, { frames: [{ a: '中中' }, { a: '中中' }] }, { maxBytes: 14 });
  const tooLarge = { frames: [{ a: '中中' }], code: 'too_large', message: '第 2 帧：一行超过 14 字节' };
  for (const line of ['{"a":"中中1"}', ' '.repeat(15)]) for (const end of ['\n{"c":3}\n', ''])
    await everyCut(`${fits}\n${line}${end}`, tooLarge, { maxBytes: 14 });
  const mebibyte = 1024 * 1024, line = length => bytes(`{"a":"${'x'.repeat(length - 8)}"}\n`);
  assert.equal((await outcome([line(mebibyte)])).frames.length, 1);
  assert.equal((await outcome([line(mebibyte + 1)])).code, 'too_large');
});

test('a line that never ends is refused once it is over maxBytes, and its source canceled', async () => {
  let pulled = 0, canceled = 0;
  const endless = new ReadableStream({
    pull(controller) { pulled++; controller.enqueue(new Uint8Array(10).fill(0x20)); },
    cancel() { canceled++; },
  }, { highWaterMark: 0 });
  await assert.rejects(readFrames(endless, { maxBytes: 95 }).next(), { code: 'too_large', name: 'FrameError' });
  assert.equal(pulled, 10);
  assert.equal(canceled, 1);
});

test('reading that ends early or fails cancels the source', async () => {
  const source = text => {
    const seen = { canceled: 0 };
    seen.stream = new ReadableStream({ start(controller) { controller.enqueue(bytes(text)); }, cancel() { seen.canceled++; } });
    return seen;
  };
  const broken = source('{"a":1}\n{"a":2}\n');
  for await (const frame of readFrames(broken.stream)) { assert.deepEqual(frame, { a: 1 }); break; }
  assert.equal(broken.canceled, 1);

  // before the first `next`
  const unread = source('{"a":1}\n'), never = readFrames(unread.stream);
  assert.deepEqual(await never.return('over'), { done: true, value: 'over' });
  assert.equal(unread.canceled, 1);
  assert.deepEqual(await never.next(), { done: true, value: undefined });

  const bad = source('[]\n');
  await assert.rejects(readFrames(bad.stream).next(), { code: 'invalid' });
  assert.equal(bad.canceled, 1);
});

test('a next still waiting when return is called ends, with no frame and no error', async () => {
  // the bytes there already: none, part of a line, a frame, two, a bad one; asked at each turn before `return`
  for (const text of ['', '{"a":', '{"a":1}\n', '{"a":1}\n{"a":2}\n', '[]\n', 'nope\n']) for (let turns = 0; turns < 8; turns++) {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(bytes(text)); } });
    const frames = readFrames(stream), nexts = [frames.next(), frames.next()];
    for (const next of nexts) next.catch(() => {});
    for (let i = 0; i < turns; i++) await null;
    const waiting = nexts.filter(next => inspect(next).includes('<pending>'));
    assert.ok(turns > 0 || waiting.length === 2);
    const over = frames.return();
    for (const next of waiting) assert.deepEqual(await next, { done: true, value: undefined }, `${text} after ${turns}`);
    assert.deepEqual(await over, { done: true, value: undefined });
    assert.equal(stream.locked, false);
  }
});

test('the stream is unlocked when reading is over, failed or left', async () => {
  const over = streamOf([bytes('{"a":1}\n')]);
  for await (const frame of readFrames(over)) assert.deepEqual(frame, { a: 1 });
  assert.equal(over.locked, false);

  for (const text of ['[]\n', '{', 'nope\n', `${' '.repeat(9)}\n`]) {
    const failed = streamOf([bytes(text)]);
    await assert.rejects(readFrames(failed, { maxBytes: 8 }).next(), FrameError);
    assert.equal(failed.locked, false);
  }
  const gone = new ReadableStream({ start(controller) { controller.error(new Error('gone')); } });
  await assert.rejects(readFrames(gone).next(), /gone/);
  assert.equal(gone.locked, false);

  const left = streamOf([bytes('{"a":1}\n{"a":2}\n')]);
  for await (const frame of readFrames(left)) { assert.deepEqual(frame, { a: 1 }); break; }
  assert.equal(left.locked, false);

  const unread = streamOf([]);
  await readFrames(unread).return();
  assert.equal(unread.locked, false);
});

test('return does not wait for the source to stop, nor fail with it', async () => {
  for (const cancel of [() => new Promise(() => {}), () => Promise.reject(new Error('stuck')), () => { throw new Error('stuck'); }])
    for (const text of ['', '{"a":', '{"a":1}\n[]\n']) {
      const open = () => readFrames(new ReadableStream({ start(controller) { controller.enqueue(bytes(text)); }, cancel }));
      const frames = open(), next = text.includes('\n') ? await frames.next() : frames.next();
      assert.deepEqual(await soon(frames.return(1)), { done: true, value: 1 });
      if (next instanceof Promise) assert.deepEqual(await soon(next), { done: true, value: undefined });
      if (text.includes('[]')) {
        const failing = open();
        await failing.next();
        await assert.rejects(soon(failing.next()), { code: 'invalid' });
      }
    }
});

test('a draft whose steps make it over 1 MiB is refused by default, and goes through without them', async () => {
  const text = '字'.repeat(65536), draft = { text, version: 1 };
  const read = async frame => {
    const frames = [];
    for await (const back of readFrames(writeFrames([frame]))) frames.push(back);
    return frames;
  };
  await assert.rejects(read({ ...draft, steps: Array.from({ length: 6 }, () => ({ text, delayMs: 1 })) }), { code: 'too_large' });
  assert.deepEqual(await read(draft), [draft]);
});

test('what the source fails with is thrown as it is, after the frames before it', async () => {
  const gone = new Error('gone');
  let sent = false;
  const frames = readFrames(new ReadableStream({
    pull(controller) {
      if (sent) return controller.error(gone);
      sent = true;
      controller.enqueue(bytes('{"a":1}\n{"b"'));
    },
  }, { highWaterMark: 0 }));
  assert.deepEqual((await frames.next()).value, { a: 1 });
  await assert.rejects(frames.next(), error => error === gone);
});

// A clock the test moves; `waiting` is how many timers are set.
function fakeClock() {
  let now = 0, last = 0;
  const set = new Map();
  return {
    timers: {
      setTimeout(call, after) { set.set(++last, { at: now + after, call }); return last; },
      clearTimeout(id) { set.delete(id); },
    },
    get waiting() { return set.size; },
    advance(by) {
      const until = now + by;
      for (;;) {
        const [id, timer] = [...set].sort((a, b) => a[1].at - b[1].at)[0] ?? [];
        if (!timer || timer.at > until) break;
        now = timer.at;
        set.delete(id);
        timer.call();
      }
      now = until;
    },
  };
}
// Frames given by hand: `push`, `end`, `fail`.
function source() {
  const ready = [], asked = [];
  const settle = step => asked.length ? asked.shift()(step) : ready.push(step);
  const made = {
    returned: 0,
    push: value => settle({ done: false, value }),
    end: () => settle({ done: true, value: undefined }),
    fail: error => settle(Promise.reject(error)),
    [Symbol.asyncIterator]: () => ({
      next: () => ready.length ? Promise.resolve(ready.shift()) : new Promise(resolve => asked.push(resolve)),
      async return() { made.returned++; return { done: true, value: undefined }; },
    }),
  };
  return made;
}
const beating = () => {
  const clock = fakeClock(), frames = source();
  const reader = writeFrames(frames, { heartbeatMs: 15, timers: clock.timers }).getReader();
  return { clock, frames, reader, read: async () => decoder.decode((await reader.read()).value) };
};

test('frames are written a line each and the stream ends with the iterable, async or sync', async () => {
  const text = `${sequence.map(frame => JSON.stringify(frame)).join('\n')}\n`;
  async function* later() { yield* sequence; }
  for (const iterable of [sequence, new Set(sequence), later()])
    assert.equal(await new Response(writeFrames(iterable)).text(), text);
  assert.equal(await new Response(writeFrames([])).text(), '');
});

test('what is written reads back the same', async () => {
  const back = [];
  for await (const frame of readFrames(writeFrames(sequence))) back.push(frame);
  assert.deepEqual(back, sequence);
  const alone = [];
  for await (const frame of readFrames(writeFrames([{ text: '\ud800' }, Object.assign(Object.create(null), { a: 1 })]))) alone.push(frame);
  assert.deepEqual(alone, [{ text: '\ud800' }, { a: 1 }]);
});

test('nothing written for heartbeatMs: a blank line, again and again', async () => {
  const { clock, read } = beating();
  for (let i = 0; i < 3; i++) {
    const next = read();
    clock.advance(14);
    assert.equal(clock.waiting, 1);
    clock.advance(1);
    assert.equal(await next, '\n');
  }
});

test('no heartbeat while frames are written more often; every line written starts the wait anew', async () => {
  const { clock, frames, read } = beating();
  for (let i = 0; i < 5; i++) {
    const next = read();
    clock.advance(14);
    frames.push({ i });
    assert.equal(await next, `{"i":${i}}\n`);
  }
  const idle = read();
  clock.advance(14);
  clock.advance(1);
  assert.equal(await idle, '\n');
  // after a heartbeat as after a frame
  const next = read();
  clock.advance(14);
  frames.push({ last: true });
  assert.equal(await next, '{"last":true}\n');
});

test('heartbeats do not pile up while nobody reads, and go on when somebody does', async () => {
  const { clock, frames, read } = beating();
  clock.advance(15 * 100);
  frames.push({ a: 1 });
  // one heartbeat was room for, the other 99 were not written
  assert.equal(await read(), '\n');
  assert.equal(await read(), '{"a":1}\n');
  const next = read();
  clock.advance(15);
  assert.equal(await next, '\n');
});

test('no heartbeatMs, no timer', async () => {
  const clock = fakeClock(), frames = source();
  const reader = writeFrames(frames, { timers: clock.timers }).getReader();
  assert.equal(clock.waiting, 0);
  const next = reader.read();
  frames.push({ a: 1 });
  assert.equal(decoder.decode((await next).value), '{"a":1}\n');
  assert.equal(clock.waiting, 0);
});

test('canceled: the iterable is told to return, no timer is left, nothing more is written', async () => {
  const { clock, frames, reader, read } = beating();
  const next = read();
  frames.push({ a: 1 });
  await next;
  assert.equal(clock.waiting, 1);
  await reader.cancel();
  assert.equal(frames.returned, 1);
  assert.equal(clock.waiting, 0);
  clock.advance(1000);
  assert.deepEqual(await reader.read(), { done: true, value: undefined });

  // a frame the iterable still gives after that sets no timer either, nor is it told again
  const late = beating();
  await new Promise(setImmediate);
  await late.reader.cancel();
  late.frames.push({ a: 1 });
  await new Promise(setImmediate);
  assert.equal(late.clock.waiting, 0);
  assert.equal(late.frames.returned, 1);

  // an iterable that gives its return nothing to do
  const plain = writeFrames({ [Symbol.iterator]: () => ({ next: () => ({ done: false, value: { a: 1 } }) }) }).getReader();
  await plain.read();
  await plain.cancel();
});

test('cancel does not wait for the iterable, nor fail with it', async () => {
  const unhandled = [], seen = reason => unhandled.push(reason);
  process.on('unhandledRejection', seen);
  try {
    // an async generator in the middle of an await: its return waits for that
    let begun = false, go;
    async function* stuck() { begun = true; await new Promise(resolve => { go = resolve; }); yield { a: 1 }; }
    const clock = fakeClock(), waiting = writeFrames(stuck(), { heartbeatMs: 15, timers: clock.timers }).getReader();
    await new Promise(setImmediate);
    assert.ok(begun);
    assert.equal(await soon(waiting.cancel()), undefined);
    assert.equal(clock.waiting, 0);
    go();

    // one that fails while it finishes, later and at once
    async function* failing() { try { yield { a: 1 }; } finally { throw new Error('closing'); } }
    const throwing = { [Symbol.iterator]: () => ({ next: () => ({ done: false, value: { a: 1 } }), return() { throw new Error('closing'); } }) };
    for (const iterable of [failing(), throwing]) {
      const reader = writeFrames(iterable).getReader();
      await reader.read();
      assert.equal(await soon(reader.cancel()), undefined);
    }
    await new Promise(setImmediate);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', seen);
  }
});

test('ended or failed, the stream ends or fails with it and no timer is left', async () => {
  const ended = beating();
  const last = ended.reader.read();
  ended.frames.end();
  assert.deepEqual(await last, { done: true, value: undefined });
  assert.equal(ended.clock.waiting, 0);

  const failed = beating(), problem = new Error('gone');
  const next = failed.reader.read();
  failed.frames.fail(problem);
  await assert.rejects(next, error => error === problem);
  assert.equal(failed.clock.waiting, 0);
  assert.equal(failed.frames.returned, 0);
});

test('a value that is no plain object is not written: the stream fails and the iterable is told to return', async () => {
  class Frame { a = 1; }
  for (const value of [null, undefined, 1, 'text', true, [], [{ a: 1 }], new Frame(), new Map(), new Date(0), () => {}]) {
    const { clock, frames, reader, read } = beating();
    const first = read();
    frames.push({ a: 1 });
    assert.equal(await first, '{"a":1}\n');
    const next = reader.read();
    frames.push(value);
    await assert.rejects(next, { name: 'FrameError', code: 'invalid', message: '第 2 帧：不是普通对象' });
    assert.equal(clock.waiting, 0);
    assert.equal(frames.returned, 1);
  }
});

test('an object that is written as no object is not written either', async () => {
  for (const instead of [null, [], [{ a: 1 }], undefined, 1, '{}']) {
    const { clock, frames, reader, read } = beating();
    const first = read();
    frames.push({ a: 1 });
    assert.equal(await first, '{"a":1}\n');
    const next = reader.read();
    frames.push({ toJSON: () => instead });
    await assert.rejects(next, { name: 'FrameError', code: 'invalid', message: '第 2 帧：写出来不是 JSON 对象' });
    assert.equal(clock.waiting, 0);
    assert.equal(frames.returned, 1);
  }
  assert.equal(await new Response(writeFrames([{ toJSON: () => ({ b: 2 }) }])).text(), '{"b":2}\n');
});
