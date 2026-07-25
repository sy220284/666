# M4-01 Known Risks

## Accepted / deferred

- The final full-project search interface and safe batch replacement transaction belong to M6-03.
- FTS remains derived, deletable data. A damaged or stale index can reduce recall until rebuild, while authoritative business data remains available and unchanged.
- Search relevance is deterministic lexical retrieval; embedding and reranking remain outside V1 M4-01 scope.

## Closure judgement

No open risk blocks M4-01 verification. The remaining items are explicit later-task scope and do not weaken the authoritative-data, isolation, rebuild or performance guarantees verified here.
