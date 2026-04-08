import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bankId: text("bank_id").notNull(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  group: text("group").notNull().default(""),
  emoji: text("emoji").notNull().default(""),
  excludeFromSummary: integer("exclude_from_summary", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  hash: text("hash").notNull().unique(),
  date: text("date").notNull(),
  rawDescription: text("raw_description").notNull(),
  cleanDescription: text("clean_description").notNull(),
  amount: integer("amount").notNull(),
  balance: integer("balance"),
  source: text("source"),
  categoryId: integer("category_id").references(() => categories.id),
  suggestedBy: text("suggested_by"),
  confidence: real("confidence"),
  status: text("status").notNull().default("uncategorized"),
  llmLabel: text("llm_label"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const categorizationHistory = sqliteTable("categorization_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id").notNull().references(() => transactions.id),
  oldCategoryId: integer("old_category_id"),
  newCategoryId: integer("new_category_id").notNull(),
  changedBy: text("changed_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});
