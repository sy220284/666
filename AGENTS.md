# AGENTS.md

## 1. Project

WorldForge is a local-first desktop writing workstation for a single author. The repository implements the frozen WorldForge V6.5 baseline.

Do not invent product scope, architecture, features, dependencies, cloud services, or task order outside the approved documents.

## 2. Mandatory startup order

Before any coding, refactoring, bug fix, test, migration, prompt, UI, or release task, read in this exact order:

```text
1. AGENTS.md
2. docs/PROJECT_EXECUTION_ENTRY.md
3. docs/tasks/ACTIVE_TASK.json
4. docs/tasks/ACTIVE_TASK.md
5. the individual task file referenced by ACTIVE_TASK
6. the task-specific documents listed there
7. existing code, tests, migrations, IPC contracts, and traceability state
```

Rules:

- `docs/tasks/ACTIVE_TASK.json` is the machine-readable authority for which coding task may run now.
- `docs/tasks/ACTIVE_TASK.md` is generated from that JSON and must remain synchronized.
- In `continuous-mainline` mode, a Verified task may automatically advance to the next dependency-ready task on `main`.
- In author-approved `implementation-mainline` mode, a task whose real code, required focused tests, and remote quality gate pass may be recorded as Implemented and advance to the next implementation-ready task. Evidence packaging, screenshots, exhaustive acceptance, traceability verification, and final Verified closure must be recorded in `deferredVerification` and completed in a later batch.
- Automatic advancement never permits overlapping tasks, skipped failures, or bypassed evidence.
- Milestone summaries are indexes, not executable task cards.
- Every active task must point to exactly one file under `docs/tasks/M0/` through `docs/tasks/M8/`.
- `agent.md` is a human-readable mirror. This file remains the repository instruction authority.

## 3. Document authority

```text
latest explicit author instruction
> approved ACTIVE_TASK scope and acceptance
> docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
> frozen specialist specs, ADRs, schemas, IPC, UI, security, and P0 acceptance
> docs/decisions/IMPLEMENTATION_DECISIONS.md
> this AGENTS.md and the execution playbook
> existing implementation
```

Do not silently choose one conflicting source. Report the conflict, affected files, and implementation impact.

## 4. V1.0 task stages

The V1.0 task system contains 48 independent task cards across nine stages:

```text
M0 Engineering, security, and runtime foundation
→ M1 Basic writing MVP
→ M2 Editing safety and version core
→ M3 Planning, canon, and continuity
→ M4 Retrieval and AI infrastructure
→ M5 AI generation and Candidate review
→ M6 Validation, search, and delivery
→ M7 Complete UI and experience integration
→ M8 Release hardening and acceptance
```

Stage rules:

- M1 must deliver a usable non-AI writing product: project, volume/chapter, editor, autosave, version, TXT/Markdown transfer, and recovery.
- Do not count future AI schemas, prompts, or domain placeholders as completed product progress.
- Do not use a table, command, model, recovery mechanism, or UI state before its upstream task is Verified. In `implementation-mainline` mode only, an upstream Implemented task may satisfy a coding dependency; it does not satisfy acceptance, release, or Verified claims.
- Every user-facing task includes a minimum usable UI. M3-07 through M3-10 migrate the Renderer to the frozen React/Tiptap/Zustand architecture before M4; M7 integrates and unifies rather than rewriting the foundation.
- Shared foundations such as recovery, FTS, Candidate, Prompt, and backup are implemented once and reused.
- V1.5 remains separate and must not block V1.0.

## 5. Primary references

- Full product baseline: `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- Function catalog: `docs/product/FUNCTION_CATALOG.md`
- Requirement/task/acceptance mapping: `docs/product/V1.0_TRACEABILITY_MATRIX.md`
- Roadmap: `docs/roadmap/V1.0_ROADMAP.md`
- Task index: `docs/tasks/TASK_INDEX.md`
- Architecture: `docs/architecture/`
- Database: `docs/database/`
- IPC and events: `docs/contracts/`
- AI and Eval: `docs/ai/`
- UI and interaction: `docs/ui/`
- Security and privacy: `SECURITY.md`, `docs/security/`
- Tests and acceptance: `docs/testing/`
- Frozen implementation choices: `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- Closed-loop process: `docs/process/CODEX_EXECUTION_PLAYBOOK.md`

## 6. Before editing

State:

1. task ID;
2. goal and non-goals;
3. verified dependencies;
4. allowed and forbidden paths;
5. affected packages and entry points;
6. database, IPC, Prompt, UI, security, recovery, and performance impact;
7. risks and unresolved decisions;
8. implementation sequence;
9. verification commands.

Inspect the real repository before coding:

- implementation and disconnected paths;
- tests and current failures;
- migrations and schema history;
- IPC schemas and preload APIs;
- repositories and Use Cases;
- UI pages and states;
- mocks, TODOs, and fake success paths;
- recent relevant changes.

## 7. During implementation

- Write or update a failing test or stable reproduction first when practical.
- Make the smallest complete end-to-end change.
- Do not modify files outside `ACTIVE_TASK.allowed_paths`.
- Do not refactor unrelated code.
- Do not add production dependencies without explicit approval.
- Do not use TODOs, empty implementations, fake success responses, or hard-coded demo data to claim completion.
- Do not silently change frozen architecture, product scope, data semantics, or UI behavior.
- Do not suppress errors to make tests pass.
- Under `continuous-mainline` authorization, continue only after the current task is Verified and its evidence and traceability are complete.
- Under `implementation-mainline` authorization, continue only after the current card has a real end-to-end implementation, its required focused tests and remote quality gate pass, and its deferred verification work is recorded. Any code, test, security, data-boundary, or migration failure still blocks advancement.

### Implementation outcome versus prescribed mechanism

- Task cards define required product intent, scope, non-goals, invariants, acceptance effects, and dependency order. They do not require an inferior mechanism when a stronger implementation is available.
- A deviation is beneficial only when evidence shows equal or better user-visible behavior, safety, correctness, maintainability, testability, recovery, and performance without expanding product scope or violating frozen boundaries.
- Do not reject an implementation solely because its internal mechanism differs from the task card. Compare achieved effects against the design intent and classify the difference as beneficial, neutral, or defective.
- Beneficial deviations must remain compatible with downstream tasks, preserve authoritative data semantics, reuse or strengthen shared foundations, and be documented with focused tests.
- A deviation is defective when it weakens an invariant, bypasses a shared safety boundary, hides failure, changes a non-goal, creates a second source of truth, or makes acceptance claims unsupported by evidence.
- When a stronger mechanism replaces a prescribed mechanism, record why the outcome is superior and retain regression tests proving the original acceptance intent.

## 8. Frozen product boundaries

V1.0 contains the local single-author writing loop only.

Do not implement in V1.0:

- cloud storage, synchronization, accounts, or hosted backends;
- WorldForge request proxying;
- model downloading, installation, container, GPU, or runtime management;
- vector databases, embeddings, reranking, or speculative retrieval adapters;
- MCP, CRDT, collaboration, or plugin marketplace;
- automatic publishing or reader analytics;
- autonomous preference learning;
- unattended bulk generation;
- community, achievements, or commercial operations systems.

## 9. Non-negotiable invariants

### INV-001 Local data

Project text, settings, indexes, logs, prompts, evaluations, and backups stay on the user's machine. External model calls are made directly from the local Core process to the user-configured endpoint.

### INV-002 Candidate isolation

AI output is persisted as a Candidate first. It may enter the active Draft only after explicit author acceptance.

### INV-003 Single source of truth

`project.sqlite` is the only authoritative project data source. Renderer state, Tiptap JSON, caches, FTS indexes, exports, summaries, and diary entries are derived.

### INV-004 Code-enforced safety

Locked blocks, revisions, hashes, immutable versions, project boundaries, path boundaries, and transaction integrity are enforced in code. Prompts are not security controls.

### INV-005 Author authority

AI may propose text, validation findings, state changes, summaries, and diary entries. It must not directly alter Canon, final text, or authoritative state.

Any failure against these invariants blocks merge and release.

## 10. Architecture boundaries

```text
Electron Main
  windows, lifecycle, OS integration, credential broker, Core supervision

Preload
  named whitelist APIs, boundary validation, MessagePort bridge

Renderer
  React, Tiptap, Zustand, user interaction, temporary stream display
  no Node, SQLite, filesystem, environment, or credentials

Core Service Utility Process
  sole SQLite writer
  files, FTS5, providers, validation, import/export, backups, recovery
```

Repository responsibilities:

- `contracts`: strict Zod schemas, IPC types, events, error codes; no business implementation.
- `domain`: pure entities and invariants; no Electron, React, SQLite, filesystem, or network.
- `core-service`: repositories, migrations, write queue, providers, FTS, validation, backup/import-export.
- `editor-core`: Tiptap schema, Block Patch, locking, block mapping, Chinese editor algorithms.
- `prompts`: versioned prompts, constraint serialization, parsing, and cleaners.
- `testkit`: fixtures, stubs, fault injection, temporary projects; no production dependency.

## 11. Database and writing rules

- `app.sqlite` stores application settings, recent projects, provider metadata, and window/UI preferences; never project text.
- Each project has one authoritative `project.sqlite`.
- All writes pass through one serialized Core write queue.
- Migrations are append-only after merge.
- Draft Patch, Candidate acceptance, Version creation, state proposal resolution, structural operations, import, and migration are atomic.
- Automatic save increments Draft Revision once per committed transaction.
- Version and VersionBlock have no business update path.
- FTS, statistics, summaries, and caches are rebuildable.
- One active Draft per chapter.
- Candidate never overwrites Draft.
- All AI, replacement, split, merge, and move operations respect LockGuard, Revision, and Hash.
- High-risk operations use the shared recovery-point foundation.

## 12. Electron, IPC, Provider, and Prompt rules

Required BrowserWindow settings:

```ts
nodeIntegration: false;
contextIsolation: true;
sandbox: true;
webSecurity: true;
```

- Preload exposes named minimal APIs only.
- Validate every IPC and external model payload with strict Zod schemas.
- Block remote navigation and new windows; approved external links open in the OS browser.
- Providers convert protocols only; they do not query project data or persist Candidates.
- Credentials stay in the OS Credential Store; SQLite stores only `credentialRef`.
- Prompts live under `packages/prompts`, have stable IDs and integer versions, and bind input/output schemas.
- Prompt changes require corresponding Eval.
- Stream deltas are batched; never emit one IPC message per token.
- AI stages shown to users must map to real program stages.

## 13. UI rules

- The manuscript remains the visual center.
- User-facing functions are operable in their own task; M7 unifies navigation and visual systems.
- New-user and professional modes share data and commands.
- Theme A and Theme B never fork business logic.
- Cover empty, loading, success, failure, cancellation, conflict, read-only, and recovery states.
- Support the frozen target viewports and DPI matrix.
- Do not use green to imply AI text is better.
- Unimplemented functions are not shown as usable.

## 14. Required tests

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

Prompt, constraints, Provider, or AI schema:

```bash
pnpm test:eval
pnpm test:integration
```

Performance or high-DPI:

```bash
pnpm test:perf
pnpm test:e2e
```

If a command does not yet exist, state that truthfully. Only the assigned foundation task may create it.

## 15. Completion and evidence

A task is complete only when:

- its dependencies are Verified;
- behavior and non-goals match the individual task card;
- the feature is reachable through its minimum UI when user-facing;
- success, failure, cancellation, conflict, read-only, and recovery paths are addressed as applicable;
- tests were actually run and results recorded;
- migrations, IPC, schemas, Prompt versions, UI docs, and implementation are synchronized;
- evidence exists under `docs/test-evidence/<TASK-ID>/`;
- `TASK_INDEX.md` and `V1.0_TRACEABILITY_MATRIX.md` are updated;
- no unrelated refactor, TODO, fake data, or empty implementation remains.

Task closure follows `docs/process/DEVELOPMENT_AUTOMATION.md`. In continuous-mainline mode it closes the current task and activates the next dependency-ready task in one controlled transition; otherwise it returns to `NO_ACTIVE_CODING_TASK`.

In `implementation-mainline` mode, `taskctl advance` records the current card as Implemented without claiming completion, appends the postponed evidence and acceptance work to `deferredVerification`, and activates exactly one next implementation-ready card. Release remains blocked until all required cards are Verified.

## 16. Repository truth, development, and automation boundaries

### 16.1 Role separation

```text
task card and approved documents define the required outcome
→ the development executor reads, designs, edits, and writes formal files
→ the task branch and its PR Head contain the complete implementation truth
→ generic workflows validate that committed truth
→ Controlled Merge merges an unchanged validated Head
→ Main Verification validates the merge commit
```

- The development executor means the connected repository tools, a local workspace, or another author-approved coding environment. It owns requirement analysis, source edits, tests, migrations, contracts, UI wiring, documentation, task-state edits, and commits.
- GitHub Actions and other automatic workflows are validators and controlled executors. They are not temporary development machines and must not replace the development executor.
- The PR Head commit is the only merge candidate and the only valid source for code, test, evidence, and completion claims.

### 16.2 Required write path

- Read the latest `main`, active task state, task card, and affected source files before writing.
- Before every repository write, verify repository, target branch, base SHA, task ID, and allowed paths. Never rely on a default branch parameter for a write.
- Write formal source files directly to the task branch through normal Git commits, connector file writes, or the Git blob/tree/commit API.
- If local clone or network access is unavailable, continue through connector reads and writes or Git object commits. Do not move business-code generation into CI.
- After writing, re-read critical files from the actual PR Head and verify that entry points, exports, contracts, runtime wiring, tests, docs, and task state are present in that commit.
- Build and test results from an uncommitted working tree never prove the PR Head.

### 16.3 Generic workflow rule

Permanent workflows must remain repository-level and task-independent. Valid permanent workflow roles are limited to generic capabilities such as:

```text
PR Policy
Task Governance
Evidence
Security
Performance
Quality
Controlled Merge
Main Verification
Repository Diagnostics
```

Permanent workflows and their helper code must not:

- contain a task ID, task-specific branch, or task-specific feature name;
- generate, patch, or rewrite formal TypeScript, SQL, IPC, Renderer, test, task-card, or product-document content;
- create a dedicated implementation runner, generator, or diagnostic workflow for one task;
- change `ACTIVE_TASK`, expand `allowedPaths`, mark a task Implemented or Verified, or activate the next task inside a temporary Runner working tree;
- validate a generated-but-uncommitted tree as if it were the PR Head.

Task-specific behavior belongs in the task card, `ACTIVE_TASK`, formal source code, tests, and evidence. The workflow remains stable and reads generic repository configuration.

### 16.4 Allowed workflow outputs

Workflows may generate ephemeral validation outputs only, including:

- build and package artifacts;
- test, coverage, security, performance, and E2E reports;
- screenshots and diagnostics;
- evidence integrity reports and commit statuses;
- controlled merge and post-merge verification records.

A repository-defined deterministic generator may update a committed mirror or generated source only through a new commit followed by a fresh complete gate run on the new Head. An uncommitted generated tree is never eligible for merge evidence.

### 16.5 Clean working-tree enforcement

Formal gates must validate the checked-out PR Head without source mutation. Run clean-tree checks before and after validation:

```bash
git diff --exit-code
test -z "$(git status --porcelain)"
```

If formatting, generation, tests, or documentation scripts alter tracked formal files, the gate fails. Commit the required changes through the development executor and rerun the gates on the new Head.

### 16.6 Evidence and completion truth

- Evidence must identify the final PR Head SHA and must report only commands actually executed against that committed tree.
- Do not describe coverage, success, UI reachability, or completion before the corresponding gate or manual acceptance has run.
- Runner success, patch-script success, Artifact upload, mergeability, and a temporary green test do not individually prove task completion.
- Six permanent gates must refer to the same unchanged PR Head. Only `Controlled Merge` may merge it, and Main Verification must succeed before the mainline closure is reported.

### 16.7 Schema version truth

The current project schema version is derived from the normalized ordered Migration sequence. Do not hard-code the current version in production logic, manifests, recovery names, migration tests, or security tests. Adding the next valid Migration must make all current-version consumers use that latest registered version automatically.

### 16.8 Stop and rebuild conditions

Stop the current implementation path and rebuild from the latest `main` when any of these occurs:

- CI generates formal source that is absent from the PR Head;
- the Runner working tree and PR Head differ;
- task-specific workflows or patch directories are being added;
- temporary scripts and commits dominate the formal implementation;
- permanent gates and a temporary runner validate different trees;
- task JSON, mirror, card, index, or evidence remain inconsistent;
- a write reaches `main` or the wrong branch.

The recovery path is:

```text
stop
→ identify and classify the root cause
→ restore any incorrectly moved branch exactly
→ create a clean branch from the latest main
→ write formal files directly to that branch
→ remove task-specific generators and temporary workflows
→ verify the actual PR Head with generic permanent gates
```
