# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Finchi is a personal finance CLI tracker for Chilean banks. It imports bank transactions via `open-banking-chile`, categorizes them using fuzzy matching plus LLM fallback, and exposes both an interactive terminal UI and a scriptable CLI intended to work well with coding agents.

Core loop:

1. sync bank transactions
2. categorize uncategorized transactions
3. review and confirm suggested categories
4. inspect results in dashboard/summary

The `/open-banking-chile` directory is gitignored. It is kept locally for reference only. Finchi uses `open-banking-chile` as an npm dependency.

## Stack

| Layer | Tech |
|---|---|
| Runtime | Bun |
| DB | SQLite via Drizzle ORM (`drizzle-orm/bun-sqlite`) |
| Scrapers | `open-banking-chile` |
| Fuzzy matching | `fastest-levenshtein` |
| LLM | Provider adapter over Anthropic, OpenAI, Google |
| TUI | Ink 5 + React 18 |
| CLI | Custom arg parsing, dynamic command loading |

## Development commands

```bash
bun install
bun run src/cli.ts
bun run src/cli.ts --help
bun test
```

Useful targeted runs:

```bash
bun test tests/cli.test.ts
bun test tests/agent-cli.test.ts
bun test tests/dashboard.test.ts
bun test tests/setup.test.ts
```

## Product surface

Human-facing interactive flows:

- `finchi` -> opens setup or dashboard depending on startup readiness
- `finchi setup`
- `finchi review`
- `finchi dashboard`

Agent-friendly/scriptable flows:

- `finchi sync`
- `finchi txns list|get|edit|bulk-edit`
- `finchi dashboard summary`
- `finchi review list|confirm|bulk-confirm`
- `finchi providers list|get|set|clear`
- `finchi accounts banks|list|add|edit|remove`
- `finchi categories groups|list|get|add|edit`
- `finchi config show`

When adding new product capability, prefer exposing it through the non-interactive CLI first or at least alongside the TUI. The CLI is now a first-class API surface for coding agents.

## Architecture

```text
src/
  cli.ts                  entry point, help text, arg parsing, command routing
  cli-flags.ts            repeated-flag parsing helpers
  cli-dates.ts            date/month window parsing helpers
  cli-output.ts           human/json output helpers
  config.ts               env/config loading helpers
  commands/               thin command handlers
  domain/
    configuration.ts      provider/account/category mutations and reads
    transactions.ts       transaction reads and mutation helpers
  db/
    schema.ts             Drizzle schema
    index.ts              getDb() singleton
    migrate.ts            migration runner
    seed.ts               default categories
  sync/
    bank-client.ts        scraper integration
    normalize.ts          normalization helpers
    dedup.ts              transaction hash generation
    sync.ts               sync orchestration and date-window filtering
  categorize/
    fuzzy.ts              fuzzy match logic
    provider.ts           LLM provider adapters
    prompt.ts             classification prompts
    classify.ts           categorization orchestration
  flows/
    setup.ts              onboarding and env/config helpers
  tui/
    app.tsx               dashboard shell
    setup.tsx             Ink setup flow
    review.tsx            Ink review flow
    queries.ts            shared dashboard query/filter logic
    review-logic.ts       review mutations and loads
    components/           reusable Ink components
  dev/
    scenario.ts          dev-mode onboarding/setup scenarios
    seed-mock.ts         mock/dev data helpers
```

## Design principles

- Follow "A Philosophy of Software Design": prefer deep modules with simple interfaces
- Keep command modules thin; move reusable logic into `src/domain`, `src/flows`, `src/sync`, or `src/tui/queries`
- Preserve one semantic source of truth for filters and mutations
- Prefer additive changes over branching duplicate paths
- Build scriptable surfaces with deterministic outputs and explicit errors

## Development conventions

- Code in English, user-facing strings in Spanish
- Amounts are CLP integers with no decimals
- Expenses are negative amounts, income is positive
- DB dates are `YYYY-MM-DD`
- Bank movement dates come in `dd-mm-yyyy` and must be normalized
- Transaction dedup key is SHA256 of `(date + rawDescription + amount)`
- Status flow is `uncategorized -> pending_review -> confirmed`
- Only `confirmed` transactions feed the fuzzy matching corpus
- Category `group` is a first-class field and should stay owned by categories
- `excludeFromSummary` belongs to categories, not transactions

## CLI guidance for development

- Prefer `--json` support for any new read or write command
- New non-interactive commands should fail cleanly under `--no-interactive` instead of opening Ink
- JSON responses should follow the existing success/failure shape from `src/cli-output.ts`
- If a command exposes filters already available in dashboard, reuse the same semantics through shared helpers rather than reimplementing them
- If a TUI flow needs new functionality, consider whether agents also need the same capability through CLI

## Dynamic command routing

`src/cli.ts` loads command modules dynamically from the `COMMANDS` map. That keeps startup light and makes each command independently testable.

When adding a new command:

1. create a thin file in `src/commands`
2. register it in `COMMANDS`
3. add/update help text
4. add tests for parse/routing or command behavior

## Data model

Core tables:

- `accounts`: bank accounts configured in Finchi
- `categories`: category catalog, including `group` and `excludeFromSummary`
- `transactions`: imported and categorized bank movements
- `categorization_history`: audit trail for category changes

Important transaction fields:

- `rawDescription`
- `cleanDescription`
- `amount`
- `date`
- `source`
- `categoryId`
- `suggestedBy`
- `confidence`
- `status`
- `llmLabel`

## Setup and config behavior

Provider config is stored in env-style keys such as:

- `LLM_PROVIDER`
- `LLM_MODEL`
- `LLM_BASE_URL`
- provider-specific API key env vars

Bank credentials are stored as:

- `<BANK_ID>_RUT`
- `<BANK_ID>_PASS`

There are now two valid setup surfaces:

- interactive setup via `finchi setup`
- scriptable setup via `providers`, `accounts`, and `config show`

Do not force new setup capabilities into Ink only. If a setting matters operationally, add a CLI path too.

## Sync behavior

`open-banking-chile` does not expose native date windows consistently. Finchi now models a `SyncWindow` and filters locally before inserting when needed.

When changing sync behavior:

- preserve idempotency by hash
- keep account-level reporting intact
- keep `effectiveRange` explicit in JSON output
- avoid assuming all banks support the same scraper capabilities

## Testing expectations

Tests use in-memory SQLite from `tests/helpers.ts`.

When changing behavior, prefer covering the lowest stable layer:

- CLI parsing/help in `tests/cli.test.ts`
- agent/scriptable surfaces in `tests/agent-cli.test.ts`
- dashboard query/filter semantics in `tests/dashboard.test.ts`
- onboarding/setup decision logic in `tests/setup.test.ts`
- sync behavior in `tests/sync.test.ts`
- review mutation behavior in `tests/review.test.ts`

Avoid relying on full Ink interaction tests unless there is no lower-level seam to test.

## Environment variables

```env
FINCHI_DB_PATH=./finchi.db
FINCHI_CONFIDENCE_THRESHOLD=0.8
FINCHI_SIMILARITY_THRESHOLD=0.85

LLM_PROVIDER=anthropic|openai|google
LLM_MODEL=claude-sonnet-4-20250514
LLM_BASE_URL=

# Per-bank credentials
BCI_RUT=
BCI_PASS=
```

## open-banking-chile API

```ts
import { getBank, listBanks } from "open-banking-chile";

// getBank(id: string): BankScraper | undefined
// listBanks(): Array<{ id, name, url }>
// bank.scrape({ rut, password, onProgress? }): Promise<ScrapeResult>
// ScrapeResult: { success, bank, movements, balance?, error? }
```

Do not assume native range support from the scraper unless you confirm it in code.
