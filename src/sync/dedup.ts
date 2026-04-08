/**
 * Generate deterministic SHA-256 hashes for transaction deduplication.
 */

/** Generate a SHA-256 hash from accountId, date, description, and amount. */
export function generateHash(accountId: number, date: string, description: string, amount: number): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(`${accountId}|${date}|${description}|${amount}`);
  return hasher.digest("hex");
}
