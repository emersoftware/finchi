import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";
import pkg from "../package.json";
import { FINCHI_HOME } from "./config";
import type { Flags } from "./cli-flags";

const LOG_DIR = join(FINCHI_HOME, "logs");
const ERROR_LOG_PATH = join(LOG_DIR, "errors.ndjson");

const SENSITIVE_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "LLM_API_KEY",
  "API_KEY",
  "TOKEN",
  "PASSWORD",
  "PASS",
  "RUT",
];

const SENSITIVE_FLAG_KEYS = ["api-key", "password", "pass", "rut", "token", "secret"];

interface ErrorLogEntry {
  timestamp: string;
  version: string;
  runtime: {
    bun: string;
    platform: NodeJS.Platform;
    arch: string;
  };
  command: {
    argv: string[];
    flags: Record<string, unknown>;
  };
  error: {
    name: string;
    message: string;
    stack?: string;
  };
}

function redactSecrets(input: string): string {
  let output = input;

  output = output.replace(
    /\b([A-Z0-9_]*(?:API_KEY|TOKEN|PASSWORD|PASS|RUT))=([^\s]+)/gi,
    (_match, key) => `${key}=[REDACTED]`,
  );

  output = output.replace(
    /\b(--(?:api-key|password|pass|rut|token|secret))(?:=|\s+)([^\s]+)/gi,
    (_match, flag) => `${flag} [REDACTED]`,
  );

  output = output.replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[REDACTED]");

  return output;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toUpperCase().replace(/-/g, "_");
  return SENSITIVE_ENV_KEYS.some((token) => normalized === token || normalized.endsWith(`_${token}`));
}

function isSensitiveFlagKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_FLAG_KEYS.some((token) => normalized === token || normalized.endsWith(`-${token}`));
}

function sanitizeFlagValue(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(sanitizeFlagValue);
  return value;
}

export function sanitizeFlags(flags: Flags): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(flags).map(([key, value]) => [
      key,
      isSensitiveFlagKey(key) ? "[REDACTED]" : sanitizeFlagValue(value),
    ]),
  );
}

export function sanitizeArgv(argv: string[]): string[] {
  const sanitized: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const current = redactSecrets(argv[i] ?? "");
    sanitized.push(current);

    if (!argv[i]?.startsWith("--")) continue;

    const flagName = argv[i].slice(2);
    if (!isSensitiveFlagKey(flagName)) continue;

    const next = argv[i + 1];
    if (next && !next.startsWith("-")) {
      sanitized.push("[REDACTED]");
      i++;
    }
  }

  return sanitized;
}

export function sanitizeErrorLogText(input: string): string {
  return redactSecrets(input);
}

export function getErrorLogPath(): string {
  return ERROR_LOG_PATH;
}

export function writeErrorLog(err: unknown, flags: Flags): string {
  mkdirSync(LOG_DIR, { recursive: true });

  const error = err instanceof Error ? err : new Error(String(err));
  const entry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    version: pkg.version,
    runtime: {
      bun: Bun.version,
      platform: process.platform,
      arch: process.arch,
    },
    command: {
      argv: sanitizeArgv(process.argv),
      flags: sanitizeFlags(flags),
    },
    error: {
      name: error.name || "Error",
      message: sanitizeErrorLogText(error.message),
      stack: error.stack ? sanitizeErrorLogText(error.stack) : undefined,
    },
  };

  appendFileSync(ERROR_LOG_PATH, `${JSON.stringify(entry)}\n`, "utf-8");
  return ERROR_LOG_PATH;
}

export function getErrorLogHint(logPath: string): string {
  return `Log guardado en ${logPath}. Compártelo al reportar el problema.`;
}

export function sanitizeErrorForUser(err: unknown): string {
  const error = err instanceof Error ? err : new Error(String(err));
  return sanitizeErrorLogText(error.message);
}
