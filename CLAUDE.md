# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Finchi is a personal finance tracker CLI for Chilean banks. It imports transactions via scrapers, categorizes them (fuzzy matching + LLM fallback), supports human review, and shows spending summaries by category.

The `/open-banking-chile` directory is gitignored -- it's a local clone of the scraper library kept for reference only. Finchi uses `open-banking-chile` as an npm dependency, not as a local subproject.

## Stack

| Layer | Tech |
|---|---|
| Runtime | Bun (native TS, built-in SQLite) |
| DB | SQLite via Drizzle ORM |
| Scrapers | `open-banking-chile` (npm package) |
| Fuzzy matching | `fastest-levenshtein` |
| LLM | Adapter pattern over OpenAI, Anthropic, Google SDKs with Zod-validated structured output |
| TUI | Ink (React for CLI) for dashboard, @clack/prompts for interactive flows |

## Build & run commands

```bash
bun install                    # install deps
bun run src/cli.ts             # run CLI
bun test                       # run tests
```

## Architecture (planned)

```
src/
  cli.ts              -- CLI entry point + command routing
  config.ts           -- .env loading, thresholds
  db/                 -- Drizzle schema, migrations, seed
  sync/               -- Bank sync, normalize, dedup
  categorize/         -- Fuzzy matching, LLM provider adapter, classification
  tui/                -- Ink components (dashboard, review, transactions)
  flows/              -- Multi-step flows (setup/onboarding)
```

## Design principles

- Follow "A Philosophy of Software Design" (John Ousterhout): deep modules with simple interfaces, minimize complexity leaking between layers, write code that is obvious to read
- Composition over inheritance -- combine small focused functions/modules rather than building class hierarchies
- Atomicity -- each function/module does one thing completely, operations succeed fully or fail cleanly
- DRY -- extract shared logic when duplication is real (not speculative), but don't abstract prematurely
- KISS -- pick the simplest solution that works, avoid clever indirection, minimize moving parts

## Key conventions

- Code in English, user-facing strings in Spanish (Chilean context)
- Amounts: negative = expense, positive = income (CLP integers, no decimals)
- Dates: `dd-mm-yyyy` format in bank movements (Chilean convention)
- Transaction dedup: SHA256 hash of (date + description + amount) to prevent duplicates on re-import
- Categorization pipeline: fuzzy match confirmed history first, LLM for remainder, all marked `pending_review`, human confirms, confirmed data feeds future fuzzy matches
- LLM calls: single structured output call per batch (not an agent loop). Provider adapter with `classify(prompt, schema)` interface.
- Status flow: `uncategorized` -> `pending_review` (after fuzzy/LLM) -> `confirmed` (after human review)

## open-banking-chile API (key types for integration)

The npm package exports bank scrapers. Key interfaces:

- `BankScraper` -- `{ id, name, url, scrape(options) }`
- `ScraperOptions` -- `{ rut, password, chromePath?, saveScreenshots?, headful?, owner?, onProgress? }`
- `ScrapeResult` -- `{ success, bank, movements[], balance?, creditCards?, error?, screenshot?, debug? }`
- `BankMovement` -- `{ date, description, amount, balance, source, owner?, installments? }`
- `source` field: `'account' | 'credit_card_billed' | 'credit_card_unbilled'`
- `banks` registry, `getBank(id)`, `listBanks()` for discovery

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
