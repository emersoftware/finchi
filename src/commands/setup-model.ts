import type { Flags } from "../cli";
import { runSetupInk } from "../tui/setup";

export async function run(_flags: Flags): Promise<void> {
  await runSetupInk("model");
}
