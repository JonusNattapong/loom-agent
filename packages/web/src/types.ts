export type JsonRecord = Record<string, unknown>;

export interface Session {
  authenticated: boolean;
  csrfToken?: string;
  user?: { name?: string; role?: string };
}

export interface ApiErrorBody { error?: string; message?: string; }
export interface ListEnvelope { items?: JsonRecord[]; [key: string]: unknown; }

export function records(value: unknown, key?: string): JsonRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  const candidate = key ? value[key] : value.items;
  return Array.isArray(candidate) ? candidate.filter(isRecord) : [];
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function text(value: unknown, fallback = "—"): string {
  if (typeof value === "string" && value.length) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

export function timestamp(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? text(value) : date.toLocaleString();
}
