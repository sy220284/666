# M10-19 Known Risks

1. Generation `cancel()` keeps its established caller contract; only Task/Project/Core drain bridges wait for execution quiescence. Do not change `cancel()` itself to await a blocked parse/persist stage.
2. `saving_candidate` is an atomic non-cancellable stage. Project drain may poll it; Core drain must wait for it to settle rather than force-abort or fail shutdown.
3. Active Structure authority applies to mutable current structure. Historical Version read/export semantics remain separately governed and must not be accidentally hidden by write guards.
4. Entity permanent-delete blockers follow real SQLite `RESTRICT/NO ACTION` foreign keys. New independent Entity FK dependencies should become blockers automatically; `CASCADE` owned data remains deletable with the Entity.
5. StateProposal history currently intentionally retains Entity identity through `ON DELETE RESTRICT`; deletion is blocked while such history exists. Changing this retention policy requires a future forward Migration, not ad-hoc deletes.
6. `command_receipts` currently closes the confirmed Import crash window. Do not infer that every write command is automatically durable across Core restart; future high-side-effect composite commands must explicitly adopt a durable receipt or an equivalent persistent identity.
7. `semantic_revision` is an invalidation authority, not a replacement for chapter-level SceneBeat content hashes. New semantic tables/relations must either increment it via a forward Migration or be represented by another authoritative digest.
8. Recovery Overview must stay fail-closed. Removing the duplicate Version scan must not reintroduce `catch → []` behavior that hides database read/parse failures.
9. Renderer degraded states retain the last trustworthy projection only with an explicit visible degraded signal; retained data cannot be presented as a successful current refresh.
10. Migration 0030 is mutable only while M10-19 has not entered verified main. After merge it becomes frozen and all changes must use a new forward Migration.
