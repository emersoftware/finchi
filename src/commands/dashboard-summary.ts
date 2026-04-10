import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { wantsJson, printJsonSuccess } from "../cli-output";
import { buildTransactionFilters } from "./txns";
import { queryTransactions } from "../tui/queries";
import { aggregateByCategory, aggregateByGroup, formatCLP } from "../tui/format";

export async function run(flags: Flags): Promise<void> {
  const db = getDb();
  const rows = queryTransactions(db, buildTransactionFilters(flags));
  const byCategory = aggregateByCategory(rows);
  const byGroup = aggregateByGroup(rows);

  const payload = {
    totals: {
      expenses: byCategory.totalExpenses,
      income: byCategory.totalIncome,
    },
    categories: byCategory.expenses,
    groups: byGroup.groups,
    transactionCount: rows.length,
  };

  if (wantsJson(flags)) {
    printJsonSuccess(payload);
    return;
  }

  console.log(`Ingresos: ${formatCLP(payload.totals.income)}`);
  console.log(`Egresos: ${formatCLP(payload.totals.expenses)}`);
  console.log(`Transacciones: ${payload.transactionCount}`);
}
