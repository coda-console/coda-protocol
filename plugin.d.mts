// Types of what a plugin's module queries and answers by (docs/plugins.md「调用」, coda#2749 3.1 and 第 7 节), and of the
// records (coda#2749 3.7), as `@coda-console/protocol/types`. All on the trial surface: they may change from one version of
// Coda to the next. Only these members of `coda` are typed here; the others are not yet.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Readable, Writable } from 'node:stream';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
/** A record: its protocol and its ID, the space's one. */
export type Ref = { kind: string; id: string };
/**
 * A record this plugin writes, as it names it: its protocol and the plugin's own key (1–256 characters: a device's udid,
 * `account:group`, a source's name). Its ID is derived by the host from this backend, the plugin, the kind and the key,
 * the same every time; the plugin makes no ID, nor keeps a table from its keys to IDs.
 */
export type KeyRef = { kind: string; key: string };
/** A record a call is of, as its handler is given it: with its `key` when it is this plugin's own on this machine. */
export type HandledRef = Ref & { key?: string };
/** How much a call that failed did: nothing, some of it, or none can say. */
export type Effects = 'none' | 'some' | 'unknown';

/**
 * A blob pointer, as `coda.pointer` makes it: which machine has the content (`owner`, its ID) and where there (`path`), with
 * what its writer says of it. A reader takes it to Coda as it is; a pointer is not the content.
 */
export interface BlobPointer {
  owner: string;
  path: string;
  name?: string;
  size?: number;
  mime?: string;
  /** Of the whole content, lowercase hex. */
  sha256?: string;
}

/** A failed call, as its caller sees it and as `coda.error` makes it. */
export interface CallError extends Error {
  code: string;
  effects?: Effects;
  retryAfterMs?: number;
}

export interface QueryOptions {
  /** Going off, the call is given up: it fails as an `AbortError`. */
  signal?: AbortSignal;
  /** Milliseconds; at most the operation's own `timeout`, or 30 seconds. */
  timeout?: number;
}

export interface CallOptions {
  /**
   * The call's idempotency key, by default a new one: made again with the same key and the same content, it is the same call,
   * not done again, its outcome the first one's; with other content it is refused (`idempotency_conflict`, `none`).
   */
  id?: string;
  /** Going off, the call is cancelled and not waited on: it fails as an `AbortError`. */
  signal?: AbortSignal;
  /** Milliseconds it is waited on; past them it is given up (its callee asked to cancel) and fails as a `TimeoutError`. */
  timeout?: number;
  /** How the call goes, as its handler says it (`ctx.progress`): a hint; only the latest is kept, and it may be lost. */
  onProgress?(value: Json): void;
}

/**
 * What a call says of where it came from, beside who is before it. All optional, filled by Coda when it can; only the direct
 * caller is given, never the whole chain of parents.
 * - `machine`: the ID of the backend the call was made from. The receiver checks it itself against where the envelope came from.
 * - `plugin`: the plugin the call is made as. Relayed by the originating backend: the receiver cannot check it on its own.
 * - `parent`: whoever made the call directly, e.g. the session that did, an opaque reference. Relayed too, not checkable.
 * The page's opener (`device`, `name`, `local`) is relayed by the originating backend as well.
 *
 * Read where a call came from by value, not by whether a property exists. Since 6.25.0 `machine` and `plugin` may be on any
 * branch of `Caller` and `StreamCaller`, so `'machine' in caller` and `'plugin' in caller` no longer tell the branches apart,
 * and TypeScript types the field as `string | undefined` after such a check. Tell this machine's own client (`local`), a
 * device (`device`, and `role` of a `StreamCaller`) and a plugin by those fields and the values of `machine` and `plugin`.
 * The two mean the same on every branch: `machine` is always the ID of the backend the call was made from, which the
 * receiver checks against the envelope; a `StreamCaller`'s `plugin` is the plugin the call is made as, checked by this machine
 * (by its token, or by Coda's own entry) when the last hop is this machine, relayed and not checkable by this machine when
 * the last hop is another backend (`role: 'backend'`). So `s.plugin !== undefined` and `caller.machine !== undefined` say only
 * that there is a value; the old branch of a plugin checked by this machine is `s.plugin !== undefined && !('device' in s) && !('local' in s)`,
 * and a call relayed from another backend is `caller.machine !== undefined && caller.machine !== selfId`.
 */
export interface CallerOrigin {
  machine?: string;
  plugin?: string;
  parent?: { kind: string; id: string };
}

/**
 * Who made a doing call or a query. When a page's opener is before it, `local: true` (Coda's own client on this machine) or
 * `device` (with its `name` if known). A call forwarded from another backend has no `local` but the `machine` it was made from
 * (that one's ID), a device kept as it is: so `{ machine }` or `{ machine, device, name? }`. A bare `{ machine }` may be a page
 * opened by that machine's own client or any other call from that machine, so these fields alone do not tell whether a page
 * made the call. Each form may also carry a `CallerOrigin`.
 */
export type Caller = ({ local: true } | { device: string; name?: string } | { machine: string; device?: string; name?: string }) & CallerOrigin;

/** What a handler of a call is given beside its input. A handler of a query, and `resume`, have no `progress` nor `ask`. */
export interface Context {
  /** This call's ID, the host's, unique: the same for the same caller's same request. */
  id: string;
  /** The record the call is of; with its `key` when it is this plugin's own. */
  record: HandledRef;
  /**
   * Goes off when the caller gives up or cancels (`AbortError`) or the deadline passes (a query's `timeout`, a doing
   * call's `TimeoutError`). A doing call's handler still ends it: thrown its reason, it is cancelled or timed out.
   */
  signal: AbortSignal;
  /** When the call's time is up, in milliseconds since the epoch; a doing call may have none. */
  deadline: number | null;
  /** `coda.query` under this call: given up on with it, and given at most the time it has left. Only queries. */
  query: Coda['query'];
  /**
   * `coda.spawn` under this call: ended as `signal` goes off, and, still running, once the call has ended (its handler
   * returned or threw, or the host ended it). One `name`d outlives it.
   */
  spawn: Coda['spawn'];
  /** A doing call's: how it goes, a hint; only the latest is kept, and it may be lost. */
  progress?(value: Json): void;
  /** A doing call's: a question to whoever answers it, its answer once given; one at a time. */
  ask?(question: Json): Promise<Json>;
  /**
   * A doing call's handler's, and its `resume`'s: `coda.call` made by this call, so that it is cancelled as this call is;
   * given up on with it, and given at most the time it has left. Made again by the same `id` in `resume`, it is the call
   * made before the process ended, its outcome waited on again.
   */
  call?: Coda['call'];
  /**
   * Who made the call, as Coda knows it when it fills this in, never as the page says: who is before the page that made
   * it, and for a query or a call a plugin or a session makes, where it came from (see `CallerOrigin`). `machine` is
   * checked by the receiver against the envelope; `plugin`, `parent` and the page's opener are relayed by the originating
   * backend and cannot be checked by the receiver. Only the direct caller, not the chain of parents.
   */
  caller?: Caller;
}

/** Its return value is the result; what it throws, the failure (`coda.error`, or anything else as `handler_error`). */
export type Handler = (input: Json, ctx: Context) => Json | Promise<Json>;
/**
 * Who asks a service or a stream: this machine's own client or tools, a device, another backend of the space (the last hop,
 * of one sent on), or a plugin (by its token, or from its page; a stream's only).
 */
export type StreamCaller = ({ local: true } | { device: string; role: 'client' | 'backend'; name?: string } | { plugin: string }) & CallerOrigin;
/** What a handler of a service (`coda.serve`) is given beside its request. */
export interface ServeContext {
  caller: StreamCaller;
  /** Goes off when the caller leaves before the answer is done; `request.signal` goes off with it. */
  signal: AbortSignal;
}
/** What a handler of a record's stream (`coda.stream`) is given beside its request. */
export interface StreamContext extends ServeContext {
  /** The record the stream is of; with its `key` when it is this plugin's own. */
  record: HandledRef;
  /** Its parameters, from the query string, as the definition's `input` has them; none (`{}`) of an `http` stream. */
  input: Record<string, string>;
}
/**
 * Web standard, both ways: `request.url` has the path below the service or the stream and the query string as asked,
 * `request.headers` those of content and negotiation, `request.body` (of any method but `GET` and `HEAD`) the bytes as they
 * come, read no further ahead than the handler reads them. The `Response`'s status, headers of content and body are what the
 * caller is answered, the body as it comes, its head with its first byte. Thrown before that, by the handler or the body it
 * gave, a failure is the answer (`{ error: { code, message, effects } }`, as `coda.error` says it, or `handler_error`); after
 * it, the connection is broken off.
 */
export type ServeHandler = (request: Request, ctx: ServeContext) => Response | Promise<Response>;
export type StreamHandler = (request: Request, ctx: StreamContext) => Response | Promise<Response>;

/** A doing call handed to a process of the plugin's that ended before its handler did. */
export interface Interrupted {
  /** The call's ID, as its handler was given it (`ctx.id`). */
  id: string;
  record: HandledRef;
  op: string;
  input: Json;
  /** The last progress its handler gave, only a hint: no evidence of what was done. */
  progress: Json | null;
  /** Whether it was asked to be cancelled. */
  canceled: boolean;
}
/**
 * Says how such a call ended, as a handler does, once a later process of the plugin's has the module activated: its
 * return value the result, what it throws the failure. Given 30 seconds; its `ctx` is a query's handler's (no `progress`
 * nor `ask`). Asked to be cancelled, or past its deadline, before it is called, its `ctx.signal` has gone off already
 * (`AbortError`, `TimeoutError`). It may be called more than once, its process ending meanwhile: it only says, and does
 * nothing.
 */
export type Resume = (call: Interrupted, ctx: Context) => Json | Promise<Json>;

export interface Disposable { dispose(): void }

export interface SpawnOptions {
  /** Its working directory; by default the plugin's directory. */
  cwd?: string;
  /** Added over the environment of the plugin's processes. */
  env?: Record<string, string>;
  /**
   * One of the names the manifest's `contributes.processes` declares: the process outlives the call or the module that
   * started it, until it exits or the plugin is uninstalled. One at a time: while one of the name runs, another fails
   * (`conflict`). It has no input, and its output goes to `<plugin's state directory>/processes/<name>.log`, written anew
   * each time it starts and never rotated: its handle's streams are `null`.
   */
  name?: string;
}

/** A process the host started for the module, as Node's ChildProcess has the most of it. */
export interface Process {
  pid: number;
  /** `null` for a named one, as for a ChildProcess whose stdio is not piped. */
  stdin: Writable | null;
  /**
   * Read it, or `resume()` it to drop it: what is not read holds the process once a window of it waits. `null` for a
   * named one: its output is in its log.
   */
  stdout: Readable | null;
  stderr: Readable | null;
  /**
   * Once the process has exited and all of `stdout` and `stderr` is in them, ended. Fails (`interrupted`) if the
   * plugin's host stops first: the host ends the process.
   */
  exited: Promise<{ code: number | null; signal: string | null }>;
  /** Sends it `signal` (SIGTERM by default), the process alone, as `ChildProcess.kill` does. */
  kill(signal?: string): void;
}

export interface Settings {
  /** This plugin's own settings as they are now (secrets are not among them); asked each time. */
  get(): Promise<Json>;
  /** Told the new settings after they are written; `dispose()` stops it, as does the module stopping. */
  onChange(fn: (settings: Json) => void): Disposable;
}

/**
 * A record as it is read (`get`, `list`, `watch`): its holder's backend (`owner`) and the machine it is on (`location`),
 * its own ID, the plugin that holds it (`plugin`; `coda` for Coda's own), the key this plugin named it by (only of its own
 * on this machine; no other plugin, nor any other machine, is told it), whether it is this machine's (`local`: the holder's original; another's is a copy, which only its holder
 * writes), its spec and status as written, the records they refer to by their IDs (`get` reads them wherever they are
 * held), its labels, and a version that changes as it does. In a space every machine's records are read on every other but
 * Coda's composers and submissions, only on the machine that wrote them, and its runs and cards, which the catalog does not take.
 */
export interface Entry {
  owner: string;
  location: string;
  id: string;
  plugin: string;
  key?: string;
  local: boolean;
  spec: { [key: string]: Json };
  status: { [key: string]: Json };
  labels?: Record<string, string>;
  version: string;
}
/**
 * A record as `put` writes it, and `replace` each: its spec and its labels (none: none) whole; its status as given, or, not
 * given, as the record has it (a new one's empty), as a status is the one's that keeps it so.
 */
export interface RecordValue {
  spec: { [key: string]: Json };
  status?: { [key: string]: Json };
  labels?: Record<string, string>;
}
/** `local`: this machine's records only; `available` (by default): every machine's in the space. `id`: of that ID only. */
export interface RecordFilter { scope?: 'local' | 'available'; id?: string }
/** A record read anew, made or gone: by its ID, as it is now, or as it was last. */
export interface RecordChange { type: 'ADDED' | 'MODIFIED' | 'DELETED'; id: string; entry: Entry }

/** An event, as a module's handler of it is given it (`coda.on`). */
export interface Event {
  /** Its name, the full dotted one (`pull_request.closed`), one on this machine. */
  name: string;
  /** The protocol it is of, with its major version (`github/pull-request@1`): the event's version. */
  kind: string;
  /** What it is about, `<kind>:<id>`. */
  subject: string;
  /** The ID of the project of this machine it was published in. */
  project: string;
  /** What it says, as its protocol's payload schema has it. */
  data: { [key: string]: Json };
  /** The ID of the plugin that published it; `coda` for Coda's own. */
  publisher: string;
}

export interface Coda {
  /** Handles an operation of a protocol the plugin implements: a query (`safe`) or a doing call (any other, `idempotent` among them). */
  handle(kind: string, operation: string, handler: Handler | { run: Handler; resume?: Resume }): Disposable;
  /** `self` is no protocol: `handle('self', …)` throws `invalid_input`. */
  self: {
    /**
     * Handles a query only the plugin's own processes make (`coda self <name> [input]`), listed in no manifest: its
     * `ctx.record` is `{ kind: 'self', id: <plugin's ID> }`; given 30 seconds; one not registered fails as `not_found`.
     */
    handle(name: string, handler: Handler): Disposable;
  };
  /** Queries a record: only a `safe` operation. Fails with a `CallError`, its `effects` always `none`. */
  query(record: Ref, operation: string, input?: Json, options?: QueryOptions): Promise<Json>;
  /**
   * Does an operation of a record that is not `safe` (an `idempotent` one too), as this plugin, through Coda's call kernel: its
   * result. Fails with a `CallError`, its `code` and `effects` as the callee said them; cancelled, as an `AbortError`; past
   * `timeout`, as a `TimeoutError`.
   */
  call(record: Ref, operation: string, input?: Json, options?: CallOptions): Promise<Json>;
  error(code: string, message: string, more?: { effects?: Effects; retryAfterMs?: number }): CallError;
  /**
   * Starts a process for the module: until it stops (the plugin host's process ends, the plugin is uninstalled), or, with
   * `name`, beyond it. What it leaves in its group as it exits is ended with it. Fails as `spawn_failed`: of `none`
   * effect if it never started, of `unknown` if it started and could not be registered (killed with its group at once).
   */
  spawn(command: string, args?: string[], options?: SpawnOptions): Promise<Process>;
  /**
   * Serves the plugin's own bytes at `/v1/plugins/<plugin>/services/<id>/…`, any method a standard
   * `Request` takes: all but `CONNECT`, `TRACE` and `TRACK`. Done once Coda has it; the handle's
   * `dispose()` withdraws it and breaks off its exchanges. Throws for an ID a service of the plugin has already
   * (`services.register`'s among them).
   */
  serve(id: string, handler: ServeHandler): Promise<{ dispose(): Promise<void> }>;
  /**
   * Implements a stream of the records this plugin holds of a protocol it implements, the stream one the protocol's definition
   * has; otherwise it throws at once. Done once Coda has it; `dispose()` as `serve`'s.
   */
  stream(kind: string, name: string, handler: StreamHandler): Promise<{ dispose(): Promise<void> }>;
  /** Frame streams: ndjson, one JSON object a line, a blank line a heartbeat. As `@coda-console/protocol/frames` has them. */
  frames: Readonly<{
    /** The frames of a body, heartbeats skipped; fails with `code` `truncated`, `too_large` (a line over `maxBytes`, by default 1 MiB) or `invalid`. */
    read(stream: ReadableStream<Uint8Array>, options?: { maxBytes?: number }): AsyncIterableIterator<{ [key: string]: Json }>;
    /** A body of the iterable's objects; with `heartbeatMs`, a blank line whenever nothing has been written for that long. */
    write(iterable: Iterable<{ [key: string]: Json }> | AsyncIterable<{ [key: string]: Json }>, options?: { heartbeatMs?: number }): ReadableStream<Uint8Array>;
  }>;
  /**
   * A pointer to content of one of the plugin's own services, on this machine: `path`, what is below the service, as it is
   * (not encoded, segments between `/`); `extra`, what it says of the content. Throws a `TypeError` for no pointer: a service
   * ID that is none, a path with an empty, `.` or `..` segment or a `\`, too long, an `extra` with anything else. Whether the
   * service is registered is not asked.
   */
  pointer(service: string, path: string, extra?: { name?: string; size?: number; mime?: string; sha256?: string }): BlobPointer;
  /** This plugin's own settings. */
  settings: Settings;
  /**
   * One record of a kind, of its ID (a record's ID is the space's one): this machine's, else the one another machine
   * holds; `null` for none. Read after what the module wrote before.
   */
  get(record: Ref): Promise<Entry | null>;
  /** The records of a kind, this machine's first; read after what the module wrote before. */
  list(kind: string, filter?: RecordFilter): Promise<Entry[]>;
  /**
   * Watches a kind's records: each there is given as `ADDED` first, then each change. Gone over again whole if the host
   * restarts (the module is activated anew). Done once the first are given.
   */
  watch(kind: string, fn: (change: RecordChange) => void, filter?: RecordFilter): Promise<Disposable>;
  /**
   * Makes or replaces a record this plugin holds (`RecordValue`), or makes one of a kind it implements, by its key; another's
   * it may not write (`forbidden`). What people read of it is in its spec. Done once it is read so, with its entry (its
   * `id`, the host's, and its `key`); refused (`invalid_input` for a key not 1–256 characters, an `id` given, or a value
   * its kind's schemas, or the space's 64 KiB a record, refuse; `conflict` for a group named as another here), nothing was
   * written. The module's writes are done one after another, as it made them.
   */
  put(record: KeyRef, value: RecordValue): Promise<Entry>;
  /** Deletes a record this plugin holds, by its key; one not there is no failure. */
  delete(record: KeyRef): Promise<void>;
  /**
   * Every record this plugin holds of a kind, given whole by their keys: each written as `put` writes it, and those it
   * holds and no longer gives deleted; another plugin's of the kind are left. All of it is done, or nothing; done, with
   * the entries given, in their order.
   */
  replace(kind: string, entries: (RecordValue & { key: string })[]): Promise<Entry[]>;
  /**
   * Handles an event the plugin subscribes to: one of an event group in its `uses`, any other throwing at once (`forbidden`).
   * Given each one published in a project the plugin applies in, at most once, while the module is activated; not sorted by
   * subject. What it throws is logged; the event is not given again.
   */
  on(name: string, fn: (event: Event) => void): Disposable;
  /** Trial. The plugin itself: its ID, its directory, and its state directory on this backend (`null` when the backend has no state root). */
  plugin: Readonly<{ id: string; path: string; state: string | null }>;
  /**
   * Trial. To be withdrawn: use `serve`. Local streaming services: `register` serves `id` on this machine (an HTTP handler, given the caller as Coda
   * names it), done once Coda has it; the handle's `dispose()` withdraws it and closes its connections.
   */
  services: Readonly<{
    register(id: string, handler: (request: IncomingMessage, response: ServerResponse, caller: Readonly<{ [key: string]: Json }>) => void | Promise<void>): Promise<{ dispose(): Promise<void> }>;
  }>;
  /** Trial. The plugin's own pages: `register` the provider of a view the manifest declares (`contributes.views`); its `open` is called each time one is opened. */
  views: Readonly<{ register(id: string, provider: { open(view: ViewInstance): void | Promise<void> }): { dispose(): void } }>;
  /** Trial. Protocol contributions: a contributor to another protocol's records, and an upload of this machine's. */
  protocols: Readonly<{
    register(kind: string, key: string, handler: (object: ProtocolObject, key: string) => Contribution | null | Promise<Contribution | null>): Disposable;
    upload(id: string): Promise<{ id: string; name: string; size: number; path: string; mime?: string; duration?: number; [key: string]: Json | undefined }>;
  }>;
  /** Trial. Tells a session's agent something, told with its next turn and waking nothing; `told` is `false` for a session archived. */
  tell(session: string, text: string): Promise<{ told: boolean }>;
  /** Trial. Runs an installed plugin's environment setup again, asked as this plugin. */
  pluginSetup: Readonly<{ retry(plugin: string): Promise<Json> }>;
}

/** The record or draft a protocol hands a contributor, without who created it: its `spec` and `status` are objects the protocol's schemas describe. */
export interface ProtocolObject {
  kind: string;
  id: string;
  spec: { [key: string]: Json };
  status: { [key: string]: Json };
}

/** What a contributor adds: only the fields the protocol declares as contributions, each of the value the protocol says (an object, not a list or a scalar); `null` adds nothing. */
export type Contribution = { [field: string]: Json };

/** A page of the plugin's, opened, as its view provider's `open` is given it. */
export interface ViewInstance {
  /** This opening's ID. */
  id: string;
  /** The view's ID. */
  view: string;
  /** What the page was opened beside: the session's ID, and the `args` of the button or card that opened it; `null` for none. */
  context: { session: string | null; args: Json | null };
  /** Who opened it: this machine's client (`{ local: true }`) or a device. */
  caller: { local?: boolean; device?: string; name?: string };
  /** Sends the page a message; `false` once the page is gone. */
  postMessage(message: Json): boolean;
  /** A collection handed to the page: `set` and `delete` give whether the page was told anything. */
  collection(name: string): {
    set(id: string, object: { [key: string]: Json }): boolean;
    delete(id: string): boolean;
    get(id: string): { [key: string]: Json } | undefined;
    keys(): string[];
  };
  /** Each returns a handle that stops it. */
  onMessage(fn: (message: Json) => void): Disposable;
  onContext(fn: (context: ViewInstance['context']) => void): Disposable;
  onClose(fn: () => void): Disposable;
}

/**
 * The keys of the manifest's `contributes` that are typed here: only these two so far, the rest of the manifest has no type
 * here yet. Their shape is checked by `schemas/plugin/`; whether a protocol is on this machine and who is refused is the host's.
 */
export interface ManifestContributions {
  /** Protocols the plugin implements if they are on this machine (`namespace/name@major`); with one absent the plugin still runs, only that implementation does not take effect. */
  optionalProtocolImplementations?: string[];
  /** Accord signature record kinds (`namespace/name`, the namespace the plugin's own ID) that only this plugin may publish, revoke or read. */
  reservedAccordKinds?: string[];
}
