# AGENTS.md

## Project

WorldForge is a local-first desktop writing workstation for a single author.  
The repository implements the frozen V6.5 design baseline.

Primary references:

1. `WorldForge_V6.5_实施安全并发与高分屏适配冻结最终工程设计文档.docx`
2. `WorldForge_Codex_全流程技术开发指南.md`
3. The active task file under `docs/tasks/`

Do not invent product scope outside these documents.

## Codex working agreement

Before editing:

1. Read this file.
2. Read the active task and related design sections.
3. Inspect existing code, tests, migrations, and contracts.
4. Restate the goal, non-goals, affected modules, risks, and verification commands.
5. For complex work, produce a plan and wait for confirmation.

During implementation:

- Write or update a failing test/reproduction first when practical.
- Make the smallest complete change.
- Do not refactor unrelated code.
- Do not add production dependencies without explicit approval.
- Do not use TODOs, empty implementations, fake success responses, or hard-coded demo data to claim completion.
- Do not silently change frozen architecture or product scope.

After implementation:

- Run the required checks.
- Review the diff for security, data integrity, failure, cancellation, and conflict paths.
- Report commands, results, changed files, remaining risks, and manual verification.
- Never claim completion without evidence.

## Frozen product boundaries

V1.0 includes the core local writing loop only.

Do not implement in V1.0:

- cloud storage or sync
- WorldForge request proxying
- account backends
- model downloading or runtime management
- vector databases, embeddings, or reranking
- MCP, CRDT, collaboration, or plugin marketplace
- automatic publishing or reader analytics
- autonomous preference learning
- unattended bulk generation

V1.5 work must remain in separate epics and must not block V1.0.

## Non-negotiable invariants

### INV-001 Local data

Project text, settings, indexes, logs, prompts, evaluations, and backups stay on the user's machine. External model calls are made directly from the local Core process to the user-configured endpoint.

### INV-002 Candidate isolation

AI output is persisted as a Candidate first. It may enter the active Draft only after explicit author acceptance.

### INV-003 Single source of truth

`project.sqlite` is the only authoritative project data source. Renderer state, Tiptap JSON, caches, FTS indexes, exports, summaries, and diary entries are not authority.

### INV-004 Code-enforced safety

Locked blocks, revisions, immutable versions, project boundaries, and path boundaries must be enforced in code. Prompts are not security controls.

### INV-005 Author authority

AI may propose text, validation findings, state changes, summaries, and diary entries. It must not directly alter canonical facts, final text, or authoritative state.

Any test failure against these invariants blocks merge.

## Architecture

```text
Electron Main
  - windows, lifecycle, OS integration, credential broker, Core supervision

Renderer
  - React, Tiptap, Zustand, user interaction
  - no Node, SQLite, filesystem, environment, or credentials

Core Service Utility Process
  - sole SQLite writer
  - files, FTS5, AI provider calls, validation, import/export, backups
```

Keep the initial Core as one Utility Process, but separate internally:

- asynchronous AI streaming
- serialized SQLite write queue
- CPU-heavy jobs

Do not split processes without measured thresholds and an approved task.

## Repository layout

```text
apps/desktop/main
apps/desktop/preload
apps/desktop/renderer

packages/contracts
packages/domain
packages/core-service
packages/editor-core
packages/prompts
packages/testkit

migrations/app
migrations/project
tests
evals
docs
scripts
```

Rules:

- `contracts`: Zod schemas, IPC types, error codes; no business implementation.
- `domain`: pure entities and invariants; no Electron, React, or SQLite.
- `core-service`: repositories, migrations, write queue, providers, FTS, backup/import/export.
- `editor-core`: Tiptap schema, Block Patch, locking, block mapping.
- `prompts`: prompt versions, constraint serialization, structured output parsing.
- `testkit`: fixtures, stubs, fault injection, temporary projects.

## Technology rules

- TypeScript strict mode.
- Avoid `any`; use `unknown` plus validation at boundaries.
- Use Zod for all IPC and external model payloads.
- Use pnpm workspace.
- Use Vitest and Playwright.
- Use SQLite through `better-sqlite3` only inside Core.
- Use FTS5 in V1.0; do not create a vector abstraction.
- Do not add a local HTTP server for internal IPC.
- Do not store API keys in SQLite, JSON, logs, or Renderer state.

## Database rules

Initialize project databases with:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

All writes pass through one serialized write queue.

Required transaction boundaries:

- Draft Patch
- Candidate acceptance
- Version creation
- state proposal resolution
- chapter split/merge/move
- import commit
- migrations

Migrations are append-only after merge. Never edit an already released migration.

An automatic save increments Draft revision once per committed transaction. A revision number is not a full snapshot.

Immutable Version and VersionBlock rows have no business update path.

## Draft, Candidate, and Version

- One active Draft per chapter.
- Candidate never overwrites Draft.
- Version is immutable.
- `logicalBlockId` tracks logical identity across Draft, Candidate, and Version.
- Record IDs do not need to remain the same across versions.
- Candidate acceptance checks base revision, hashes, locked blocks, and project scope.
- Candidate acceptance is one atomic transaction and must be undoable.
- Partial streamed output may only be stored as a partial Candidate.

## Locking

Lock protection is enforced twice:

1. Tiptap/plugin UI guard.
2. Core LockGuard.

All AI, replacement, split, merge, and move operations must respect locked blocks.

## Electron security

Required BrowserWindow settings:

```ts
nodeIntegration: false
contextIsolation: true
sandbox: true
webSecurity: true
```

- Preload exposes named, minimal APIs only.
- Never expose raw `ipcRenderer.send`.
- Renderer cannot access Node or filesystem.
- Use strict CSP.
- Block in-app remote navigation and new windows.
- Open external links with the OS browser.
- Normalize and validate all paths against the active project or an explicit user-selected directory.
- Validate every IPC input with Zod.
- Do not weaken these settings to fix a development issue.

## AI and provider rules

V1 provider capability fields are limited to:

```ts
streaming
structuredOutput
maxContextTokens
maxOutputTokens
```

Do not add speculative capability flags.

Generation state is:

```text
queued | running | succeeded | failed | cancelled
```

Streaming rules:

- batch deltas; do not send one IPC message per token
- include monotonically increasing sequence numbers
- Renderer displays temporary output only
- persist Candidate after completion
- cancel feedback target: 500 ms
- switching chapters must not cancel or mix runs

AI stages displayed to the user must map to real program stages. Do not fake countdowns.

## Constraint and memory rules

Constraint priority:

```text
P0 code constraints
P1 required chapter facts
P2 relevant canon/state
P3 style and character voice
P4 supporting background
```

V1.0 retrieval uses explicit relations plus FTS5 only.

Summaries, generated diary entries, retrieval results, and model analysis are derived data. They cannot override final text, canonical facts, or confirmed current state.

## UI and display rules

Visual direction: quiet editorial workspace.

- Keep the manuscript as the visual center.
- Do not use large AI-blue backgrounds.
- Do not use green to imply AI text is better.
- Use cards only for candidates, conflicts, recovery, and risk.
- Support light, dark, eye-comfort, and high-contrast themes.
- Use SVG icons.
- Keep body column width at 680/760/860 CSS px.
- Support 1280×800 minimum, 2560×1440 at 100/125/150%, and 21:9 ultrawide.
- Below 1100 CSS px use a right drawer; below 900 use drawers for both sides.
- Do not create page-level horizontal scrolling.
- Keep dangerous actions near the active content area on ultrawide displays.

## Tests required by change type

### Always

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Run affected-package versions during iteration; run root commands before completion.

### Database or migration

```bash
pnpm test:migration
pnpm test:integration
```

Test empty database, current database, old-schema upgrade, and interrupted upgrade.

### Electron or IPC security

```bash
pnpm test:security
pnpm test:e2e
```

### Editor, Candidate, locking, revision

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

### AI prompt, constraint, provider, or schema

```bash
pnpm test:eval
pnpm test:integration
```

### Performance-sensitive work

```bash
pnpm test:perf
```

## Hard release guarantees

These must remain zero:

- locked block modifications
- unconfirmed Candidate writes
- silent overwrite on revision conflict
- direct AI updates to authoritative canon
- cross-project writes

Model quality scores are separate from these code guarantees.

## Performance budgets

- 2K typing P95: <= 50 ms
- auto-save P95: <= 150 ms
- editing IPC P95: <= 200 ms
- cancellation feedback: <= 500 ms
- 5000 Chinese-character candidate diff first view: <= 500 ms
- complete diff: <= 1.2 s
- scrolling: >= 50 fps
- single Core event-loop block: < 100 ms

Report measured results for affected performance work.

## Logging and privacy

Default logs may contain:

- run IDs
- provider/model identifiers
- latency
- token counts
- error codes
- hashes

Default logs must not contain:

- manuscript text
- full prompts
- API keys
- credentials
- private attachment contents

Diagnostic export must list its contents and require confirmation.

## Review expectations

For high-risk changes, request or perform a second independent review:

- migrations
- Draft Patch
- LockGuard
- Candidate acceptance
- Version creation
- state write-back
- backup/restore
- credential handling
- path handling
- permanent deletion
- Electron security configuration

Review findings must include severity, file/line, impact, reproduction or reasoning, and fix guidance.

## Definition of done

A task is done only when:

- behavior and non-goals match the task
- tests prove the success and failure paths
- migrations and contracts are synchronized
- cancellation and conflict paths are handled
- security/privacy rules are preserved
- required commands pass
- evidence is recorded under `docs/test-evidence/<TASK-ID>/`
- remaining limitations and risks are stated
- no unrelated refactor, TODO, fake data, or empty implementation remains

Do not report “completed” when only scaffolding, mocks, or analysis exists.
