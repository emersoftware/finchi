import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { getFlagString } from "../cli-flags";
import { printJsonSuccess, wantsJson } from "../cli-output";
import { addCategory } from "../domain/configuration";

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("exclude-from-summary debe ser true o false.");
}

export async function run(flags: Flags): Promise<void> {
  const name = getFlagString(flags, "name");
  const group = getFlagString(flags, "group");
  if (!name || !group) throw new Error("Debes pasar --name y --group.");

  const category = await addCategory(getDb(), {
    name,
    group,
    emoji: getFlagString(flags, "emoji"),
    excludeFromSummary: parseBoolean(getFlagString(flags, "exclude-from-summary")),
  });

  if (wantsJson(flags)) {
    printJsonSuccess(category);
    return;
  }

  console.log(`Categoria ${category.name} creada con ID ${category.id}.`);
}
