import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { getFlagString } from "../cli-flags";
import { printJsonSuccess, wantsJson } from "../cli-output";
import { updateCategory } from "../domain/configuration";

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("exclude-from-summary debe ser true o false.");
}

export async function run(flags: Flags): Promise<void> {
  const idText = getFlagString(flags, "id");
  if (!idText) throw new Error("Debes pasar --id.");

  const category = await updateCategory(getDb(), Number(idText), {
    name: getFlagString(flags, "name"),
    group: getFlagString(flags, "group"),
    emoji: getFlagString(flags, "emoji"),
    excludeFromSummary: parseBoolean(getFlagString(flags, "exclude-from-summary")),
  });

  if (wantsJson(flags)) {
    printJsonSuccess(category);
    return;
  }

  console.log(`Categoria ${category.id} actualizada.`);
}
