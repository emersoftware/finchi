import { distance } from "fastest-levenshtein";
import { eq, and, isNotNull } from "drizzle-orm";
import { transactions } from "../db/schema";
import type { Db } from "../db";

export interface ConfirmedPattern {
  cleanDescription: string;
  categoryId: number;
}

export interface FuzzyResult {
  categoryId: number;
  similarity: number;
}

/** Compare a description against confirmed patterns and return the best match above threshold. */
export function fuzzyMatch(
  cleanDescription: string,
  confirmedPatterns: ConfirmedPattern[],
  threshold: number,
): FuzzyResult | null {
  let bestMatch: FuzzyResult | null = null;

  for (const pattern of confirmedPatterns) {
    const similarity = computeSimilarity(cleanDescription, pattern.cleanDescription);
    if (similarity >= threshold && (bestMatch === null || similarity > bestMatch.similarity)) {
      bestMatch = { categoryId: pattern.categoryId, similarity };
    }
  }

  return bestMatch;
}

/** Compute normalized similarity between two strings (1 = identical, 0 = completely different). */
export function computeSimilarity(a: string, b: string): number {
  const normalizedA = a.toLowerCase().trim();
  const normalizedB = b.toLowerCase().trim();

  if (normalizedA === normalizedB) return 1;

  const maxLen = Math.max(normalizedA.length, normalizedB.length);
  if (maxLen === 0) return 1;

  return 1 - distance(normalizedA, normalizedB) / maxLen;
}

/** Query confirmed transactions and return the most frequent category per unique description. */
export function getConfirmedPatterns(db: Db): ConfirmedPattern[] {
  const rows = db
    .select({
      cleanDescription: transactions.cleanDescription,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(and(eq(transactions.status, "confirmed"), isNotNull(transactions.categoryId)))
    .all();

  const descriptionCounts = new Map<string, Map<number, number>>();

  for (const row of rows) {
    if (row.categoryId === null) continue;

    const key = row.cleanDescription;
    if (!descriptionCounts.has(key)) {
      descriptionCounts.set(key, new Map());
    }
    const counts = descriptionCounts.get(key)!;
    counts.set(row.categoryId, (counts.get(row.categoryId) || 0) + 1);
  }

  const patterns: ConfirmedPattern[] = [];
  for (const [cleanDescription, counts] of descriptionCounts) {
    let bestCategoryId = 0;
    let bestCount = 0;
    for (const [categoryId, count] of counts) {
      if (count > bestCount) {
        bestCategoryId = categoryId;
        bestCount = count;
      }
    }
    patterns.push({ cleanDescription, categoryId: bestCategoryId });
  }

  return patterns;
}
