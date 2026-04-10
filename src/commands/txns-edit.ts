import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { getFlagString } from "../cli-flags";
import { printJsonSuccess, wantsJson } from "../cli-output";
import { getTransactionById, resolveCategoryId, updateTransaction } from "../domain/transactions";

export async function run(flags: Flags): Promise<void> {
  const idText = getFlagString(flags, "id");
  if (!idText) throw new Error("Debes pasar --id.");

  const id = Number(idText);
  if (!Number.isInteger(id)) throw new Error("id debe ser numerico.");

  const db = getDb();
  const categoryIdText = getFlagString(flags, "category-id");
  const category = getFlagString(flags, "category");
  const categoryId = await resolveCategoryId(db, {
    categoryId: categoryIdText !== undefined ? Number(categoryIdText) : undefined,
    categoryName: category,
  });

  const updates = {
    categoryId,
    llmLabel: getFlagString(flags, "label"),
    status: getFlagString(flags, "status"),
    source: getFlagString(flags, "source"),
  };

  if (
    updates.categoryId === undefined &&
    updates.llmLabel === undefined &&
    updates.status === undefined &&
    updates.source === undefined
  ) {
    throw new Error("No hay cambios para aplicar.");
  }

  await updateTransaction(db, id, updates);
  const updated = await getTransactionById(db, id);

  if (wantsJson(flags)) {
    printJsonSuccess(updated);
    return;
  }

  console.log(`Transaccion ${id} actualizada.`);
}
