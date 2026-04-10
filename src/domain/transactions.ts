import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db/index";
import { categories, categorizationHistory, transactions } from "../db/schema";
import { queryTransactions, type TransactionRow, type FilterState } from "../tui/queries";

export interface TransactionUpdateInput {
  categoryId?: number | null;
  llmLabel?: string | null;
  status?: string;
  source?: string | null;
}

export function findTransactions(db: Db, filters: FilterState): TransactionRow[] {
  return queryTransactions(db, filters);
}

export async function getTransactionById(db: Db, id: number): Promise<TransactionRow | null> {
  const rows = queryTransactions(db, {});
  return rows.find((row) => row.id === id) ?? null;
}

export async function resolveCategoryId(
  db: Db,
  options: { categoryId?: number | null; categoryName?: string },
): Promise<number | null | undefined> {
  if (options.categoryId !== undefined) {
    return options.categoryId;
  }

  if (!options.categoryName) return undefined;

  const category = await db.select().from(categories).where(eq(categories.name, options.categoryName)).get();
  if (!category) {
    throw new Error(`Categoria no encontrada: ${options.categoryName}`);
  }
  return category.id;
}

export async function updateTransaction(
  db: Db,
  transactionId: number,
  updates: TransactionUpdateInput,
): Promise<void> {
  const current = await db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
  if (!current) {
    throw new Error(`Transaccion con ID ${transactionId} no encontrada.`);
  }

  await db.update(transactions).set(updates).where(eq(transactions.id, transactionId));

  if (updates.categoryId !== undefined && updates.categoryId !== current.categoryId && updates.categoryId !== null) {
    await db.insert(categorizationHistory).values({
      transactionId,
      oldCategoryId: current.categoryId,
      newCategoryId: updates.categoryId,
      changedBy: "human",
    });
  }
}

export async function updateTransactions(
  db: Db,
  transactionIds: number[],
  updates: TransactionUpdateInput,
): Promise<number> {
  if (transactionIds.length === 0) return 0;

  const existing = await db.select().from(transactions).where(inArray(transactions.id, transactionIds)).all();
  const existingIds = new Set(existing.map((row) => row.id));
  const missingIds = transactionIds.filter((id) => !existingIds.has(id));
  if (missingIds.length > 0) {
    throw new Error(`Transacciones no encontradas: ${missingIds.join(", ")}`);
  }

  for (const id of transactionIds) {
    await updateTransaction(db, id, updates);
  }

  return transactionIds.length;
}

export async function getTransactionIdsForFilters(db: Db, filters: FilterState): Promise<number[]> {
  return queryTransactions(db, filters).map((row) => row.id);
}
