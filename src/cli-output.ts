import type { Flags } from "./cli-flags";

export interface JsonSuccess<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface JsonFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface JsonFailureDetails {
  logPath?: string;
  [key: string]: unknown;
}

export function wantsJson(flags: Flags): boolean {
  return flags["json"] === true;
}

export function printJsonSuccess<T>(data: T, meta?: Record<string, unknown>): void {
  const payload: JsonSuccess<T> = meta ? { ok: true, data, meta } : { ok: true, data };
  console.log(JSON.stringify(payload, null, 2));
}

export function printJsonFailure(code: string, message: string, details?: JsonFailureDetails | unknown): void {
  const payload: JsonFailure = { ok: false, error: { code, message, details } };
  console.error(JSON.stringify(payload, null, 2));
}

export function printKeyValue(rows: Array<[string, string | number | boolean | null | undefined]>): void {
  for (const [key, value] of rows) {
    console.log(`${key}: ${value ?? "-"}`);
  }
}
