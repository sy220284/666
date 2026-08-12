# M11-04 Evidence Summary

- Task: `M11-04`
- Source PR: `#364` (`work → main`)
- Baseline: `8628d66c1155c5aa2229d16a266f4c70266fefb9`
- Pre-closure implementation revision: `adb3cf4f2e1de1d15cad00286e937e53b67b4f37`

## Implemented scope

M11-04 has completed the frozen Phase 0 and Phase 1 scope:

1. Prompt Version Authority uses one `PromptIdentity` and preserves historical prompt versions.
2. Project Operation Semantics is centralized in Main and exhaustively typed.
3. Renderer request ownership is unified through shared/replace/stale/cancel lifecycle coordinators.
4. Cross-workbench navigation uses one atomic navigation commit with project-scope fail-closed behavior.
5. Project-domain and generation error mapping are separated and normalized at the public boundary.
6. Story Knowledge is a read-only Contracts → Core → Main → Preload → Renderer projection path.
7. Character cards, relationship graph, story/character timelines, foreshadowing lanes, arc routes, history projection and chapter knowledge assist are bounded projections over authoritative data.
8. History and chapter-assist queries use bounded windows/stable pagination and do not create a second persistence truth.
9. Lifecycle coverage includes success, empty, failure, retry, cancellation, stale responses, read-only, project switch and chapter switch behavior.
10. 100/300/1000 chapter performance budgets and Renderer payload budgets are enforced by dedicated tests.

## Pre-closure validation record

Quality run `31557200227` on `adb3cf4f2e1de1d15cad00286e937e53b67b4f37` proves the implementation-side gates already completed successfully: Static Checks, Unit, Integration, Migration, Coverage, Reliability and Windows native IME. Its Release Audit rejected the pre-closure revision because M11-04 Schema 2 Evidence did not yet exist; this Evidence package supplies that governance input.

- Security run `31557200176`: success.
- Performance run `31557200110`: success.
- Product tests and coverage artifact `9126471682`, SHA256 `0942ff228c67683ba3d33d891850fbb02ff470a128d9ce7348d29dfebcb3c9f1`.
- Reliability artifact `9126427296`, SHA256 `d0f1c9a5a7b28ae7ef27ceee69d2d443d6cba2490bd56481ec2c44e69058990b`.
- Windows native IME artifact `9126443832`, SHA256 `b8e9510b222b2d5bb7d748b5343d5812e1040043d29085b8f492096782d47530`.
- Performance artifact `9126415831`, SHA256 `194e34eeae4dd2395f4be722c05c6e7374fc37b5678b7f2522d9f27ce5245364`.
- Security diagnostics artifact `9126400860`, SHA256 `d765a22dc7123711e5630a8d58452613109d1ab61edde0f73a05c21ffd79b2b5`.

### Product test totals

- Unit: 200 files / 1021 tests passed.
- Integration: 77 files / 212 tests passed.
- Migration: 28 files / 53 tests passed.
- Coverage execution: 341 files / 1393 tests passed.
- Coverage: statements 74.38%, branches 62.33%, functions 69.32%, lines 76.54%.

### M11-04 performance budgets

| Chapters | chapter_assist P95 | History P95 | chapter_assist payload | History payload |
| --- | ---: | ---: | ---: | ---: |
| 100 | 2.219501 ms / 80 ms | 0.434667 ms / 80 ms | 418 B / 128 KiB | 355 B / 128 KiB |
| 300 | 2.342833 ms / 80 ms | 0.434201 ms / 80 ms | 419 B / 128 KiB | 355 B / 128 KiB |
| 1000 | 2.544464 ms / 80 ms | 0.415166 ms / 80 ms | 420 B / 128 KiB | 355 B / 128 KiB |

All measured values remain below the declared budgets, including the 1000-chapter case.

## Data and security conclusions

- Story Knowledge remains a reconstructable read-only projection; no graph snapshot or visualization cache becomes a parallel source of truth.
- Projection endpoints do not own INSERT/UPDATE/DELETE operations.
- Renderer gains no direct Node, SQLite, filesystem, environment-variable or credential access.
- Project scope, stale-request ownership and atomic navigation remain fail-closed across project/chapter switches.

## Governance state

This package records M11-04 as `IMPLEMENTED` and binds Runtime verification to PR `#364`. Effective `VERIFIED` still requires the controlled merge result plus successful `main-verification` and `task-verification/M11-04` on the source PR merge commit.
