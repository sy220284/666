# M11-05 Evidence Summary

- Task: `M11-05`
- Source PR: `#375` (`work → main`)
- Baseline: `c8793765083a6058eb490847b367b3e43bb46936`
- Pre-closure implementation revision: `17cf4176d98aeafef2596c7c06a122461638cd63`

## Implemented scope

1. GenerationRun uses one generic `project / volume / chapter / scene / entity / selection` scope model without fake chapters; legacy chapter tasks retain compatibility semantics.
2. Scope resolution validates target existence, target type and project ownership fail-closed across Generation start, retry, clone and restore paths.
3. The exhaustive `GenerationWorkflowHandlers` catalog owns source, constraint, prompt, parse and result persistence behavior for all seven run types while the existing Generation Runtime remains the single lifecycle authority.
4. `worldforge.idea-explore@1` is registered through the existing Prompt Registry and ModelSupport identity chain.
5. IdeaCard is an independent domain model with AI and manual creation, bounded list/detail reads, favorite, continue-exploration, discard and conversion lifecycle operations.
6. IdeaConversion Preview performs no authoritative write; Apply requires the exact preview hash and atomically commits the target operation, conversion audit and Idea terminal state.
7. Conversion target reads report `applied / target_missing / target_stale` from authoritative target data rather than copying a second target snapshot.
8. Clone/Restore remaps Idea, Conversion, Generation project scope and source-context identities while preserving terminal/cancel semantics and foreign-key integrity.
9. Main, Preload and Renderer use one trusted, strict-schema Idea IPC surface; Renderer gains no direct Node, SQLite, filesystem or credential capability.
10. The existing Planning workbench hosts Idea Capsule, shares read requests, invalidates latest-only lanes on project/scope/chapter switches, and reuses atomic author navigation after conversion.

## Pre-closure validation record

Quality run `31595253964` on `17cf4176d98aeafef2596c7c06a122461638cd63` proves the implementation-side Static Checks, Product Tests, Coverage, Reliability, Electron E2E, Windows native IME and macOS/Linux/Windows platform-experience gates. Its Release Audit rejected the pre-closure revision because M11-05 Schema 2 Evidence did not yet exist; this package supplies that governance input.

- Security run `31595253525`: success.
- Performance run `31595253596`: success.
- Electron E2E: 36 scenarios passed in 15.8 minutes.
- Electron E2E artifact `9141333338`, SHA256 `3ca28e171d60c439f80e27b434d66be67467a1cf33eff00a8e2cda85817d6e32`.
- Product tests and coverage artifact `9140912992`, SHA256 `f9f7970305fa7ad39c02baab9703d0de17b87efe115815146f5db62d0c1552d6`.
- Reliability artifact `9140819109`, SHA256 `079a65c64fcf354866da06ee5fc39c909fdd89aa7302333344f3d7c890b03184`.
- Windows native IME artifact `9140842702`, SHA256 `786ba1f0ce7d2eb5fe473f6f3164a68dcf3eccf22e9bb133a894e9a165d6352a`.
- macOS platform artifact `9140824965`, SHA256 `f0c2d15fcccafbde1f69aa2c04ce3ebfd190d22002a7dbadaf30cb4e08e58c8f`.
- Linux platform artifact `9140836258`, SHA256 `078b3c829f930f7f43b3029aa92dc3b90f6da5a65d5392f7e063d2365c29c7f2`.
- Windows platform artifact `9140848908`, SHA256 `a61a272ee4362958c82b0726ed4a800d16a6aac7edd67497231b3f45e6ace843`.
- Performance artifact `9140827533`, SHA256 `ea47c09e13671c3ef0ffbc6a30a47ba70721d3c91c072b82ad23ae5c22130936`.
- Security diagnostics artifact `9140753409`, SHA256 `c7394ba3a1ee77d36369f3b50c9242580f6939e0c3d6297af5fa07775a0bf372`.

### Product test totals

- Unit: 214 files / 1076 tests passed.
- Integration: 80 files / 218 tests passed.
- Migration: 29 files / 54 tests passed.
- Coverage execution: 360 files / 1457 tests passed.
- Coverage: statements 74.90%, branches 63.34%, functions 70.72%, lines 77.05%.

### M11-05 performance budgets

| Ideas |            List P95 | Conversion Preview P95 |   Renderer payload |
| ----- | ------------------: | ---------------------: | -----------------: |
| 100   | 1.642098 ms / 80 ms |    0.340973 ms / 80 ms | 30,796 B / 128 KiB |
| 1000  | 1.060113 ms / 80 ms |    0.246752 ms / 80 ms | 30,898 B / 128 KiB |
| 5000  | 1.468291 ms / 80 ms |    0.186829 ms / 80 ms | 30,986 B / 128 KiB |

All measured values remain below their declared budgets, including the 5000-Idea fixture.

## Data and security conclusions

- IdeaCard and IdeaConversion remain separate from Candidate and StoryTodo; conversion targets stay authoritative in their existing domains.
- Generic scope is validated against real project objects and rejects missing, mismatched and cross-project identities.
- Preview hash validation and one SQLite write transaction prevent stale-preview and partial-apply states.
- Recovery remains fail-closed for table policy and identity remap; migration and restored-copy tests prove project isolation and foreign-key integrity.
- Trusted sender validation and strict Contracts block Renderer authority injection before Core operations.

## Governance state

This package records M11-05 as `IMPLEMENTED` and binds Runtime verification to PR `#375`. Effective `VERIFIED` still requires the controlled merge result plus successful `main-verification` and `task-verification/M11-05` on the source PR merge commit.
