import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { getFlagString } from "../cli-flags";
import { printJsonSuccess, printKeyValue, wantsJson } from "../cli-output";
import { getCategory } from "../domain/configuration";

export async function run(flags: Flags): Promise<void> {
  const idText = getFlagString(flags, "id");
  if (!idText) throw new Error("Debes pasar --id.");
  const category = await getCategory(getDb(), Number(idText));

  if (wantsJson(flags)) {
    printJsonSuccess(category);
    return;
  }

  printKeyValue([
    ["ID", category.id],
    ["Nombre", category.name],
    ["Grupo", category.group],
    ["Emoji", category.emoji],
    ["Exclude from summary", category.excludeFromSummary],
  ]);
}
