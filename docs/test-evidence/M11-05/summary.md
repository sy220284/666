# M11-05 Evidence Summary

- Task: `M11-05`
- Source PR: `#383` (`work → main`)
- Current main baseline: `c0ed73bc575540ab90de980f149f30485f55d371`
- Final implementation commit: `f34e1c109e28b34d50ff4d7e19537af83c239be9`

## Closure scope

PR #383 refreshes the M11-05 implementation after the repository-wide review while preserving the original Idea Capsule architecture and data model.

1. `idea_explore` now resolves and validates its real project/volume/chapter/scene/entity/selection scope before a GenerationRun is persisted, so a selection that exists only in an archived Draft is rejected without leaving a run record.
2. Project operation routing now parses successful routed results through `CoreProjectResultSchema`, so malformed success envelopes fail closed into the established internal-error contract.
3. PR Policy now installs trusted policy dependencies and validates candidate workflow structure in addition to the existing trusted policy checks.
4. Release publishing now depends on `release-status-ready`, and the CI policy inventory covers the current engineering-validation, full-work-validation, release and toolchain-export workflows.
5. Regression coverage adds the archived-Draft selection case, the strict CoreProjectResult success-envelope contract, and a root-runner guard for the POSIX permission compensation test.

## Validation record for the implementation commit

- PR Policy run `31652068681`: success on Ready PR #383.
- Security run `31652068522`: success.
- Performance run `31652068500`: success.
- Quality run `31652068629` reached the final Evidence check with governance unit tests, CI policy validation, release configuration validation and the effective 72-package Evidence scan already successful. Its release-audit rejection was the expected signal that the current M11-05 Runtime/Evidence closure had not yet been attached to PR #383.
- The earlier M11-05 closure for PR #375 remains historical evidence for the full Idea Capsule implementation; PR #383 adds the narrow post-review corrections above and rebinds current task verification to the new source PR.

The authoritative final acceptance is the permanent PR Policy, Quality, Security and Performance gate set on the closure head produced after this implementation commit.

## Data and user-impact conclusions

- Invalid or stale Idea selection scope is rejected before generation persistence, preventing ghost AI runs against archived author material.
- Routed project operations cannot return a malformed success payload to the caller; the boundary enforces the public result contract before returning.
- Release publishing cannot advance before the repository declares the release candidate ready.
- Trusted PR policy execution validates the workflow structure it relies on, reducing the chance that a candidate changes CI shape without detection.

## Governance state

M11-05 remains statically `IMPLEMENTED`. Runtime verification is rebound to source PR `#383`; effective `VERIFIED` is derived only after the controlled squash merge and successful `main-verification` plus `task-verification/M11-05` on the merge commit.
