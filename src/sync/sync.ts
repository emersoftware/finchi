/**
 * Orchestrate the full bank sync flow: scrape, normalize, dedup, and insert.
 */

import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { accounts, transactions } from "../db/schema";
import { getBankCredentials } from "../config";
import { scrapeBank } from "./bank-client";
import { cleanDescription, convertDate, shouldSkipMovement } from "./normalize";
import { generateHash } from "./dedup";

export interface SyncResult {
  accountId: number;
  bankId: string;
  imported: number;
  skipped: number;
  total: number;
  error?: string;
}

/** Sync a single account: scrape bank, normalize movements, insert new transactions. */
export async function syncAccount(
  accountId: number,
  db: Db,
  onProgress?: (step: string) => void,
): Promise<SyncResult> {
  const account = await db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) {
    throw new Error(`Cuenta con ID ${accountId} no encontrada.`);
  }

  const credentials = getBankCredentials(account.bankId);
  if (!credentials) {
    throw new Error(
      `Credenciales no configuradas para banco "${account.bankId}". ` +
        `Define ${account.bankId.toUpperCase().replace(/-/g, "_")}_RUT y _PASS en .env`,
    );
  }

  const result = await scrapeBank(account.bankId, credentials, onProgress);

  if (!result.success) {
    return {
      accountId,
      bankId: account.bankId,
      imported: 0,
      skipped: 0,
      total: 0,
      error: result.error || "Error desconocido al sincronizar",
    };
  }

  const normalized = result.movements
    .filter((movement) => !shouldSkipMovement(movement))
    .map((movement) => {
      const date = convertDate(movement.date);
      const raw = movement.description;
      return {
        date,
        raw,
        clean: cleanDescription(raw),
        hash: generateHash(accountId, date, raw, movement.amount),
        amount: movement.amount,
        balance: movement.balance,
        source: movement.source,
      };
    });

  const allHashes = normalized.map((m) => m.hash);
  const existingRows = allHashes.length > 0
    ? await db.select({ hash: transactions.hash }).from(transactions).where(inArray(transactions.hash, allHashes)).all()
    : [];
  const existingHashes = new Set(existingRows.map((r) => r.hash));

  const toInsert = normalized.filter((m) => !existingHashes.has(m.hash));

  for (const m of toInsert) {
    await db.insert(transactions).values({
      accountId,
      hash: m.hash,
      date: m.date,
      rawDescription: m.raw,
      cleanDescription: m.clean,
      amount: m.amount,
      balance: m.balance,
      source: m.source,
      status: "uncategorized",
    });
  }

  return {
    accountId,
    bankId: account.bankId,
    imported: toInsert.length,
    skipped: normalized.length - toInsert.length,
    total: result.movements.length,
  };
}

/** Sync all accounts in the database. */
export async function syncAllAccounts(
  db: Db,
  onProgress?: (step: string) => void,
): Promise<SyncResult[]> {
  const allAccounts = await db.select().from(accounts).all();
  const results: SyncResult[] = [];

  for (const account of allAccounts) {
    try {
      const result = await syncAccount(account.id, db, onProgress);
      results.push(result);
    } catch (error) {
      results.push({
        accountId: account.id,
        bankId: account.bankId,
        imported: 0,
        skipped: 0,
        total: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
