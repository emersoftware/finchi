import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { loadConfig } from "../config";
import { printJsonSuccess, printKeyValue, wantsJson } from "../cli-output";
import { listAccounts, getProviderSnapshot } from "../domain/configuration";
import { getStartupState } from "../flows/setup";

export async function run(flags: Flags): Promise<void> {
  const db = getDb();
  const config = loadConfig();
  const accounts = await listAccounts(db);
  const provider = getProviderSnapshot();
  const startupState = getStartupState(db);

  const payload = {
    dbPath: config.dbPath,
    startupState,
    provider,
    accounts,
  };

  if (wantsJson(flags)) {
    printJsonSuccess(payload);
    return;
  }

  printKeyValue([
    ["DB path", payload.dbPath],
    ["Startup state", payload.startupState],
    ["Provider", provider?.providerId],
    ["Model", provider?.model],
    ["Accounts", payload.accounts.length],
  ]);
}
