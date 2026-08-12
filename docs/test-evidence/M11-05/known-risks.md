# M11-05 Known Risks

1. Idea output is authoring material rather than story truth. Conversion must continue to require author confirmation and must never bypass the target domain operation.
2. `sourceContext` and generic Generation scope carry typed identities across several authoritative domains. New scope types must add strict target validation, clone/restore remap and deletion semantics before entering the public contract.
3. Conversion Preview is valid only for the exact source and target revision represented by its hash. Clients must request a new preview after any conflict instead of replaying an older payload.
4. Idea list and preview budgets are proven for the dedicated 100/1000/5000-Idea fixtures. Bounded pagination and payload caps must remain enforced as Idea content grows.
5. Electron E2E, Windows native IME and three-platform experience tests are materially slower than unit/integration suites and can experience hosted-runner variance. Merge authority remains the permanent CI gate rather than local timing observations.
6. Actions artifacts have retention windows. The committed Schema 2 manifest preserves integrity metadata, while workflow artifacts remain auxiliary diagnostics rather than the sole durable proof.
7. M11-06 may add project/volume summary workloads to generic scope, but it must reuse GenerationRun, Workflow Handler, Prompt Registry and ConstraintPackage authorities rather than introduce a parallel task runtime.
8. `IMPLEMENTED` is a static closure state. Effective `VERIFIED` remains bound to PR #375's eventual merge commit and its task verification context.
