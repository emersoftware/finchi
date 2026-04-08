# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Finchi is a personal finance CLI tracker for Chilean banks. It imports bank transactions via `open-banking-chile` npm package, categorizes them using fuzzy matching against previously confirmed transactions plus LLM fallback, and displays results in a terminal UI.

Core loop: import -> categorize -> human review -> confirm -> dashboard.

The `/open-banking-chile` directory is gitignored -- it's a local clone of the scraper library kept for reference only. Finchi uses `open-banking-chile` as an npm dependency.

## Stack

| Layer | Tech |
|---|---|
| Runtime | Bun (native TS, built-in SQLite via bun:sqlite) |
| DB | SQLite via Drizzle ORM (`drizzle-orm/bun-sqlite`) |
| Scrapers | `open-banking-chile` npm package |
| Fuzzy matching | `fastest-levenshtein` |
| LLM | Adapter pattern over Anthropic, OpenAI, Google SDKs with Zod-validated structured output |
| TUI | Ink 5 + React 18 for dashboard/review, @clack/prompts for interactive flows |
| CLI | Custom arg parsing (no framework) |

## Build & run commands

```bash
bun install                    # install deps
bun run src/cli.ts             # run CLI (or `bun dev`)
bun test                       # run all tests (153 tests across 7 files)
bun run src/cli.ts --help      # show available commands
```

## CLI commands

```
finchi                 -- dashboard (or setup if first use)
finchi setup           -- interactive onboarding
finchi sync            -- sync transactions from all banks
finchi categorize      -- categorize pending transactions
finchi review          -- interactive review of pending transactions
finchi txns            -- list transactions (supports --uncategorized --category --from --to)
```

## Architecture

```
src/
  cli.ts                -- entry point, arg parsing (parseArgs), command routing
  config.ts             -- loadConfig() reads .env, getBankCredentials(bankId)
  commands/             -- thin command wrappers (setup, sync, categorize, review, txns, dashboard)
  db/
    schema.ts           -- Drizzle tables: accounts, categories, transactions, categorizationHistory
    index.ts            -- getDb() singleton (WAL mode, foreign keys)
    migrate.ts          -- migration runner
    seed.ts             -- seed 11 default categories
  sync/
    bank-client.ts      -- wraps open-banking-chile getBank/scrape
    normalize.ts        -- cleanDescription(), convertDate() (dd-mm-yyyy -> YYYY-MM-DD)
    dedup.ts            -- generateHash() SHA256 for dedup
    sync.ts             -- syncAccount(), syncAllAccounts() orchestrator
  categorize/
    fuzzy.ts            -- fuzzyMatch(), computeSimilarity(), getConfirmedPatterns()
    provider.ts         -- LLMProvider interface + Anthropic/OpenAI/Google implementations
    prompt.ts           -- buildSystemPrompt(), buildUserPrompt() for classification
    classify.ts         -- categorizeTransactions() orchestrator, Zod validation
  tui/
    app.tsx             -- dashboard shell with tab switching (Transactions/Resumen)
    transactions.tsx    -- paginated transaction table with filters
    summary.tsx         -- category expense breakdown
    review.tsx          -- interactive review table (confirm/edit categories)
    review-logic.ts     -- DB operations for review (confirm, edit, load)
    format.ts           -- formatCLP(), renderBar(), paginate(), aggregateByCategory()
    queries.ts          -- queryTransactions(), queryCategories(), queryAccounts()
    components/
      table.tsx         -- reusable table with pagination (paginateRows)
      category-select.tsx -- inline category picker
      filter-bar.tsx    -- filter controls for dashboard
  flows/
    setup.ts            -- onboarding flow using @clack/prompts
```

## Design principles

- Follow "A Philosophy of Software Design" (John Ousterhout): deep modules with simple interfaces, minimize complexity leaking between layers, write code that is obvious to read
- Composition over inheritance
- Atomicity -- each function/module does one thing completely, operations succeed fully or fail cleanly
- DRY -- extract shared logic when duplication is real, don't abstract prematurely
- KISS -- simplest solution that works

## Key conventions

- Code in English, user-facing strings in Spanish
- Amounts: negative = expense, positive = income (CLP integers, no decimals)
- Dates: YYYY-MM-DD in DB (converted from dd-mm-yyyy bank format via convertDate)
- Transaction dedup: SHA256 hash of (date + rawDescription + amount)
- Categorization pipeline: fuzzy match confirmed history -> LLM for remainder -> all `pending_review` -> human confirms -> feeds future fuzzy
- LLM calls: single structured output call per batch (not an agent loop)
- Status flow: `uncategorized` -> `pending_review` -> `confirmed`
- Only `confirmed` transactions feed fuzzy matching pool
- Ink 5 requires React 18 (not 19) -- pinned in package.json
- Tests use in-memory SQLite via `createTestDb()` in tests/helpers.ts

## DB schema (4 tables)

- **accounts**: id, bank_id, name, created_at
- **categories**: id, name (UNIQUE), emoji, created_at
- **transactions**: id, account_id (FK), hash (UNIQUE), date, raw_description, clean_description, amount, balance?, source?, category_id? (FK), suggested_by?, confidence?, status, llm_label?, created_at
- **categorization_history**: id, transaction_id (FK), old_category_id?, new_category_id, changed_by, created_at

## Environment variables

```env
# Bank credentials: <BANK_ID>_RUT and <BANK_ID>_PASS
LLM_PROVIDER=anthropic|openai|google
LLM_MODEL=claude-sonnet-4-20250514
LLM_BASE_URL=                           # for OpenAI-compatible providers
FINCHI_DB_PATH=./finchi.db
FINCHI_CONFIDENCE_THRESHOLD=0.8
FINCHI_SIMILARITY_THRESHOLD=0.85
```

## open-banking-chile API

```typescript
import { getBank, listBanks } from "open-banking-chile";
// getBank(id: string): BankScraper | undefined
// listBanks(): Array<{ id, name, url }>
// bank.scrape({ rut, password, onProgress? }): Promise<ScrapeResult>
// ScrapeResult: { success, bank, movements: BankMovement[], balance?, error? }
// BankMovement: { date (dd-mm-yyyy), description, amount, balance, source }
// source: 'account' | 'credit_card_billed' | 'credit_card_unbilled'
```

No date range control -- scrapes whatever the bank returns, dedup handles duplicates.
