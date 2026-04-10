import type { Flags } from "../cli";
import { runSetupInk } from "../tui/setup";

export async function run(_flags: Flags): Promise<void> {
  const result = await runSetupInk("full");
  if (result.action === "dashboard") {
    const mod = await import("./dashboard");
    await mod.run({});
  }
}
