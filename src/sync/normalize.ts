/**
 * Normalize raw bank descriptions and dates for consistent storage and matching.
 */

/** Clean a raw bank description into a normalized form for fuzzy matching. */
export function cleanDescription(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Convert a bank date (dd-mm-yyyy) to DB format (YYYY-MM-DD). */
export function convertDate(bankDate: string): string {
  const [day, month, year] = bankDate.split("-");
  return `${year}-${month}-${day}`;
}

/**
 * Check if a bank movement should be skipped during import.
 * Filters out internal/summary transactions that cause double-counting:
 * - Positive credit_card_billed amounts (payment receipts like "Pago Pesos TEF", "TOTAL PAGOS A LA CUENTA")
 */
export function shouldSkipMovement(movement: { amount: number; source?: string; description?: string }): boolean {
  // Positive credit card billed = payment received by the card, already captured as account debit
  if (movement.source === "credit_card_billed" && movement.amount > 0) {
    return true;
  }
  return false;
}
