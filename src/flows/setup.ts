import { writeFileSync, readFileSync, existsSync } from "fs";
import { getDb, type Db } from "../db/index";
import { accounts, transactions } from "../db/schema";
import { cleanDescription, convertDate, shouldSkipMovement } from "../sync/normalize";
import { generateHash } from "../sync/dedup";
import type { LLMProviderType } from "../config";
import { logHandledError } from "../error-log";

/** Hardcoded fallback when open-banking-chile is unavailable. */
const FALLBACK_BANKS = [
  { id: "falabella", name: "Banco Falabella" },
  { id: "bchile", name: "Banco de Chile" },
  { id: "santander", name: "Santander" },
  { id: "bci", name: "BCI" },
  { id: "bestado", name: "Banco Estado" },
  { id: "scotiabank", name: "Scotiabank" },
  { id: "itau", name: "Itau" },
  { id: "bice", name: "BICE" },
  { id: "edwards", name: "Edwards" },
] as const;

export type Bank = { id: string; name: string };

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Resolve the list of supported banks, falling back to hardcoded list. */
export async function loadBankList(): Promise<Bank[]> {
  try {
    const mod = await import("open-banking-chile");
    const banks: Bank[] = (mod.listBanks?.() ?? []).map((b: { id: string; name: string }) => ({
      id: b.id,
      name: b.name,
    }));
    if (banks.length > 0) return banks;
  } catch {
    // package not installed -- use fallback
  }
  return [...FALLBACK_BANKS];
}

/** Format banks as options for select UIs. */
export function toBankOptions(banks: Bank[]): { value: string; label: string }[] {
  return banks.map((b) => ({ value: b.id, label: b.name }));
}

/** Build the env-var key prefix for a bank (e.g. "bchile" -> "BCHILE"). */
export function envPrefix(bankId: string): string {
  return bankId.toUpperCase().replace(/-/g, "_");
}

/** Format credential lines for a .env file. */
export function formatEnvCredentials(bankId: string, rut: string, password: string): string {
  const prefix = envPrefix(bankId);
  return `${prefix}_RUT=${rut}\n${prefix}_PASS=${password}\n`;
}

/** Update or append a key=value pair in a .env file. */
export function upsertEnvLine(content: string, key: string, value: string): string {
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    return content.replace(regex, `${key}=${value}`);
  }
  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  return content + separator + `${key}=${value}\n`;
}

/** Write credentials to .env, updating existing keys instead of duplicating. */
export function writeEnvCredentials(
  envPath: string,
  bankId: string,
  rut: string,
  password: string,
): void {
  const prefix = envPrefix(bankId);
  let content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  content = upsertEnvLine(content, `${prefix}_RUT`, rut);
  content = upsertEnvLine(content, `${prefix}_PASS`, password);
  writeFileSync(envPath, content);
}

/** Insert an account row and return its id. */
export async function insertAccount(db: Db, bankId: string, bankName: string): Promise<number> {
  const result = await db.insert(accounts).values({ bankId, name: bankName }).returning();
  return result[0].id;
}

/** Scrape a bank and return the result, or null on failure. */
export async function scrapeBank(
  bankId: string,
  rut: string,
  password: string,
): Promise<{ movements: any[] } | null> {
  try {
    const mod = await import("open-banking-chile");
    const bank = mod.getBank?.(bankId);
    if (!bank) {
      logHandledError(new Error(`Banco "${bankId}" no encontrado.`), {
        source: "setup.scrapeBank",
        details: { bankId },
      });
      return null;
    }
    const result = await bank.scrape({ rut, password });
    if (!result?.success || !result.movements) {
      logHandledError(new Error(result?.error || "No se pudo conectar al banco"), {
        source: "setup.scrapeBank",
        details: { bankId },
      });
      return null;
    }
    return { movements: result.movements };
  } catch (err) {
    logHandledError(err, {
      source: "setup.scrapeBank",
      details: { bankId },
    });
    return null;
  }
}

/** Insert scraped movements into the DB. Returns count of new rows. */
export async function insertMovements(
  db: Db,
  accountId: number,
  movements: any[],
): Promise<number> {
  let imported = 0;

  for (const mv of movements) {
    if (shouldSkipMovement(mv)) continue;

    const date = convertDate(mv.date);
    const raw = mv.description;
    const clean = cleanDescription(raw);
    const hash = generateHash(accountId, date, raw, mv.amount);

    try {
      await db.insert(transactions).values({
        accountId,
        hash,
        date,
        rawDescription: raw,
        cleanDescription: clean,
        amount: mv.amount,
        balance: mv.balance ?? null,
        source: mv.source ?? null,
      });
      imported++;
    } catch {
      // duplicate hash -- skip
    }
  }
  return imported;
}

/** Try to run the categorize module if available. Returns count categorized. */
export async function tryCategorize(db: Db): Promise<{ count: number; warnings: string[] }> {
  const warnings: string[] = [];
  try {
    const { categorizeTransactions } = await import("../categorize/classify");
    const { loadConfig } = await import("../config");
    const config = loadConfig();
    const result = await categorizeTransactions(db, config);
    if (result.error) {
      logHandledError(new Error(result.error), {
        source: "setup.tryCategorize",
      });
      warnings.push(result.error);
    }
    return {
      count: result.fuzzyMatched + result.llmCategorized,
      warnings,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logHandledError(err, {
      source: "setup.tryCategorize",
    });
    warnings.push(`Error al categorizar: ${msg}`);
    return { count: 0, warnings };
  }
}

export interface ProviderOption {
  id: LLMProviderType;
  name: string;
  models: string[];
  envKey: string;
  baseUrl?: string;
}

export const PROVIDERS: ProviderOption[] = [
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    models: [
      "claude-sonnet-4-20250514",
      "claude-haiku-4-20250414",
      "claude-opus-4-20250514",
    ],
    envKey: "ANTHROPIC_API_KEY",
  },
  {
    id: "openai",
    name: "OpenAI",
    models: [
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
      "gpt-4o",
      "gpt-4o-mini",
      "o3-mini",
    ],
    envKey: "OPENAI_API_KEY",
  },
  {
    id: "google",
    name: "Google (Gemini)",
    models: [
      "gemini-2.5-flash-preview-05-20",
      "gemini-2.5-pro-preview-05-06",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
    ],
    envKey: "GOOGLE_API_KEY",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    models: [
      "anthropic/claude-sonnet-4",
      "openai/gpt-4.1",
      "google/gemini-2.5-flash-preview",
      "deepseek/deepseek-chat-v3-0324",
      "meta-llama/llama-4-maverick",
    ],
    envKey: "OPENAI_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  {
    id: "minimax",
    name: "MiniMax",
    models: [
      "MiniMax-M1",
      "MiniMax-T1",
    ],
    envKey: "OPENAI_API_KEY",
    baseUrl: "https://api.minimax.chat/v1",
  },
];

export type LLMProviderOption = ProviderOption;

export interface ActiveProviderConfig {
  provider: ProviderOption;
  model: string;
}

export type StartupState = "dashboard" | "missingProvider" | "missingAccount" | "full";

export function getActiveProviderConfig(): ActiveProviderConfig | null {
  const providerId = process.env.LLM_PROVIDER as LLMProviderType | undefined;
  const model = process.env.LLM_MODEL;
  if (!providerId || !model) return null;

  const provider = PROVIDERS.find((item) => item.id === providerId);
  if (!provider) return null;

  const apiKey = process.env[provider.envKey];
  if (!apiKey) return null;

  return { provider, model };
}

export function resolveStartupState(hasAccounts: boolean, hasProvider: boolean): StartupState {
  if (hasAccounts && hasProvider) return "dashboard";
  if (hasAccounts) return "missingProvider";
  if (hasProvider) return "missingAccount";
  return "full";
}

export function getStartupState(db: Db = getDb()): StartupState {
  const hasAccounts = db.select().from(accounts).all().length > 0;
  const hasProvider = getActiveProviderConfig() !== null;
  return resolveStartupState(hasAccounts, hasProvider);
}

export function saveModelConfig(
  envPath: string,
  provider: ProviderOption,
  model: string,
  apiKey: string,
): void {
  let content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  content = upsertEnvLine(content, "LLM_PROVIDER", provider.id);
  content = upsertEnvLine(content, "LLM_MODEL", model);
  content = upsertEnvLine(content, provider.envKey, apiKey);
  if (provider.baseUrl) {
    content = upsertEnvLine(content, "LLM_BASE_URL", provider.baseUrl);
  } else {
    content = upsertEnvLine(content, "LLM_BASE_URL", "");
  }
  writeFileSync(envPath, content);

  process.env.LLM_PROVIDER = provider.id;
  process.env.LLM_MODEL = model;
  process.env[provider.envKey] = apiKey;
  if (provider.baseUrl) {
    process.env.LLM_BASE_URL = provider.baseUrl;
  } else {
    delete process.env.LLM_BASE_URL;
  }
}
