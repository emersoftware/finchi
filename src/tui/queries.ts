import { eq, and, gte, inArray, lte, sql } from "drizzle-orm";
import { transactions, categories, accounts } from "../db/schema.js";
import type { Db } from "../db/index.js";

export interface FilterState {
  from?: string;
  to?: string;
  categoryId?: number;
  categoryIds?: number[];
  accountId?: number;
  accountIds?: number[];
  search?: string;
  groupName?: string;
  groupNames?: string[];
  type?: "income" | "expense";
  amountTypes?: Array<"income" | "expense">;
  source?: string;
  sources?: string[];
}

export interface TransactionRow {
  id: number;
  date: string;
  rawDescription: string;
  llmLabel: string | null;
  amount: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryGroup: string | null;
  emoji: string | null;
  excludeFromSummary: boolean | null;
  accountName: string;
  source: string | null;
  status: string;
}

export function queryTransactions(db: Db, filters: FilterState): TransactionRow[] {
  const conditions = [];
  const categoryIds = filters.categoryIds?.length ? filters.categoryIds : filters.categoryId !== undefined ? [filters.categoryId] : undefined;
  const accountIds = filters.accountIds?.length ? filters.accountIds : filters.accountId !== undefined ? [filters.accountId] : undefined;
  const groupNames = filters.groupNames?.length ? filters.groupNames : filters.groupName ? [filters.groupName] : undefined;
  const amountTypes = filters.amountTypes?.length ? filters.amountTypes : filters.type ? [filters.type] : undefined;
  const sources = filters.sources?.length ? filters.sources : filters.source ? [filters.source] : undefined;

  if (filters.from) {
    conditions.push(gte(transactions.date, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(transactions.date, filters.to));
  }
  if (categoryIds) {
    conditions.push(inArray(transactions.categoryId, categoryIds));
  }
  if (accountIds) {
    conditions.push(inArray(transactions.accountId, accountIds));
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      sql`(${transactions.rawDescription} LIKE ${term} OR ${transactions.cleanDescription} LIKE ${term} OR ${transactions.llmLabel} LIKE ${term})`,
    );
  }
  if (groupNames) {
    conditions.push(inArray(categories.group, groupNames));
  }
  if (amountTypes?.length === 1 && amountTypes[0] === "expense") {
    conditions.push(sql`${transactions.amount} < 0`);
  } else if (amountTypes?.length === 1 && amountTypes[0] === "income") {
    conditions.push(sql`${transactions.amount} > 0`);
  }
  if (sources) {
    conditions.push(inArray(transactions.source, sources));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select({
      id: transactions.id,
      date: transactions.date,
      rawDescription: transactions.rawDescription,
      llmLabel: transactions.llmLabel,
      amount: transactions.amount,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryGroup: categories.group,
      emoji: categories.emoji,
      excludeFromSummary: categories.excludeFromSummary,
      accountName: accounts.name,
      source: transactions.source,
      status: transactions.status,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(whereClause)
    .orderBy(sql`${transactions.date} DESC, ${transactions.id} DESC`)
    .all();

  return rows;
}

export function queryCategories(db: Db): Array<{ id: number; name: string; group: string }> {
  return db.select({ id: categories.id, name: categories.name, group: categories.group }).from(categories).all();
}

export function queryAccounts(db: Db): Array<{ id: number; name: string }> {
  return db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .all();
}

export function queryGroups(db: Db): string[] {
  const rows = db
    .selectDistinct({ group: categories.group })
    .from(categories)
    .where(sql`${categories.group} != ''`)
    .all();
  return rows.map((r) => r.group);
}

export function querySources(db: Db): string[] {
  const rows = db
    .selectDistinct({ source: transactions.source })
    .from(transactions)
    .where(sql`${transactions.source} IS NOT NULL AND ${transactions.source} != ''`)
    .all();
  return rows.map((r) => r.source).filter((source): source is string => Boolean(source));
}
