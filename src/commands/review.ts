import { render } from "ink";
import React from "react";
import type { Flags } from "../cli";
import { ReviewApp } from "../tui/review";
import { getDb } from "../db/index";

export async function run(flags: Flags): Promise<void> {
  if (flags["no-interactive"]) {
    throw new Error("review abre una TUI. Usa 'finchi review list --json' o los subcomandos no interactivos.");
  }
  const db = getDb();
  const { waitUntilExit } = render(React.createElement(ReviewApp, { db }));
  await waitUntilExit();
}
