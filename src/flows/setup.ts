import * as p from "@clack/prompts";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { getDb, type Db } from "../db/index";
import { accounts, transactions } from "../db/schema";
import { cleanDescription, convertDate, shouldSkipMovement } from "../sync/normalize";
import { generateHash } from "../sync/dedup";
import { printLogo } from "../tui/logo";
import { spinner } from "../tui/spinner";

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

/** Format banks as options for clack select. */
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
async function scrapeBank(
  bankId: string,
  rut: string,
  password: string,
): Promise<{ movements: any[] } | null> {
  try {
    const mod = await import("open-banking-chile");
    const bank = mod.getBank?.(bankId);
    if (!bank) return null;
    const result = await bank.scrape({ rut, password });
    if (!result?.success || !result.movements) return null;
    return { movements: result.movements };
  } catch {
    return null;
  }
}

/** Insert scraped movements into the DB. Returns count of new rows. */
async function insertMovements(
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
async function tryCategorize(db: Db): Promise<number> {
  try {
    const { categorizeTransactions } = await import("../categorize/classify");
    const { loadConfig } = await import("../config");
    const config = loadConfig();
    const result = await categorizeTransactions(db, config);
    if (result.error) {
      p.log.warning(result.error);
    }
    return result.fuzzyMatched + result.llmCategorized;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    p.log.warning(`Error al categorizar: ${msg}`);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

export async function runSetup(): Promise<void> {
  printLogo();
  p.intro("Configuracion inicial");

  // Step 1 -- bank selection
  const banks = await loadBankList();
  const bankId = await p.select({
    message: "Selecciona tu banco",
    options: toBankOptions(banks),
  });
  if (p.isCancel(bankId)) {
    p.cancel("Setup cancelado.");
    return;
  }

  const selectedBank = banks.find((b) => b.id === bankId)!;

  // Step 2 -- RUT
  const rut = await p.text({
    message: "Ingresa tu RUT (ej: 12345678-9)",
    validate: (val) => {
      if (!val || val.trim().length === 0) return "El RUT es obligatorio";
    },
  });
  if (p.isCancel(rut)) {
    p.cancel("Setup cancelado.");
    return;
  }

  // Step 3 -- password
  const password = await p.password({
    message: "Ingresa tu clave de internet",
    validate: (val) => {
      if (!val || val.length === 0) return "La clave es obligatoria";
    },
  });
  if (p.isCancel(password)) {
    p.cancel("Setup cancelado.");
    return;
  }

  // Step 4 -- how to save credentials
  const saveMode = await p.select({
    message: "¿Como quieres guardar las credenciales?",
    options: [
      { value: "env", label: "Guardar en .env" },
      { value: "memory", label: "Solo usar esta vez" },
    ],
  });
  if (p.isCancel(saveMode)) {
    p.cancel("Setup cancelado.");
    return;
  }

  if (saveMode === "env") {
    writeEnvCredentials(".env", bankId, rut, password);
    p.log.success("Credenciales guardadas en .env");
  }

  // Step 5 -- insert account into DB
  const db = getDb();
  const accountId = await insertAccount(db, bankId, selectedBank.name);
  p.log.success(`Cuenta creada: ${selectedBank.name}`);

  // Step 6 -- scrape bank (single scrape used for both test and import)
  const s1 = spinner();
  s1.start("Conectando al banco e importando transacciones...");
  const scrapeResult = await scrapeBank(bankId, rut, password);
  let importedCount = 0;
  if (scrapeResult) {
    importedCount = await insertMovements(db, accountId, scrapeResult.movements);
    s1.stop(`${importedCount} transacciones importadas`);
  } else {
    s1.stop("No se pudo conectar al banco");

    const retry = await p.confirm({
      message: "Quieres intentar de nuevo?",
      initialValue: true,
    });
    if (p.isCancel(retry) || !retry) {
      p.log.warning("Cuenta guardada. Puedes sincronizar despues con 'finchi sync'.");
      p.outro("Ejecuta 'finchi sync' cuando estes listo.");
      return;
    }

    // Retry once
    const s2 = spinner();
    s2.start("Reintentando conexion...");
    const retryResult = await scrapeBank(bankId, rut, password);
    if (retryResult) {
      importedCount = await insertMovements(db, accountId, retryResult.movements);
      s2.stop(`${importedCount} transacciones importadas`);
    } else {
      s2.stop("No se pudo conectar");
      p.log.warning("Cuenta guardada. Puedes sincronizar despues con 'finchi sync'.");
      p.outro("Ejecuta 'finchi sync' cuando estes listo.");
      return;
    }
  }

  if (importedCount === 0) {
    p.log.warning("No se encontraron transacciones nuevas.");
    p.outro("Ejecuta 'finchi sync' mas tarde para importar.");
    return;
  }

  // Step 7 -- LLM provider setup for categorization
  const wantsCategorize = await p.confirm({
    message: `Quieres categorizar las ${importedCount} transacciones con IA?`,
    initialValue: true,
  });
  if (p.isCancel(wantsCategorize)) {
    p.cancel("Setup cancelado.");
    return;
  }

  let categorizedCount = 0;
  if (wantsCategorize) {
    // Delegate to setup-model flow
    const { run: setupModel } = await import("../commands/setup-model");
    await setupModel({});

    const s3 = spinner();
    s3.start("Categorizando transacciones...");
    categorizedCount = await tryCategorize(db);
    s3.stop(`${categorizedCount} transacciones categorizadas`);
  }

  // Step 8 -- summary and launch dashboard
  p.note(
    `${importedCount} transacciones importadas\n${categorizedCount} categorizadas`,
    "Resumen",
  );
  p.outro("Setup completo!");

  // Launch dashboard
  const { render } = await import("ink");
  const React = (await import("react")).default;
  const { DashboardApp } = await import("../tui/app");
  const { waitUntilExit } = render(React.createElement(DashboardApp, { db }));
  await waitUntilExit();
}
