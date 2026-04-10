import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { getFlagStrings, hasFlag } from "../cli-flags";
import { wantsJson, printJsonSuccess } from "../cli-output";
import { confirmAll, loadPendingTransactions } from "../tui/review-logic";

function parseIds(values: string[]): number[] {
  return values.flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) throw new Error(`ID invalido: ${value}`);
      return parsed;
    });
}

export async function run(flags: Flags): Promise<void> {
  const db = getDb();
  const pending = await loadPendingTransactions(db);
  const ids = parseIds(getFlagStrings(flags, "ids"));
  const selected = hasFlag(flags, "all") ? pending : pending.filter((row) => ids.includes(row.id));
  if (selected.length === 0) throw new Error("No hay transacciones pendientes seleccionadas.");

  const count = await confirmAll(db, selected);
  if (wantsJson(flags)) {
    printJsonSuccess({ confirmed: count, ids: selected.map((row) => row.id) });
    return;
  }

  console.log(`${count} transacciones confirmadas.`);
}
