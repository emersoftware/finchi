import type { Flags } from "../cli";
import type { Db } from "../db";
import { accounts, transactions } from "../db/schema";
import { PROVIDERS } from "../flows/setup";
import { generateHash } from "../sync/dedup";
import type { SetupMode, SetupRunOptions } from "../tui/setup";

export interface DevScenarioOptions {
  withAccount: boolean;
  withProvider: boolean;
  withTransactions: boolean;
  emptyImport: boolean;
  setupMode?: SetupMode;
}

const DEV_PROVIDER = {
  provider: PROVIDERS.find((provider) => provider.id === "openai")!,
  model: "gpt-4.1-mini",
  apiKey: "dev-openai-key",
} as const;

const DEV_IMPORT_MOVEMENTS = [
  {
    date: "09-04-2026",
    description: "COMPRA DEMO CAFETERIA",
    amount: -6500,
    balance: 245000,
    source: "account",
  },
  {
    date: "08-04-2026",
    description: "PAGO DEMO SUSCRIPCION",
    amount: -12990,
    balance: 251500,
    source: "account",
  },
] as const;

export function parseDevScenarioFlags(flags: Flags): DevScenarioOptions {
  const setupModeFlag = flags["setup-mode"];
  return {
    withAccount: flags["with-account"] === true,
    withProvider: flags["with-provider"] === true,
    withTransactions: flags["with-transactions"] === true,
    emptyImport: flags["empty-import"] === true,
    setupMode: typeof setupModeFlag === "string" ? setupModeFlag as SetupMode : undefined,
  };
}

export function isDevScenarioMode(options: DevScenarioOptions): boolean {
  return options.withAccount || options.withProvider || options.withTransactions || options.emptyImport || !!options.setupMode;
}

export function validateDevScenarioOptions(options: DevScenarioOptions): string | null {
  if (options.setupMode && !["full", "bank", "model"].includes(options.setupMode)) {
    return "setup-mode debe ser full, bank o model.";
  }
  if (options.withTransactions && !options.withAccount) {
    return "with-transactions requiere with-account.";
  }
  if (options.emptyImport && !options.setupMode) {
    return "empty-import requiere setup-mode bank o full.";
  }
  if (options.emptyImport && options.setupMode === "model") {
    return "empty-import no aplica a setup-mode model.";
  }
  return null;
}

function clearProviderEnv() {
  delete process.env.LLM_PROVIDER;
  delete process.env.LLM_MODEL;
  delete process.env.LLM_BASE_URL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GOOGLE_API_KEY;
}

function applyProviderEnv(enabled: boolean) {
  clearProviderEnv();
  if (!enabled) return;
  process.env.LLM_PROVIDER = DEV_PROVIDER.provider.id;
  process.env.LLM_MODEL = DEV_PROVIDER.model;
  process.env[DEV_PROVIDER.provider.envKey] = DEV_PROVIDER.apiKey;
}

async function seedScenarioAccount(db: Db): Promise<number> {
  const row = await db.insert(accounts).values({
    bankId: "banco-dev",
    name: "Cuenta Demo",
  }).returning();
  return row[0].id;
}

function seedScenarioTransactions(db: Db, accountId: number) {
  DEV_IMPORT_MOVEMENTS.forEach((movement, index) => {
    db.insert(transactions).values({
      accountId,
      hash: generateHash(accountId, `2026-04-0${9 - index}`, `${movement.description}|${index}`, movement.amount),
      date: `2026-04-0${9 - index}`,
      rawDescription: movement.description,
      cleanDescription: movement.description.toLowerCase(),
      amount: movement.amount,
      balance: movement.balance,
      source: movement.source,
      status: "uncategorized",
    }).run();
  });
}

export async function prepareDevScenario(db: Db, options: DevScenarioOptions): Promise<SetupRunOptions> {
  applyProviderEnv(options.withProvider);

  if (options.withAccount) {
    const accountId = await seedScenarioAccount(db);
    if (options.withTransactions) {
      seedScenarioTransactions(db, accountId);
    }
  }

  const inMemoryWriteEnv = () => {};
  const inMemorySaveModelConfig: NonNullable<SetupRunOptions["saveModelConfig"]> = (_envPath, provider, model, apiKey) => {
    clearProviderEnv();
    process.env.LLM_PROVIDER = provider.id;
    process.env.LLM_MODEL = model;
    process.env[provider.envKey] = apiKey;
  };

  return {
    db,
    envPath: null,
    activeProviderConfig: options.withProvider
      ? { provider: DEV_PROVIDER.provider, model: DEV_PROVIDER.model }
      : null,
    writeEnvCredentials: inMemoryWriteEnv,
    saveModelConfig: inMemorySaveModelConfig,
    scrapeBank: async () => ({ movements: options.emptyImport ? [] : [...DEV_IMPORT_MOVEMENTS] }),
    tryCategorize: async () => ({
      count: options.emptyImport ? 0 : DEV_IMPORT_MOVEMENTS.length,
      warnings: [],
    }),
  };
}
