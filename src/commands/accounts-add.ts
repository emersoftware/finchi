import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { getFlagString } from "../cli-flags";
import { printJsonSuccess, wantsJson } from "../cli-output";
import { addAccount } from "../domain/configuration";

export async function run(flags: Flags): Promise<void> {
  const bankId = getFlagString(flags, "bank");
  const name = getFlagString(flags, "name");
  const rut = getFlagString(flags, "rut");
  const password = getFlagString(flags, "password");
  const saveMode = getFlagString(flags, "save") ?? "env";

  if (!bankId || !name || !rut || !password) {
    throw new Error("Debes pasar --bank, --name, --rut y --password.");
  }
  if (saveMode !== "env" && saveMode !== "memory") {
    throw new Error("save debe ser env o memory.");
  }

  const account = await addAccount(getDb(), {
    bankId,
    name,
    rut,
    password,
    envPath: saveMode === "memory" ? null : ".env",
  });

  if (wantsJson(flags)) {
    printJsonSuccess(account);
    return;
  }

  console.log(`Cuenta ${account.name} creada con ID ${account.id}.`);
}
