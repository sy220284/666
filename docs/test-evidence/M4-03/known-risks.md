# M4-03 Known Risks

## Accepted / deferred

- M8-01 must bind validated DNS results to the actual outbound connection while retaining TLS verification against the original host name, then rerun release-level network security regression.
- Local model download, installation and lifecycle supervision remain outside M4-03.
- GenerationRun, Prompt Registry and concrete T0/T1 workflows remain M4-04 and later scope.

## Closure judgement

No open item blocks M4-03 verification within its task boundary. Credential ownership, cross-store consistency, mutation serialization, response limits, protocol behavior, offline isolation and current endpoint policy are implemented and covered. The DNS rebinding item remains an explicit M8-01 release blocker and cannot be silently removed.
