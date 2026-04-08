import type { Flags } from "../cli";
import { runSetup } from "../flows/setup";

export async function run(_flags: Flags): Promise<void> {
  await runSetup();
}
