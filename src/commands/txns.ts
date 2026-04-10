import type { Flags } from "../cli";
import { getDb, type Db } from "../db/index";
import type { FilterState, TransactionRow } from "../tui/queries";
import {
  queryTransactions as queryDashboardTransactions,
  queryCategories,
  queryAccounts,
  queryGroups,
  querySources,
} from "../tui/queries";
import { formatCLP, getMonthRange, truncate } from "../tui/format";
import { getFlagString, getFlagStrings, hasFlag } from "../cli-flags";
import { wantsJson, printJsonSuccess } from "../cli-output";
import { resolveDateWindow } from "../cli-dates";

function parseNumberList(values: string[]): number[] {
  return values.flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) {
        throw new Error(`Valor numerico invalido: ${value}`);
      }
      return parsed;
    });
}

export function buildTransactionFilters(flags: Flags): FilterState {
  const dateWindow = resolveDateWindow(flags);
  const month = getFlagString(flags, "month");
  const categoryIds = parseNumberList(getFlagStrings(flags, "category-id"));
  const accountIds = parseNumberList(getFlagStrings(flags, "account-id"));
  const groups = getFlagStrings(flags, "group");
  const sources = getFlagStrings(flags, "source");

  const filters: FilterState = {
    from: dateWindow.from,
    to: dateWindow.to,
    categoryIds: categoryIds.length ? categoryIds : undefined,
    categoryName: getFlagString(flags, "category"),
    accountIds: accountIds.length ? accountIds : undefined,
    accountName: getFlagString(flags, "account"),
    groupNames: groups.length ? groups : undefined,
    sources: sources.length ? sources : undefined,
    search: getFlagString(flags, "search"),
    status: getFlagString(flags, "status") as FilterState["status"] | undefined,
    type: getFlagString(flags, "type") as FilterState["type"] | undefined,
  };

  if (hasFlag(flags, "uncategorized")) {
    filters.status = "uncategorized";
  }

  if (month) {
    const [year, monthPart] = month.split("-").map(Number);
    const range = getMonthRange(year, monthPart);
    filters.from = range.from;
    filters.to = range.to;
  }

  return filters;
}

/** Query transactions with CLI filters. Accepts an injected db for testing. */
export async function queryTransactions(
  flags: Flags,
  db: Db = getDb(),
): Promise<Array<TransactionRow & { description: string }>> {
  return queryDashboardTransactions(db, buildTransactionFilters(flags))
    .map((row) => ({
      ...row,
      description: row.llmLabel || row.rawDescription,
    }));
}

/** Print a formatted transaction table to stdout. */
export function printTable(rows: Array<Partial<TransactionRow> & { description?: string; date: string; amount: number; categoryName: string | null; status: string }>): void {
  if (rows.length === 0) {
    console.log("No se encontraron transacciones.");
    return;
  }

  const col = (v: string, len: number) => truncate(v, len).padEnd(len);
  const header = `${col("ID", 6)}${col("Fecha", 12)}${col("Descripcion", 30)}${col("Monto", 14)}${col("Categoria", 20)}${col("Cuenta", 18)}${col("Estado", 16)}`;
  console.log(header);
  console.log("-".repeat(header.length));

  for (const row of rows) {
    const description = row.description || row.llmLabel || row.rawDescription || "";
    const line = `${col(String(row.id ?? ""), 6)}${col(row.date, 12)}${col(description, 30)}${col(formatCLP(row.amount), 14)}${col(row.categoryName || "-", 20)}${col(row.accountName || "-", 18)}${col(row.status, 16)}`;
    console.log(line);
  }

  console.log(`\nTotal: ${rows.length} transaccion${rows.length === 1 ? "" : "es"}`);
}

export async function run(flags: Flags): Promise<void> {
  const db = getDb();
  const rows = await queryTransactions(flags, db);

  if (wantsJson(flags)) {
    printJsonSuccess(rows, {
      count: rows.length,
      categories: queryCategories(db).length,
      accounts: queryAccounts(db).length,
      groups: queryGroups(db).length,
      sources: querySources(db).length,
    });
    return;
  }

  printTable(rows);
}
