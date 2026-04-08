import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../src/db/schema";
import { SCHEMA_SQL } from "../src/db/index";

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite, { schema });
}
