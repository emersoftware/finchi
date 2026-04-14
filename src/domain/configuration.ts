import { existsSync, readFileSync, writeFileSync } from "fs";
import { eq } from "drizzle-orm";
import type { Db } from "../db/index";
import { accounts, categories } from "../db/schema";
import { getEnvPath } from "../config";
import {
  getActiveProviderConfig,
  loadBankList,
  PROVIDERS,
  saveModelConfig,
  upsertEnvLine,
  writeEnvCredentials,
} from "../flows/setup";

export interface ProviderSnapshot {
  providerId: string;
  model: string;
  envKey: string;
  baseUrl?: string;
}

function readEnvContent(envPath: string): string {
  return existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
}

function removeEnvLine(content: string, key: string): string {
  return content
    .split("\n")
    .filter((line) => !line.startsWith(`${key}=`) && line.trim() !== "")
    .join("\n")
    .trim();
}

export async function listSupportedBanks() {
  return loadBankList();
}

export function listProviders() {
  return PROVIDERS;
}

export function getProviderSnapshot(): ProviderSnapshot | null {
  const active = getActiveProviderConfig();
  if (!active) return null;
  return {
    providerId: active.provider.id,
    model: active.model,
    envKey: active.provider.envKey,
    baseUrl: active.provider.baseUrl,
  };
}

export function setProviderConfig(
  envPath: string,
  providerId: string,
  model: string,
  apiKey: string,
  baseUrl?: string,
): ProviderSnapshot {
  const provider = PROVIDERS.find((item) => item.id === providerId);
  if (!provider) throw new Error(`Provider no soportado: ${providerId}`);

  saveModelConfig(envPath, provider, model, apiKey);

  if (baseUrl !== undefined) {
    let content = readEnvContent(envPath);
    content = upsertEnvLine(content, "LLM_BASE_URL", baseUrl);
    writeFileSync(envPath, content.endsWith("\n") ? content : `${content}\n`);
    process.env.LLM_BASE_URL = baseUrl;
  }

  return {
    providerId: provider.id,
    model,
    envKey: provider.envKey,
    baseUrl: baseUrl ?? provider.baseUrl,
  };
}

export function clearProviderConfig(envPath: string): void {
  const keys = ["LLM_PROVIDER", "LLM_MODEL", "LLM_BASE_URL", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY"];
  let content = readEnvContent(envPath);
  for (const key of keys) {
    content = removeEnvLine(content, key);
    delete process.env[key];
  }
  if (content) {
    writeFileSync(envPath, `${content}\n`);
  } else {
    writeFileSync(envPath, "");
  }
}

export async function listAccounts(db: Db) {
  return db.select().from(accounts).all();
}

export async function addAccount(
  db: Db,
  options: {
    bankId: string;
    name: string;
    rut: string;
    password: string;
    envPath?: string | null;
  },
): Promise<{ id: number; bankId: string; name: string; savedCredentials: "env" | "memory" }> {
  const result = await db.insert(accounts).values({ bankId: options.bankId, name: options.name }).returning();
  if (options.envPath !== null) {
    const target = options.envPath ?? getEnvPath();
    writeEnvCredentials(target, options.bankId, options.rut, options.password);
  }
  const prefix = options.bankId.toUpperCase().replace(/-/g, "_");
  process.env[`${prefix}_RUT`] = options.rut;
  process.env[`${prefix}_PASS`] = options.password;
  return {
    id: result[0].id,
    bankId: options.bankId,
    name: options.name,
    savedCredentials: options.envPath === null ? "memory" : "env",
  };
}

export async function renameAccount(db: Db, id: number, name: string) {
  const result = await db.update(accounts).set({ name }).where(eq(accounts.id, id)).returning();
  if (result.length === 0) throw new Error(`Cuenta con ID ${id} no encontrada.`);
  return result[0];
}

export async function removeAccount(db: Db, id: number) {
  const account = await db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!account) throw new Error(`Cuenta con ID ${id} no encontrada.`);
  await db.delete(accounts).where(eq(accounts.id, id));
  return account;
}

export async function listCategories(db: Db, group?: string) {
  const rows = await db.select().from(categories).all();
  return group ? rows.filter((row) => row.group === group) : rows;
}

export async function getCategory(db: Db, id: number) {
  const category = await db.select().from(categories).where(eq(categories.id, id)).get();
  if (!category) throw new Error(`Categoria con ID ${id} no encontrada.`);
  return category;
}

export async function addCategory(
  db: Db,
  input: { name: string; group: string; emoji?: string; excludeFromSummary?: boolean },
) {
  const result = await db.insert(categories).values({
    name: input.name,
    group: input.group,
    emoji: input.emoji ?? "",
    excludeFromSummary: input.excludeFromSummary ?? false,
  }).returning();
  return result[0];
}

export async function updateCategory(
  db: Db,
  id: number,
  input: { name?: string; group?: string; emoji?: string; excludeFromSummary?: boolean },
) {
  const result = await db.update(categories).set(input).where(eq(categories.id, id)).returning();
  if (result.length === 0) throw new Error(`Categoria con ID ${id} no encontrada.`);
  return result[0];
}

export async function listCategoryGroups(db: Db): Promise<string[]> {
  const rows = await db.selectDistinct({ group: categories.group }).from(categories).all();
  return rows.map((row) => row.group).filter(Boolean).sort((a, b) => a.localeCompare(b));
}
