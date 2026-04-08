/**
 * Wrap open-banking-chile scrapers for finchi consumption.
 */

import { getBank, listBanks } from "open-banking-chile";
import type { ScrapeResult } from "open-banking-chile";

/** Get a bank scraper by ID, or throw if not found. */
export function getBankClient(bankId: string) {
  const bank = getBank(bankId);
  if (!bank) {
    throw new Error(`Banco "${bankId}" no encontrado. Usa getAvailableBanks() para ver los disponibles.`);
  }
  return bank;
}

/** Scrape a bank account and return the result. */
export async function scrapeBank(
  bankId: string,
  credentials: { rut: string; password: string },
  onProgress?: (step: string) => void,
): Promise<ScrapeResult> {
  const bank = getBankClient(bankId);
  return bank.scrape({
    rut: credentials.rut,
    password: credentials.password,
    onProgress,
  });
}

/** List all available bank IDs and names. */
export function getAvailableBanks() {
  return listBanks();
}
