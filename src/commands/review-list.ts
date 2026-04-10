import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { wantsJson, printJsonSuccess } from "../cli-output";
import { loadPendingTransactions } from "../tui/review-logic";
import { formatCLP } from "../tui/format";

export async function run(flags: Flags): Promise<void> {
  const rows = await loadPendingTransactions(getDb());
  if (wantsJson(flags)) {
    printJsonSuccess(rows, { count: rows.length });
    return;
  }

  if (rows.length === 0) {
    console.log("No hay transacciones pendientes.");
    return;
  }

  for (const row of rows) {
    console.log(`${row.id}\t${row.date}\t${row.llmLabel || row.rawDescription}\t${formatCLP(row.amount)}\t${row.categoryName || "-"}`);
  }
}
