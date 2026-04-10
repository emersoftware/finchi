import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { getFlagString } from "../cli-flags";
import { printJsonSuccess, printKeyValue, wantsJson } from "../cli-output";
import { getTransactionById } from "../domain/transactions";
import { formatCLP } from "../tui/format";

export async function run(flags: Flags): Promise<void> {
  const idText = getFlagString(flags, "id");
  if (!idText) throw new Error("Debes pasar --id.");

  const id = Number(idText);
  if (!Number.isInteger(id)) throw new Error("id debe ser numerico.");

  const row = await getTransactionById(getDb(), id);
  if (!row) throw new Error(`Transaccion con ID ${id} no encontrada.`);

  if (wantsJson(flags)) {
    printJsonSuccess(row);
    return;
  }

  printKeyValue([
    ["ID", row.id],
    ["Fecha", row.date],
    ["Descripcion", row.llmLabel || row.rawDescription],
    ["Monto", formatCLP(row.amount)],
    ["Categoria", row.categoryName],
    ["Grupo", row.categoryGroup],
    ["Cuenta", row.accountName],
    ["Source", row.source],
    ["Estado", row.status],
  ]);
}
