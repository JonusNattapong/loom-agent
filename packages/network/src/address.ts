/** Canonical logical addresses for Loom resources. */
export const LOOM_RESOURCE_KINDS = ["worker", "agent", "job", "bot", "schedule", "controller"] as const;

export type LoomResourceKind = (typeof LOOM_RESOURCE_KINDS)[number];
export type LoomAddress = Readonly<{
  scheme: "loom";
  kind: LoomResourceKind;
  id: string;
}>;
export type LoomAddressInput = LoomAddress | Readonly<{kind: LoomResourceKind; id: string}>;
export type LoomAddressLike = LoomAddress | string;

export type LoomAddressErrorCode =
  | "invalid_type"
  | "invalid_scheme"
  | "invalid_authority"
  | "credentials_not_allowed"
  | "port_not_allowed"
  | "query_not_allowed"
  | "fragment_not_allowed"
  | "invalid_resource_kind"
  | "invalid_path"
  | "invalid_id"
  | "non_canonical";

export class LoomAddressError extends Error {
  constructor(public readonly code: LoomAddressErrorCode, message: string) {
    super(message);
    this.name = "LoomAddressError";
  }
}

const kinds = new Set<string>(LOOM_RESOURCE_KINDS);
const MAX_ID_LENGTH = 256;
const MAX_ENCODED_ID_LENGTH = 1024;

function encodeId(id: string): string {
  return encodeURIComponent(id).replace(/[!'()*]/g, character =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function validateId(id: string): void {
  if (!id || [...id].length > MAX_ID_LENGTH) {
    throw new LoomAddressError("invalid_id", "Loom address ID must contain 1 to 256 characters");
  }
  if (id === "." || id === ".." || /[\/\\]/u.test(id) || /[\u0000-\u001F\u007F]/u.test(id)) {
    throw new LoomAddressError("invalid_id", "Loom address ID contains a forbidden character");
  }
  // JavaScript strings may contain unpaired surrogates, which cannot be safely UTF-8 encoded.
  try {
    encodeURIComponent(id);
  } catch {
    throw new LoomAddressError("invalid_id", "Loom address ID is not valid Unicode");
  }
}

function validateKind(kind: unknown): asserts kind is LoomResourceKind {
  if (typeof kind !== "string" || !kinds.has(kind)) {
    throw new LoomAddressError("invalid_resource_kind", `Unknown Loom resource kind: ${String(kind)}`);
  }
}

/** Format a structured address into its one canonical string representation. */
export function formatLoomAddress(address: LoomAddressInput): string {
  if (!address || typeof address !== "object") {
    throw new LoomAddressError("invalid_type", "Loom address must be an object");
  }
  if ("scheme" in address && address.scheme !== "loom") {
    throw new LoomAddressError("invalid_scheme", "Loom address scheme must be loom");
  }
  validateKind(address.kind);
  if (typeof address.id !== "string") {
    throw new LoomAddressError("invalid_id", "Loom address ID must be a string");
  }
  validateId(address.id);
  return `loom://${address.kind}/${encodeId(address.id)}`;
}

/** Parse and strictly validate a canonical `loom://kind/id` address. */
export function parseLoomAddress(text: string): LoomAddress {
  if (typeof text !== "string") {
    throw new LoomAddressError("invalid_type", "Loom address must be a string");
  }
  if (text.includes("#")) throw new LoomAddressError("fragment_not_allowed", "Loom addresses cannot contain fragments");
  if (text.includes("?")) throw new LoomAddressError("query_not_allowed", "Loom addresses cannot contain queries");
  if (!text.startsWith("loom://")) throw new LoomAddressError("invalid_scheme", "Loom address must start with loom://");

  const remainder = text.slice("loom://".length);
  const slash = remainder.indexOf("/");
  if (slash < 0) throw new LoomAddressError("invalid_path", "Loom address must contain exactly one ID segment");
  const authority = remainder.slice(0, slash);
  const rawId = remainder.slice(slash + 1);

  if (authority.includes("@")) throw new LoomAddressError("credentials_not_allowed", "Loom addresses cannot contain credentials");
  if (authority.includes(":")) throw new LoomAddressError("port_not_allowed", "Loom addresses cannot contain ports");
  if (!authority) throw new LoomAddressError("invalid_authority", "Loom address resource kind is required");
  validateKind(authority);
  if (!rawId || rawId.includes("/") || rawId.includes("\\") || rawId.length > MAX_ENCODED_ID_LENGTH) {
    throw new LoomAddressError("invalid_path", "Loom address must contain exactly one percent-safe ID segment");
  }

  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    throw new LoomAddressError("invalid_id", "Loom address ID has invalid percent encoding");
  }
  validateId(id);
  if (encodeId(id) !== rawId) {
    throw new LoomAddressError("non_canonical", "Loom address is not canonically encoded");
  }
  return Object.freeze({scheme: "loom", kind: authority, id});
}

export function isLoomAddress(text: unknown): text is string {
  if (typeof text !== "string") return false;
  try {
    parseLoomAddress(text);
    return true;
  } catch {
    return false;
  }
}

export function sameLoomAddress(left: LoomAddressLike, right: LoomAddressLike): boolean {
  return formatAddressLike(left) === formatAddressLike(right);
}

export function formatAddressLike(address: LoomAddressLike): string {
  return typeof address === "string" ? formatLoomAddress(parseLoomAddress(address)) : formatLoomAddress(address);
}
