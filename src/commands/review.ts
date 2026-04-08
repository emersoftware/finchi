import { render } from "ink";
import React from "react";
import type { Flags } from "../cli";
import { ReviewApp } from "../tui/review";
import { getDb } from "../db/index";

export async function run(_flags: Flags): Promise<void> {
  const db = getDb();
  const { waitUntilExit } = render(React.createElement(ReviewApp, { db }));
  await waitUntilExit();
}
