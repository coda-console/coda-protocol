// Types of `@coda-console/protocol/accord`: the pure functions that read an Accord author as a person sees it.
declare const authorBrand: unique symbol;
/** `ed25519:` and 64 lowercase hex digits; only `isAuthor` (or a function returning one) makes it, so a string is not one until checked. */
export type Author = `ed25519:${string}` & { readonly [authorBrand]: true };

export interface AccordIdentity {
  author: Author;
  /** The 32 bytes of the public key. */
  key: Uint8Array;
  /** The first 8 hex digits of the key. */
  short: string;
  /** The nickname the key spells; '' when it spells none. */
  name: string;
  /** The key as a decimal number, 78 digits wide. */
  tail: string;
  /** The last 4 digits of `tail`. */
  tag: string;
}

export interface TailEntry {
  /** What entries are told apart within: the nickname. Anything but a non-empty string means no one to be told apart from. */
  stem?: unknown;
  /** A non-empty string of ASCII digits; anything else gives '' and is no one's collision. */
  tail?: unknown;
}

export interface DisambiguateOptions {
  /** How many digits at least, a positive integer (default 4). */
  minDigits?: number;
}

export function isAuthor(value: unknown): value is Author;
/** The 32 bytes of a valid author, or null. */
export function parseAuthor(author: unknown): Uint8Array | null;
/** The first 8 hex digits of a valid author, or ''. */
export function shortAuthor(author: unknown): string;
/** The nickname a key spells: a 32-byte key or a valid author. '' for a non-author or a key that spells none; throws a `TypeError` for a `Uint8Array` of another length. */
export function nicknameOf(input: unknown): string;
/** The key as a 78-digit decimal number: a 32-byte `Uint8Array` or a valid author. '' for anything else; throws a `TypeError` for a `Uint8Array` of another length. */
export function tailOf(input: unknown): string;
/** null for what is not a valid author. */
export function accordIdentity(author: unknown): AccordIdentity | null;
/** `name #tag`, the short form when the key spells no nickname, `fallback` for a non-author. */
export function identityTitle(author: unknown, fallback?: string): string;
/** For each entry, the suffix of its decimal tail that tells it apart from the others of its stem; throws a `RangeError` for a `minDigits` that is not a positive integer. */
export function disambiguateTails(entries: Iterable<TailEntry>, options?: DisambiguateOptions): string[];
/** Each valid author of `authors` (once) and its title, with the tag lengthened where two of one nickname would collide. */
export function identityTitles(authors: Iterable<unknown>, options?: DisambiguateOptions): Map<Author, string>;
/** A 5×5 grid, mirrored left to right, 8 to 18 cells lit: from a `Uint8Array`'s bytes, a valid author's key, or else the code points of the text (`String(input ?? '')`). */
export function identiconPattern(input: unknown): boolean[][];
