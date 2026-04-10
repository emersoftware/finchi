import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { getFlagString } from "../cli-flags";
import { printJsonSuccess, wantsJson } from "../cli-output";
import { renameAccount } from "../domain/configuration";

export async function run(flags: Flags): Promise<void> {
  const idText = getFlagString(flags, "id");
  const name = getFlagString(flags, "name");
  if (!idText || !name) throw new Error("Debes pasar --id y --name.");

  const account = await renameAccount(getDb(), Number(idText), name);
  if (wantsJson(flags)) {
    printJsonSuccess(account);
    return;
  }

  console.log(`Cuenta ${account.id} actualizada.`);
}
