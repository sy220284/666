# AGENTS.md

## 1. Project

WorldForge is a local-first desktop writing workstation for a single author. The repository implements the frozen WorldForge V6.5 baseline.

Do not invent product scope, architecture, features, dependencies, or cloud services outside the approved documents.

## 2. Mandatory startup order

Before any coding, refactoring, bug fix, test, migration, prompt, UI, or release task, read in this exact order:

```text
1. AGENTS.md
2. docs/PROJECT_EXECUTION_ENTRY.md
3. docs/tasks/ACTIVE_TASK.md
4. the individual task file referenced by ACTIVE_TASK
5. the task-specific documents listed there
6. existing code, tests, migrations, IPC contracts, and traceability state
```

Rules:

- `docs/tasks/ACTIVE_TASK.md` is the only authority for which coding task may run now.
- If it says `NO_ACTIVE_CODING_TASK`, do not select and implement the next task yourself.
- Milestone summaries such as `M0_TASKS.md` are indexes, not executable task cards.
- Every active task must point to exactly one file under `docs/tasks/M0/` through `docs/tasks/M5/`.
- `agent.md` is a human-readable mirror. This file remains the Codex repository instruction authority.

## 3. Document authority

When documents conflict, use this order:

```text
latest explicit author instruction
> approved ACTIVE_TASK scope and acceptance
> docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
> frozen specialist specs, ADRs, schemas, IPC, UI, security, and P0 acceptance
> docs/decisions/IMPLEMENTATION_DECISIONS.md
> this AGENTS.md and the execution playbook
> existing implementation
```

Do not silently choose one conflicting source. Report the conflict, affected files, and implementation impact before continuing.

## 4. Unified documentation routes

Use `docs/PROJECT_EXECUTION_ENTRY.md` as the routing table.

Primary references:

- Full product and architecture baseline: `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- Full function catalog: `docs/product/FUNCTION_CATALOG.md`
- Requirement/task/acceptance mapping: `docs/product/V1.0_TRACEABILITY_MATRIX.md`
- Architecture: `docs/architecture/`
- Database: `docs/database/`
- IPC and events: `docs/contracts/`
- AI and Prompt Eval: `docs/ai/`
- UI and interaction: `docs/ui/`
- Security and privacy: `SECURITY.md`, `docs/security/`
- Tests and acceptance: `docs/testing/`
- Tasks: `docs/tasks/`
- Frozen implementation choices: `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- Closed-loop working method: `docs/process/CODEX_EXECUTION_PLAYBOOK.md`
- Long-form engineering reference: `WorldForge_Codex_全流程技术开发指南.md`

## 5. Before editing

State:

1. task ID;
2. goal and non-goals;
3. allowed and forbidden paths;
4. affected packages and entry points;
5. database, IPC, Prompt, UI, security, and performance impact;
6. risks and unresolved decisions;
7. implementation sequence;
8. verification commands.

For complex work, produce a plan and wait for confirmation. A small, explicit bug fix may proceed directly within the active task scope.

Inspect the real repository before coding:

- existing implementation;
- tests and current failures;
- migrations;
- IPC schemas and preload APIs;
- repositories and use cases;
- UI pages and states;
- mocks, TODOs, disconnected paths;
- recent relevant changes.

## 6. During implementation

- Write or update a failing test or stable reproduction first when practical.
- Make the smallest complete end-to-end change.
- Do not refactor unrelated code.
- Do not modify files outside `ACTIVE_TASK.allowed_paths`.
- Do not add production dependencies without explicit approval.
- Do not use TODOs, empty implementations, fake success responses, or hard-coded demo data to claim completion.
- Do not silently change frozen architecture, product scope, database semantics, or UI behavior.
- Do not suppress errors to make tests pass.
- Do not continue to the next task automatically.

## 7. Frozen product boundaries

V1.0 contains the local single-author writing loop only.

Do not implement in V1.0:

- cloud storage or synchronization;
- WorldForge request proxying;
- account or hosted backends;
- model downloading, installation, container, GPU, or runtime management;
- vector databases, embeddings, reranking, or speculative retrieval adapters;
- MCP, CRDT, collaboration, or plugin marketplace;
- automatic publishing or reader analytics;
- autonomous preference learning;
- unattended bulk generation;
- community, achievements, or commercial operations systems.

V1.5 work remains in separate epics and must not block V1.0.

## 8. Non-negotiable invariants

### INV-001 Local data

Project text, settings, indexes, logs, prompts, evaluations, and backups stay on the user's machine. External model calls are made directly from the local Core process to the user-configured endpoint.

### INV-002 Candidate isolation

AI output is persisted as a Candidate first. It may enter the active Draft only after explicit author acceptance.

### INV-003 Single source of truth

`project.sqlite` is the only authoritative project data source. Renderer state, Tiptap JSON, caches, FTS indexes, exports, summaries, and diary entries are derived data.

### INV-004 Code-enforced safety

Locked blocks, revisions, immutable versions, project boundaries, path boundaries, and transaction integrity are enforced in code. Prompts are not security controls.

### INV-005 Author authority

AI may propose text, validation findings, state changes, summaries, and diary entries. It must not directly alter canonical facts, final text, or authoritative state.

Any failure against these invariants blocks merge and release.

## 9. Architecture boundaries

```text
Electron Main
  windows, lifecycle, OS integration, credential broker, Core supervision

Preload
  named whitelist APIs, boundary validation, MessagePort bridge

Renderer
  React, Tiptap, Zustand, user interaction and temporary stream display
  no Node, SQLite, filesystem, environment, or credentials

Core Service Utility Process
  sole SQLite writer
  files, FTS5, providers, validation, import/export, backups, recovery
```

Keep the initial Core as one Utility Process, separated internally into:

- asynchronous AI streaming;
- serialized SQLite write queue;
- CPU-heavy jobs.

Do not split processes without measured thresholds and an approved task.

## 10. Repository boundaries

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

- `contracts`: Zod schemas, IPC types, events, error codes; no business implementation.
- `domain`: pure entities and invariants; no Electron, React, SQLite, filesystem, or network.
- `core-service`: repositories, migrations, write queue, providers, FTS, validation, backup/import/export.
- `editor-core`: Tiptap schema, Block Patch, locking, block mapping, Chinese editor algorithms.
- `prompts`: versioned prompts, constraint serialization, structured parsing and cleaners.
- `testkit`: fixtures, provider stubs, fault injection, temporary projects; no production dependency.

Follow `docs/architecture/MODULE_BOUNDARIES.md`.

## 11. Frozen implementation decisions

Use `docs/decisions/IMPLEMENTATION_DECISIONS.md`.

Key decisions include:

- IDs use `crypto.randomUUID()`.
- order keys use 64-bit integer gaps with local rebalance.
- content hashes use SHA-256 over normalized semantic content.
- Draft Patch is an ordered atomic operation list.
- split keeps the original logical ID on the left; merge keeps the previous block ID.
- FTS5 uses trigram for Chinese when supported, with explicit short-query fallback.
- StyleProfile JSON is versioned and Zod-validated.
- automatic save defaults to 800 ms and never commits during IME composition.
- prompts have stable IDs and integer versions.

Do not make a different choice inside a feature task. Changing a frozen decision requires evidence, author approval, synchronized docs, and a separate task.

## 12. Database rules

Initialize project databases with:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

- All writes pass through one serialized Core write queue.
- Cross-table business transactions are controlled by Use Cases, not UI components.
- Required atomic boundaries include Draft Patch, Candidate acceptance, Version creation, state proposal resolution, structural operations, import commit, and migration.
- Migrations are append-only after merge.
- Automatic save increments Draft revision once per committed transaction.
- Revision is not a full snapshot.
- Version and VersionBlock have no business update path.
- FTS, summaries, statistics, and caches are rebuildable derived data.

## 13. Draft, Candidate, Version, and locking

- One active Draft per chapter.
- Candidate never overwrites Draft.
- Version is immutable.
- `logicalBlockId` tracks logical identity across Draft, Candidate, and Version.
- Candidate acceptance checks project, base revision, hashes, locked blocks, status, and completeness.
- Candidate acceptance is one atomic transaction and is undoable.
- Partial streamed output may only be stored as a partial Candidate.
- Lock protection is enforced in the editor and Core LockGuard.
- AI, replacement, split, merge, and move operations all respect locks.

## 14. Electron and IPC security

Required BrowserWindow settings:

```ts
nodeIntegration: false
contextIsolation: true
sandbox: true
webSecurity: true
```

- Preload exposes named minimal APIs only.
- Never expose raw `ipcRenderer.send`.
- Validate every IPC input with Zod.
- Use strict CSP.
- Block in-app remote navigation and new windows.
- Open approved external links in the OS browser.
- Normalize and validate paths against the active project or an explicit user-selected directory.
- Do not weaken security settings to fix development problems.

## 15. AI, Prompt, and Provider rules

V1 provider capability fields are limited to:

```ts
streaming
structuredOutput
maxContextTokens
maxOutputTokens
```

- Do not add speculative capability flags.
- Providers convert protocols only; they do not query project data or persist Candidates.
- Prompts live under `packages/prompts` and are registered by stable ID and version.
- Prompt, schema, constraint, cleaner, or provider changes require the corresponding Eval.
- Stream deltas are batched; do not send one IPC message per token.
- Renderer displays temporary output only.
- Persist Candidate after completion or explicit partial-save handling.
- Switching chapters must not cancel or mix runs.
- AI stages shown to users map to real program stages; do not fake countdowns.

## 16. UI rules

Visual direction: quiet editorial workspace.

- Keep the manuscript as the visual center.
- Do not use large AI-blue backgrounds.
- Do not use green to imply AI text is better.
- Use cards mainly for Candidates, conflicts, recovery, and risk.
- Support light, dark, eye-comfort, and high-contrast themes.
- Use SVG icons.
- Body column widths are 680/760/860 CSS px.
- Support 1280×800 minimum, 2560×1440 at 100/125/150%, and 21:9 ultrawide.
- Below 1100 CSS px use a right drawer; below 900 use drawers for both sides.
- Do not create page-level horizontal scrolling.
- Keep dangerous and high-frequency actions near active content on ultrawide displays.
- Cover empty, loading, failure, cancellation, conflict, read-only, and recovery states.
- New-user and professional modes share data and capabilities.

## 17. Required tests by change type

Always run:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Database or migration:

```bash
pnpm test:migration
pnpm test:integration
```

Electron, IPC, paths, or security:

```bash
pnpm test:security
pnpm test:e2e
```

Editor, Candidate, locking, or revision:

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

Prompt, constraint, provider, or AI schema:

```bash
pnpm test:eval
pnpm test:integration
```

Performance-sensitive or high-DPI work:

```bash
pnpm test:perf
pnpm test:e2e
```

If a command does not yet exist, state that truthfully. Only the assigned foundation task may create it.

## 18. Completion and evidence

A task is complete only when:

- behavior and non-goals match the individual task card;
- success, failure, cancellation, conflict, read-only, and recovery paths are addressed as applicable;
- tests were actually run and results recorded;
- migrations, IPC, schemas, Prompt versions, UI docs, and implementation are synchronized;
- required evidence exists under `docs/test-evidence/<TASK-ID>/`;
- `TASK_INDEX.md` and `V1.0_TRACEABILITY_MATRIX.md` are updated;
- no unrelated refactor, TODO, fake data, or empty implementation remains;
- remaining limitations and risks are stated.

`Implemented` means the feature is truly connected. `Verified` requires automated tests, manual checks, and evidence.

## 19. Closing an active task

Follow `docs/process/CODEX_EXECUTION_PLAYBOOK.md`:

1. update the individual task card;
2. update task index and traceability matrix;
3. save evidence;
4. record commit and risks in `ACTIVE_TASK.md`;
5. return `ACTIVE_TASK.md` to `NO_ACTIVE_CODING_TASK`;
6. wait for the author to activate the next task.

Never continue automatically to the next milestone or task.

## 20. Stop conditions

Stop and report when:

- there is no active coding task;
- documents conflict;
- a new production dependency is required but not approved;
- frozen scope or architecture must change;
- migration or recovery has irreversible risk;
- tests prove a hard guarantee cannot be met;
- the work would introduce a V1.0 excluded capability;
- required files or verification tools are unavailable.

Do not hide a blocked condition with a temporary workaround.
