import { render } from "ink";
import React from "react";
import type { Flags } from "../cli";
import { DashboardApp } from "../tui/app";
import { getDb } from "../db/index";

export async function run(_flags: Flags): Promise<void> {
  const db = getDb();
  const { waitUntilExit } = render(React.createElement(DashboardApp, { db }));
  await waitUntilExit();
}
