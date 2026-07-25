# M4-02 Known Risks

## Accepted / deferred

- Prompt Registry, GenerationRun, model capability profiles and generation UX remain later-task responsibilities.
- Lexical supplemental retrieval can miss semantic equivalents that share no indexed terms; embeddings and reranking are outside M4-02 scope.
- An oversized mandatory P0/P1 set fails explicitly rather than silently discarding constraints; callers must surface that failure.

## Closure judgement

No open risk blocks M4-02 verification. Temporal validity, current-draft exclusion, deterministic trimming, provenance and failure semantics are covered by automated regression and remain stable interfaces for later AI workflows.
