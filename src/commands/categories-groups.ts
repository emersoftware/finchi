import type { Flags } from "../cli";
import { getDb } from "../db/index";
import { printJsonSuccess, wantsJson } from "../cli-output";
import { listCategoryGroups } from "../domain/configuration";

export async function run(flags: Flags): Promise<void> {
  const groups = await listCategoryGroups(getDb());
  if (wantsJson(flags)) {
    printJsonSuccess(groups, { count: groups.length });
    return;
  }

  for (const group of groups) {
    console.log(group);
  }
}
