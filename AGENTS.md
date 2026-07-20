# AGENTS.md

## 1. Project

WorldForge is a local-first desktop writing workstation for a single author. The repository implements the frozen WorldForge V6.5 baseline.

Do not invent product scope, architecture, features, dependencies, cloud services, or task order outside approved documents.

## 2. Mandatory startup order

Before coding, refactoring, testing, migration, UI, prompt, documentation, governance, or release work, read:

```text
1. AGENTS.md
2. docs/PROJECT_EXECUTION_ENTRY.md
3. docs/tasks/ACTIVE_TASK.json
4. docs/tasks/ACTIVE_TASK.md
5. the task file referenced by ACTIVE_TASK
6. task-specific required documents
7. existing code, tests, migrations, contracts and traceability state
```

Rules:

- `ACTIVE_TASK.json` is the machine authority.
- `ACTIVE_TASK.md` is generated and must remain synchronized.
- Only one task may be `IN_PROGRESS`.
- Milestone summaries are indexes, not executable task cards.
- Every active task points to exactly one file under `docs/tasks/M0/` through `M8/`.
- `agent.md` is a mirror; this file is the instruction authority.

## 3. Document authority

```text
latest explicit author instruction
> approved ACTIVE_TASK scope and acceptance
> docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
> frozen specialist specs, ADRs, schemas, contracts, UI, security and P0 acceptance
> docs/decisions/IMPLEMENTATION_DECISIONS.md
> this AGENTS.md and execution playbooks
> existing implementation
```

Do not silently resolve conflicts. Report the sources, affected files and implementation impact.

## 4. V1.0 stages

```text
M0 Engineering, security and runtime foundation
→ M1 Basic writing MVP
→ M2 Editing safety and version core
→ M3 Planning, canon and continuity
→ M4 Retrieval and AI infrastructure
→ M5 AI generation and Candidate review
→ M6 Validation, search and delivery
→ M7 Complete UI and experience integration
→ M8 Release hardening and acceptance
```

Stage rules:

- M1 delivers a usable non-AI writing product.
- Future AI schemas, prompts or placeholders do not count as completed product progress.
- Upstream foundations must exist before downstream use.
- In implementation-first mode, `Implemented` may satisfy coding dependencies but never release or final acceptance claims.
- M3-07 through M3-10 migrate Renderer to React/Tiptap/Zustand before M4.
- Shared recovery, FTS, Candidate, Prompt and backup foundations are implemented once and reused.
- V1.5 must not block V1.0.

## 5. Development modes

### 5.1 Implementation PR mode

The default development path is:

```text
one active task
→ task branch
→ smallest complete implementation
→ required focused tests
→ Draft fast feedback
→ Ready permanent gates
→ record Implemented and deferredVerification when applicable
→ Controlled Merge
→ Main Verification provenance and static check
→ next task
```

`Implemented` means real code and required focused verification exist on the PR Head. It does not mean final milestone acceptance.

### 5.2 Batch verification

Final evidence, exhaustive manual review and `Verified` closure may be batched by milestone. Do not open a second closure-only PR for every ordinary task.

For M3, continue M3-06 through M3-10 before the normal batch close. Before M4 begins, complete the required M3 verification batch.

Interrupt continuous implementation only for:

- data or structural safety defects;
- a defect blocking downstream work;
- task or mainline provenance corruption;
- explicit author instruction.

## 6. Primary references

- Product baseline: `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- Function catalog: `docs/product/FUNCTION_CATALOG.md`
- Traceability: `docs/product/V1.0_TRACEABILITY_MATRIX.md`
- Roadmap: `docs/roadmap/V1.0_ROADMAP.md`
- Task index: `docs/tasks/TASK_INDEX.md`
- Architecture: `docs/architecture/`
- Database: `docs/database/`
- IPC/events: `docs/contracts/`
- AI/Eval: `docs/ai/`
- UI: `docs/ui/`
- Security: `SECURITY.md`, `docs/security/`
- Testing: `docs/testing/`
- Decisions: `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- Execution: `docs/process/CODEX_EXECUTION_PLAYBOOK.md`
- Automation: `docs/process/DEVELOPMENT_AUTOMATION.md`

## 7. Before editing

State and verify:

1. task ID, goal and non-goals;
2. dependencies;
3. allowed and forbidden paths;
4. affected packages and entry points;
5. database, IPC, Prompt, UI, security, recovery and performance impact;
6. risks and unresolved decisions;
7. implementation sequence;
8. verification commands.

Inspect the real repository for implementation paths, tests, migrations, contracts, repositories, use cases, UI states, mocks, TODOs, fake success paths and recent relevant changes.

## 8. During implementation

- Write a failing test or stable reproduction first when practical.
- Make the smallest complete end-to-end change.
- Do not modify outside `ACTIVE_TASK.allowedPaths` except an explicitly authorized governance repair.
- Do not refactor unrelated code.
- Do not add production dependencies without approval.
- Do not use TODOs, empty implementations, fake success, hard-coded demo data or suppressed errors to claim completion.
- Do not silently alter frozen architecture, product scope, data semantics or UI behavior.
- Any database, migration, security, project-boundary, transaction or recovery failure blocks advancement.
- Re-read critical files from the actual PR Head after writing.

A stronger internal mechanism may replace a prescribed mechanism only when it preserves or improves user-visible behavior, safety, correctness, maintainability, testability, recovery and performance without expanding scope. Document the reason and keep regression tests for the original intent.

## 9. Frozen product boundaries

V1.0 contains the local single-author writing loop only. Do not implement:

- cloud storage, sync, accounts or hosted backends;
- WorldForge request proxying;
- model download, installation, container, GPU or runtime management;
- vector databases, embeddings, reranking or speculative retrieval adapters;
- MCP, CRDT, collaboration or plugin marketplace;
- automatic publishing or reader analytics;
- autonomous preference learning;
- unattended bulk generation;
- community, achievement or commercial systems.

## 10. Non-negotiable invariants

### INV-001 Local data

Project text, settings, indexes, logs, prompts, evaluations and backups stay local. External model calls go directly from local Core to the user-configured endpoint.

### INV-002 Candidate isolation

AI output is persisted as Candidate first and may enter Draft only after explicit author acceptance.

### INV-003 Single source of truth

`project.sqlite` is the sole authoritative project source. Renderer state, Tiptap JSON, caches, FTS, exports, summaries and diary entries are derived.

### INV-004 Code-enforced safety

Locks, revisions, hashes, immutable versions, project/path boundaries and transaction integrity are enforced in code. Prompts are not security controls.

### INV-005 Author authority

AI may propose text, findings and state changes. It must not directly alter Canon, final text or authoritative state.

Any invariant failure blocks merge and release.

## 11. Architecture boundaries

```text
Electron Main
  lifecycle, windows, OS integration, credential broker, Core supervision

Preload
  named whitelist APIs, boundary validation, MessagePort bridge

Renderer
  React, Tiptap, Zustand and temporary stream display
  no Node, SQLite, filesystem, environment or credentials

Core Service Utility Process
  sole SQLite writer
  files, FTS5, providers, validation, import/export, backup and recovery
```

Package responsibilities:

- `contracts`: strict schemas, IPC types, events and error codes; no business implementation.
- `domain`: pure entities and invariants; no Electron, React, SQLite, filesystem or network.
- `core-service`: repositories, migrations, write queue, providers, FTS, validation, backup/import-export.
- `editor-core`: Tiptap schema, Block Patch, locking, block mapping and Chinese editor algorithms.
- `prompts`: versioned prompts, constraint serialization, parsing and cleaners.
- `testkit`: fixtures, stubs, fault injection and temporary projects; no production dependency.

## 12. Database and writing rules

- `app.sqlite` stores application settings and metadata, never project text.
- Each project has one authoritative `project.sqlite`.
- All writes pass through one serialized Core write queue.
- Migrations are append-only after merge.
- Draft Patch, Candidate acceptance, Version creation, state proposal resolution, structural operations, import and migration are atomic.
- Autosave increments Draft Revision once per committed transaction.
- Version and VersionBlock have no business update path.
- FTS, statistics, summaries and caches are rebuildable.
- One active Draft per chapter.
- Candidate never overwrites Draft.
- AI, replacement, split, merge and move operations respect LockGuard, Revision and Hash.
- High-risk operations use the shared recovery-point foundation.
- Current schema version is derived from the ordered Migration registry, never hard-coded.

## 13. Electron, IPC, Provider and Prompt rules

Required BrowserWindow settings:

```ts
nodeIntegration: false;
contextIsolation: true;
sandbox: true;
webSecurity: true;
```

- Preload exposes named minimal APIs only.
- Validate every IPC and external model payload with strict schemas.
- Block remote navigation and new windows; approved links open in the OS browser.
- Providers convert protocols only; they do not query project data or persist Candidates.
- Credentials stay in the OS Credential Store; SQLite stores only `credentialRef`.
- Prompts use stable IDs and integer versions and bind input/output schemas.
- Prompt changes require corresponding Eval.
- Batch stream deltas; do not emit one IPC message per token.
- User-visible AI stages must map to real program stages.

## 14. UI rules

- The manuscript remains the visual center.
- User-facing functions are operable in their task; M7 unifies rather than rewrites foundations.
- New-user and professional modes share data and commands.
- Themes do not fork business logic.
- Cover empty, loading, success, failure, cancellation, conflict, read-only and recovery states.
- Support frozen viewport and DPI targets.
- Do not use green to imply AI text is better.
- Unimplemented functions are not shown as usable.

## 15. Verification routing

Always run the task-required focused checks. Baseline commands are:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Additional routing:

- Migration/repository: `pnpm test:migration`, `pnpm test:integration`
- Electron/IPC/path/security: `pnpm test:security`, `pnpm test:e2e`
- Editor/Candidate/lock/revision: `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`
- Prompt/provider/AI schema: `pnpm test:eval`, `pnpm test:integration`
- Performance/DPI/search/streaming: `pnpm test:perf`, and E2E when user-visible
- Pure documentation/evidence: governance and static checks only

Do not claim a command exists or passed unless it was actually run.

## 16. Evidence

Evidence is a versioned text record. New task evidence requires:

```text
docs/test-evidence/<TASK-ID>/
├─ summary.md
├─ commands.txt
├─ known-risks.md
└─ manifest.json
```

- `summary.md` contains implementation scope, actual test results, manual review and quality conclusion.
- `commands.txt` records only commands actually run and their outcomes.
- `known-risks.md` records remaining risks or explicitly states none.
- `manifest.json` binds file integrity and the source commit.
- Screenshots, screenshot manifests, separate manual-acceptance files and separate quality matrices are not required.
- Do not generate screenshots or artifacts solely to satisfy evidence.
- Legacy evidence may retain historical auxiliary files when listed in its Manifest.
- PR Evidence checks only changed task directories; all Verified evidence is replayed weekly, manually or at milestone/release gates.

## 17. Completion

A coding task may be recorded as `Implemented` only when:

- real implementation exists on the PR Head;
- required focused tests and permanent Ready gates pass;
- migrations, contracts, UI and documentation are synchronized as applicable;
- no unrelated refactor, fake data or empty implementation remains;
- deferred final verification is recorded.

A task may be recorded as `Verified` only when its final text evidence is bound to a committed revision and its milestone acceptance is complete.

Do not report completion before re-reading the actual PR Head and verifying the claimed result.

## 18. Repository truth and automation boundaries

```text
task card and approved documents define outcome
→ development executor writes formal files
→ PR Head contains implementation truth
→ generic workflows validate the committed Head
→ Controlled Merge merges the unchanged validated Head
→ Main Verification validates final provenance and static consistency
```

Permanent workflows may validate, build, test, package and emit diagnostics. They must not generate or rewrite formal business code, task state or product documents in a temporary runner tree.

Before every write, verify repository, branch, base SHA, task ID and allowed paths. After writing, re-read actual branch files. Uncommitted or temporary runner results never prove the PR Head.

Formal gates run clean-tree checks before and after validation. Any formatter, generator or test that mutates tracked formal files must fail until the required change is committed and the gate reruns.

Stop and rebuild from latest `main` when CI-generated formal source differs from the PR Head, task-specific workflows appear, temporary scripts dominate the implementation, different gates validate different trees, task/evidence state is inconsistent, or a write reaches the wrong branch.
