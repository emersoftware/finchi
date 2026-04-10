import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { getFlagString } from "../cli-flags";
import { printJsonSuccess, wantsJson } from "../cli-output";
import { removeAccount } from "../domain/configuration";

export async function run(flags: Flags): Promise<void> {
  const idText = getFlagString(flags, "id");
  if (!idText) throw new Error("Debes pasar --id.");

  const account = await removeAccount(getDb(), Number(idText));
  if (wantsJson(flags)) {
    printJsonSuccess(account);
    return;
  }

  console.log(`Cuenta ${account.id} eliminada.`);
}
