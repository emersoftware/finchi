import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { getFlagString } from "../cli-flags";
import { wantsJson, printJsonSuccess } from "../cli-output";
import { confirmTransaction, loadPendingTransactions } from "../tui/review-logic";

export async function run(flags: Flags): Promise<void> {
  const idText = getFlagString(flags, "id");
  if (!idText) throw new Error("Debes pasar --id.");

  const id = Number(idText);
  const db = getDb();
  const transaction = (await loadPendingTransactions(db)).find((row) => row.id === id);
  if (!transaction) throw new Error(`Transaccion pendiente con ID ${id} no encontrada.`);

  await confirmTransaction(db, transaction);
  if (wantsJson(flags)) {
    printJsonSuccess({ confirmed: id });
    return;
  }

  console.log(`Transaccion ${id} confirmada.`);
}
