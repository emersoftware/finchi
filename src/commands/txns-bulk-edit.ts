import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { getFlagString, getFlagStrings } from "../cli-flags";
import { printJsonSuccess, wantsJson } from "../cli-output";
import { buildTransactionFilters } from "./txns";
import { getTransactionIdsForFilters, resolveCategoryId, updateTransactions } from "../domain/transactions";

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
  const explicitIds = parseIds(getFlagStrings(flags, "ids"));
  const filters = buildTransactionFilters(flags);
  const filteredIds = await getTransactionIdsForFilters(db, filters);
  const transactionIds = explicitIds.length > 0 ? explicitIds : filteredIds;
  if (transactionIds.length === 0) throw new Error("No hay transacciones seleccionadas.");

  const categoryIdText = getFlagString(flags, "set-category-id");
  const category = getFlagString(flags, "set-category");
  const categoryId = await resolveCategoryId(db, {
    categoryId: categoryIdText !== undefined ? Number(categoryIdText) : undefined,
    categoryName: category,
  });

  const updates = {
    categoryId,
    status: getFlagString(flags, "set-status"),
  };

  if (updates.categoryId === undefined && updates.status === undefined) {
    throw new Error("No hay cambios para aplicar.");
  }

  const updatedCount = await updateTransactions(db, transactionIds, updates);

  if (wantsJson(flags)) {
    printJsonSuccess({ updatedCount, transactionIds });
    return;
  }

  console.log(`${updatedCount} transacciones actualizadas.`);
}
