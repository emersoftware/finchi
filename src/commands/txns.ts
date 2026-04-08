import { getDb } from "../db/index";
import { transactions, categories } from "../db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import type { Flags } from "../cli";
import type { Db } from "../db/index";
import { formatCLP, truncate } from "../tui/format";

interface TxnRow {
  date: string;
  description: string;
  amount: number;
  categoryName: string | null;
  status: string;
}

/** Query transactions with optional filters. Accepts an injected db for testing. */
export async function queryTransactions(
  flags: Flags,
  db: Db = getDb(),
): Promise<TxnRow[]> {
  const conditions: ReturnType<typeof eq>[] = [];

  if (flags["uncategorized"]) {
    conditions.push(eq(transactions.status, "uncategorized"));
  }

  if (typeof flags["from"] === "string") {
    conditions.push(gte(transactions.date, flags["from"]));
  }

  if (typeof flags["to"] === "string") {
    conditions.push(lte(transactions.date, flags["to"]));
  }

  if (typeof flags["category"] === "string") {
    const catName = flags["category"].toLowerCase();
    conditions.push(
      eq(sql`lower(${categories.name})`, catName),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      date: transactions.date,
      rawDescription: transactions.rawDescription,
      llmLabel: transactions.llmLabel,
      amount: transactions.amount,
      categoryName: categories.name,
      status: transactions.status,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(where)
    .orderBy(transactions.date);

  return rows.map((r) => ({
    date: r.date,
    description: r.llmLabel || r.rawDescription,
    amount: r.amount,
    categoryName: r.categoryName,
    status: r.status,
  }));
}

/** Print a formatted transaction table to stdout. */
export function printTable(rows: TxnRow[]): void {
  if (rows.length === 0) {
    console.log("No se encontraron transacciones.");
    return;
  }

  const col = (v: string, len: number) => truncate(v, len).padEnd(len);
  const header = `${col("Fecha", 12)}${col("Descripcion", 35)}${col("Monto", 14)}${col("Categoria", 20)}${col("Estado", 16)}`;
  console.log(header);
  console.log("-".repeat(header.length));

  for (const row of rows) {
    const line = `${col(row.date, 12)}${col(row.description, 35)}${col(formatCLP(row.amount), 14)}${col(row.categoryName || "-", 20)}${col(row.status, 16)}`;
    console.log(line);
  }

  console.log(`\nTotal: ${rows.length} transaccion${rows.length === 1 ? "" : "es"}`);
}

export async function run(flags: Flags): Promise<void> {
  const rows = await queryTransactions(flags);
  printTable(rows);
}
