import { eq } from "drizzle-orm";
import { transactions, categories, accounts, categorizationHistory } from "../db/schema";
import type { Db } from "../db/index";

/** Shape of a pending transaction joined with category and account info. */
export interface PendingTransaction {
  id: number;
  date: string;
  rawDescription: string;
  llmLabel: string | null;
  amount: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryEmoji: string | null;
  confidence: number | null;
  suggestedBy: string | null;
  accountAlias: string | null;
  bankId: string;
}

export interface CategoryRow {
  id: number;
  name: string;
  group: string;
  emoji: string;
}

/** Load all transactions with status='pending_review', joined with categories and accounts. */
export async function loadPendingTransactions(db: Db): Promise<PendingTransaction[]> {
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      rawDescription: transactions.rawDescription,
      llmLabel: transactions.llmLabel,
      amount: transactions.amount,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryEmoji: categories.emoji,
      confidence: transactions.confidence,
      suggestedBy: transactions.suggestedBy,
      accountAlias: accounts.name,
      bankId: accounts.bankId,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(eq(transactions.status, "pending_review"));

  return rows;
}

/** Load all categories. */
export async function loadCategories(db: Db): Promise<CategoryRow[]> {
  const rows = await db
    .select({ id: categories.id, name: categories.name, group: categories.group, emoji: categories.emoji })
    .from(categories);
  return rows;
}

/** Confirm a single transaction: set status='confirmed', write categorization_history. */
export async function confirmTransaction(db: Db, txn: PendingTransaction): Promise<void> {
  await db
    .update(transactions)
    .set({ status: "confirmed" })
    .where(eq(transactions.id, txn.id));

  if (txn.categoryId != null) {
    await db.insert(categorizationHistory).values({
      transactionId: txn.id,
      newCategoryId: txn.categoryId,
      changedBy: txn.suggestedBy === "human" ? "human" : "review_confirm",
    });
  }
}

/** Batch confirm all given transactions. */
export async function confirmAll(db: Db, txns: PendingTransaction[]): Promise<number> {
  for (const txn of txns) {
    await confirmTransaction(db, txn);
  }
  return txns.length;
}

/** Edit a transaction's category (human override). */
export async function editCategory(
  db: Db,
  transactionId: number,
  newCategoryId: number,
): Promise<void> {
  await db
    .update(transactions)
    .set({
      categoryId: newCategoryId,
      suggestedBy: "human",
      confidence: null,
    })
    .where(eq(transactions.id, transactionId));

  await db.insert(categorizationHistory).values({
    transactionId,
    newCategoryId,
    changedBy: "human",
  });
}

export { formatCLP as formatAmount } from "./format";

/** Format confidence as percentage or "-" if null. */
export function formatConfidence(confidence: number | null): string {
  if (confidence == null) return "-";
  return `${Math.round(confidence * 100)}%`;
}

/** Get the display description: llmLabel if available, otherwise rawDescription. */
export function displayDescription(txn: PendingTransaction): string {
  return txn.llmLabel || txn.rawDescription;
}
