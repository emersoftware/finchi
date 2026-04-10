import { render } from "ink";
import React from "react";
import type { Flags } from "../cli";
import { DashboardApp } from "../tui/app";
import { getDb } from "../db/index";

export async function run(flags: Flags): Promise<void> {
  if (flags["no-interactive"]) {
    throw new Error("dashboard abre una TUI. Usa 'finchi dashboard summary --json' en modo no interactivo.");
  }
  const db = getDb();
  const { waitUntilExit } = render(React.createElement(DashboardApp, { db }));
  await waitUntilExit();
}
