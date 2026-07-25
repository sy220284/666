from pathlib import Path
import json, hashlib, re

ROOT=Path('.')
VERIFIED_AT='2026-07-25T14:45:00.000Z'
EVIDENCE_HEAD='c1f018cfc1ed19ec3e129300508e3c3ce616c526'

state_path=ROOT/'docs/tasks/ACTIVE_TASK.json'
state=json.loads(state_path.read_text())
state['activeTask']['status']='VERIFIED_HOLD'
state['deferredVerification']=[]
state['lastVerifiedTask']={
    'id':'M4-03',
    'commit':EVIDENCE_HEAD,
    'verifiedAt':VERIFIED_AT,
    'evidenceHead':EVIDENCE_HEAD,
}
state['verificationHold']={
    'taskId':'M4-03',
    'verifiedTasks':['M4-01','M4-02','M4-03'],
    'nextTaskId':'M4-04',
    'heldAt':VERIFIED_AT,
    'reason':'按用户指令，M4-01—M4-03已完成终验关闭，暂不激活M4-04',
    'allowedPaths':[
        'package.json',
        'docs/tasks/ACTIVE_TASK.json',
        'docs/tasks/ACTIVE_TASK.md',
        'docs/tasks/TASK_INDEX.md',
        'docs/tasks/M4_TASKS.md',
        'docs/tasks/M4/M4-01_FTS_INDEX_DICTIONARY.md',
        'docs/tasks/M4/M4-02_CONSTRAINT_PACKAGE.md',
        'docs/tasks/M4/M4-03_PROVIDER_CREDENTIAL_CONNECTION.md',
        'docs/product/V1.0_TRACEABILITY_MATRIX.md',
        'docs/test-evidence/M4-01/',
        'docs/test-evidence/M4-02/',
        'docs/test-evidence/M4-03/',
    ],
    'forbiddenPaths':[],
}
state_path.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n')

mirror=ROOT/'docs/tasks/ACTIVE_TASK.md'
text=mirror.read_text()
text=text.replace('```text\nIMPLEMENTED\n```','```text\nVERIFIED_HOLD\n```',1)
mirror.write_text(text)

pkg_path=ROOT/'package.json'
pkg=json.loads(pkg_path.read_text())
pkg['scripts']['task:validate']='node .github/governance/verification-hold-taskctl.mjs validate'
pkg['scripts']['task:preflight']='node .github/governance/verification-hold-taskctl.mjs preflight'
pkg_path.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n')

idx=ROOT/'docs/tasks/TASK_INDEX.md'
text=idx.read_text()
for task in ('M4-01','M4-02','M4-03'):
    pattern=rf'^(\| {task} \|.*?\| )Implemented( \|)$'
    text,n=re.subn(pattern,rf'\1Verified\2',text,flags=re.M)
    if n!=1: raise SystemExit(f'{task} index replacement count {n}')
idx.write_text(text)

cards={
'M4-01':ROOT/'docs/tasks/M4/M4-01_FTS_INDEX_DICTIONARY.md',
'M4-02':ROOT/'docs/tasks/M4/M4-02_CONSTRAINT_PACKAGE.md',
'M4-03':ROOT/'docs/tasks/M4/M4-03_PROVIDER_CREDENTIAL_CONNECTION.md',
}
closures={
'M4-01':'''
## 终验关闭

- 最终状态：Verified。
- 初始实现提交：`c37aebb53aa713622d749e5f9b9d837f4642d4bf`。
- 全量审计整改由PR #208合并为`dfca784f2ede657986fee7d5e71eee54e9ee897d`，修复短词/陈旧索引下无锚点章节标题回退并补齐跨模块回归。
- 最终审计门禁：Quality `30158717765`、Security `30158717671`、Performance `30158717652`、PR Policy `30158717668`、Task Governance `30158717666`、Evidence `30158717649`全部成功。
- 最终搜索页面和安全批量替换仍由M6-03承接，不重新打开已验证的公共索引、权威回读、隔离、重建和性能合同。
''',
'M4-02':'''
## 终验关闭

- 最终状态：Verified。
- 初始实现提交：`3e6ae02c2b3c71647d93d972ec215f39e4d93a24`。
- 全量审计整改由PR #208合并为`dfca784f2ede657986fee7d5e71eee54e9ee897d`，补充检索改为有界超量召回后执行当前稿排除、时序过滤、去重和最终限量。
- 最终审计门禁：Quality `30158717765`、Security `30158717671`、Performance `30158717652`、PR Policy `30158717668`、Task Governance `30158717666`、Evidence `30158717649`全部成功。
- Prompt Registry、GenerationRun和具体生成流程只消费本任务已验证的确定性约束合同，不重新实现或修改其裁剪、来源与Hash语义。
''',
'M4-03':'''
## 终验关闭

- 最终状态：Verified。
- 初始实现提交：`226aa653913756128070119415ed1a06b12f92f1`。
- 全量审计整改由PR #208合并为`dfca784f2ede657986fee7d5e71eee54e9ee897d`，完成凭据Provider归属、同Provider操作串行、请求幂等、跨存储补偿回滚和16 MiB响应上限。
- 依赖安全修复由PR #211合并为`c1f018cfc1ed19ec3e129300508e3c3ce616c526`，冻结安装、高危审计和全量质量门全部成功。
- 最终审计门禁：Quality `30158717765`、Security `30158717671`、Performance `30158717652`、PR Policy `30158717668`、Task Governance `30158717666`、Evidence `30158717649`全部成功。
- M8-01继续承担DNS重绑定的“校验地址绑定实际连接并保持原主机名TLS验证”发布级终验；该发布阻断项不得删除，但不构成M4-03任务边界内的未实现功能。
- 按用户指令，M4-04保持Planned，不自动激活。
'''
}
for task,path in cards.items():
    text=path.read_text()
    text,n=re.subn(r'^> 状态：Implemented(  )?$', '> 状态：Verified', text, count=1, flags=re.M)
    if n!=1: raise SystemExit(f'{task} card status count {n}')
    if '## 终验关闭' not in text:
        text=text.rstrip()+closures[task]+'\n'
    path.write_text(text)

m4=ROOT/'docs/tasks/M4_TASKS.md'
text=m4.read_text()
text=text.replace(
    '- 已完成M4-01、M4-02保持冻结，后续兼容要求由M4-03—M4-05承接。',
    '- M4-01—M4-03已完成终验并冻结；M4-04按作者指令保持Planned，未激活。',
)
m4.write_text(text)

trace=ROOT/'docs/product/V1.0_TRACEABILITY_MATRIX.md'
text=trace.read_text()
rows={
'REQ-023':'| REQ-023 | Provider配置与连接测试             | AI-001/002               | LOCAL_AI_SERVICE_SPEC、PROVIDER_PROTOCOL   | M4-03                                     | P0-022                 | Verified    | M4-03适配器、连接探测、设置页、凭据隔离和端到端接线已完成终验关闭 |',
'REQ-024':'| REQ-024 | 凭据使用系统安全存储               | AI-001                   | ADR-001、PRIVACY_AND_LOGGING               | M0-02、M4-03、M8-01                       | P0-067                 | In Progress | M4-03 safeStorage安全后端、密文文件、Provider归属和credentialRef隔离已Verified；M8-01继续发布前安全回归 |',
'REQ-025':'| REQ-025 | FTS与约束包组装裁剪                | AI-003、SRC-002          | PROVIDER_PROTOCOL、FUNCTION_CATALOG        | M4-01、M4-02                              | P0-025、P0-026相关Eval | Verified    | M4-01公共索引和M4-02可追溯P0—P4组装、时序过滤、稳定Hash及确定性裁剪已完成终验关闭 |',
'REQ-032':'| REQ-032 | 全项目FTS5搜索                     | SRC-002                  | ADR-002、DATABASE_SCHEMA                   | M4-01、M6-03                              | P0-046                 | In Progress | M4-01公共FTS、权威回读、隔离和重建基础已Verified；M6-03继续最终搜索界面 |',
'REQ-033':'| REQ-033 | 安全批量替换与项目词典             | SRC-003                  | IPC_CONTRACTS、ADR-005                     | M4-01、M6-03                              | P0-047                 | In Progress | M4-01项目词典基础已Verified；M6-03继续安全批量替换事务与界面 |',
'REQ-043':'| REQ-043 | 本机直连网络边界                   | —                        | ADR-001、LOCAL_AI_SERVICE_SPEC             | M4-03、M8-01                              | P0-070                 | In Progress | M4-03端点分类、HTTPS、保留地址、重定向和当前DNS信任边界已Verified；M8-01继续连接绑定与发布回归 |',
}
for req,row in rows.items():
    text,n=re.subn(rf'^\| {req} \|.*$',row,text,count=1,flags=re.M)
    if n!=1: raise SystemExit(f'{req} trace replacement count {n}')
trace.write_text(text)

run_block='''- Audit hardening PR #208 merged as `dfca784f2ede657986fee7d5e71eee54e9ee897d`.
- Final audit runs: Quality `30158717765`, Security `30158717671`, Performance `30158717652`, PR Policy `30158717668`, Task Governance `30158717666`, Evidence `30158717649`.
- Full validation: 143 test files / 709 tests, Electron E2E passed; coverage Statements 84.30%, Branches 75.40%, Functions 85.67%, Lines 86.72%.
'''
contents={
'M4-01':{
'summary.md':f'''# M4-01 Final Verification Summary

## Conclusion

M4-01 is **Verified**. The shared FTS5 index, explicit queue, authoritative fallback, project dictionary, isolation and rebuild paths are implemented, audited and covered by real CI. The M4 audit hardening repaired unanchored chapter-title fallback and preserved the same authoritative search service for downstream constraint assembly.

## Verified scope

- Schema 20—21 FTS5 trigram indexes, index state and explicit target queue.
- Core-owned indexing, retry, stale handling, rebuild and corruption recovery.
- Authoritative Draft, Version and Entity reread with project isolation.
- Short-query and stale-index fallback, including unanchored chapter title hits.
- Author-managed project dictionary; AI has no write authority.
- Performance fixture and permanent regression coverage.

## Provenance

- Initial implementation: `c37aebb53aa713622d749e5f9b9d837f4642d4bf`.
{run_block}
## Deferred upper-layer work

M6-03 remains responsible for the final search UI and safe batch replace workflow. That planned upper-layer scope does not reopen the verified M4-01 indexing foundation.
''',
'commands.txt':'''M4-01 final verification command and run record

Initial implementation commit: c37aebb53aa713622d749e5f9b9d837f4642d4bf
Audit hardening commit: dfca784f2ede657986fee7d5e71eee54e9ee897d

pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:security
pnpm test:e2e
pnpm test:coverage
pnpm test:perf

Quality: 30158717765
Security: 30158717671
Performance: 30158717652
PR Policy: 30158717668
Task Governance: 30158717666
Evidence: 30158717649
''',
'known-risks.md':'''# M4-01 Known Risks

## Accepted / deferred

- The final full-project search interface and safe batch replacement transaction belong to M6-03.
- FTS remains derived, deletable data. A damaged or stale index can reduce recall until rebuild, while authoritative business data remains available and unchanged.
- Search relevance is deterministic lexical retrieval; embedding and reranking remain outside V1 M4-01 scope.

## Closure judgement

No open risk blocks M4-01 verification. The remaining items are explicit later-task scope and do not weaken the authoritative-data, isolation, rebuild or performance guarantees verified here.
'''
},
'M4-02':{
'summary.md':f'''# M4-02 Final Verification Summary

## Conclusion

M4-02 is **Verified**. The P0—P4 constraint package, temporal filtering, source provenance, deterministic token budgeting, conflict reporting, stable hashes and trim log are implemented and audited. The M4 hardening changed supplemental recall to bounded over-fetch followed by current/future chapter filtering and final limiting, preventing invalid high-ranked results from starving eligible prior context.

## Verified scope

- P0 code constraints, P1 chapter must-haves, P2 state, P3 voice and P4 background.
- Current chapter, SceneBeat, prior ending snapshot or authoritative fallback, entity/knowledge/foreshadowing/canon/arc inputs.
- Deterministic relation and shared M4-01 FTS supplemental retrieval.
- Temporal filtering, current-draft exclusion, deduplication, conflict flags and source versions.
- Stable serialization, token estimation, safety margin and P4→P3→low-related P2 trimming; P0/P1 never trimmed.
- Stable `contentHash`, `constraintHash` and reproducible trim/source records.

## Provenance

- Initial implementation: `3e6ae02c2b3c71647d93d972ec215f39e4d93a24`.
{run_block}
## Deferred upper-layer work

Prompt Registry, GenerationRun and concrete generation workflows consume this verified package in later tasks. Those integrations do not reopen the deterministic package assembly and trimming contracts closed by M4-02.
''',
'commands.txt':'''M4-02 final verification command and run record

Initial implementation commit: 3e6ae02c2b3c71647d93d972ec215f39e4d93a24
Audit hardening commit: dfca784f2ede657986fee7d5e71eee54e9ee897d

pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:security
pnpm test:e2e
pnpm test:coverage
pnpm test:perf
pnpm test:eval

Quality: 30158717765
Security: 30158717671
Performance: 30158717652
PR Policy: 30158717668
Task Governance: 30158717666
Evidence: 30158717649
''',
'known-risks.md':'''# M4-02 Known Risks

## Accepted / deferred

- Prompt Registry, GenerationRun, model capability profiles and generation UX remain later-task responsibilities.
- Lexical supplemental retrieval can miss semantic equivalents that share no indexed terms; embeddings and reranking are outside M4-02 scope.
- An oversized mandatory P0/P1 set fails explicitly rather than silently discarding constraints; callers must surface that failure.

## Closure judgement

No open risk blocks M4-02 verification. Temporal validity, current-draft exclusion, deterministic trimming, provenance and failure semantics are covered by automated regression and remain stable interfaces for later AI workflows.
'''
},
'M4-03':{
'summary.md':f'''# M4-03 Final Verification Summary

## Conclusion

M4-03 is **Verified**. Provider configuration, approved protocol adapters, credential isolation, connection testing, endpoint classification, cancellation/timeout handling and Main/Preload/Renderer boundaries are implemented and audited. The M4 hardening added provider-owned credential access, same-provider mutation serialization and request idempotency, bounded response streams and compensating rollback for cross-store failure.

## Verified scope

- OpenAI-compatible and Anthropic adapters; Custom protocol restricted to approved registered adapters.
- App DB Provider configuration and Electron safeStorage-backed encrypted credential file with database-only `credentialRef`.
- Provider ownership checks for credential resolve/remove/replace; insecure safeStorage backends blocked.
- Same-Provider save/remove/test serialization and bounded request-id idempotency.
- Atomic credential replacement and compensating configuration rollback on cleanup failure.
- Model listing/minimal generation/stream/structured capability probes and stable error mapping.
- 16 MiB bounded Provider response streams, cancellation and timeout through headers, JSON and SSE lifecycle.
- Loopback/LAN/external endpoint classification, external HTTPS, unsafe address and redirect rejection.
- Provider unavailability does not affect offline writing, search, recovery or export.

## Provenance

- Initial implementation: `226aa653913756128070119415ed1a06b12f92f1`.
{run_block}- Dependency security fix PR #211 merged as `c1f018cfc1ed19ec3e129300508e3c3ce616c526`; frozen install, high-severity audit and full Quality passed.

## Release hardening retained

M8-01 retains the final DNS rebinding/validated-address connection binding review and release-level network regression. This is a documented release boundary, not an unfinished M4-03 implementation item.
''',
'commands.txt':'''M4-03 final verification command and run record

Initial implementation commit: 226aa653913756128070119415ed1a06b12f92f1
Audit hardening commit: dfca784f2ede657986fee7d5e71eee54e9ee897d
Dependency security commit: c1f018cfc1ed19ec3e129300508e3c3ce616c526

pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:security
pnpm test:e2e
pnpm test:coverage
pnpm test:perf
pnpm test:eval
pnpm audit --audit-level high

Audit hardening Quality: 30158717765
Audit hardening Security: 30158717671
Audit hardening Performance: 30158717652
Security fix Quality: 30161465664
Security fix Security: 30161465583
Security fix Performance: 30161465577
''',
'known-risks.md':'''# M4-03 Known Risks

## Accepted / deferred

- M8-01 must bind validated DNS results to the actual outbound connection while retaining TLS verification against the original host name, then rerun release-level network security regression.
- Local model download, installation and lifecycle supervision remain outside M4-03.
- GenerationRun, Prompt Registry and concrete T0/T1 workflows remain M4-04 and later scope.

## Closure judgement

No open item blocks M4-03 verification within its task boundary. Credential ownership, cross-store consistency, mutation serialization, response limits, protocol behavior, offline isolation and current endpoint policy are implemented and covered. The DNS rebinding item remains an explicit M8-01 release blocker and cannot be silently removed.
'''
}
}
extras={
'M4-02':[('m401-baseline-audit.md',1715,'b085d89c6c6a2980d4717d14cd6786b3041ea007edc223b08c7304d5f1117b5b')],
'M4-03':[('baseline-audit.md',3891,'5fb053da8bb5f8db828a4c57a220b0c53e07f0e5e3a30acf1a6bd339ae88ec91')],
}
for task,files in contents.items():
    directory=ROOT/f'docs/test-evidence/{task}'
    directory.mkdir(parents=True,exist_ok=True)
    entries=[]
    for name,body in files.items():
        (directory/name).write_text(body)
        raw=body.encode()
        entries.append({'path':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
    entries.extend({'path':p,'bytes':b,'sha256':s} for p,b,s in extras.get(task,[]))
    entries.sort(key=lambda item:item['path'])
    manifest={
        'schemaVersion':1,
        'taskId':task,
        'commit':EVIDENCE_HEAD,
        'generatedAt':VERIFIED_AT,
        'files':entries,
    }
    (directory/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')

print('M4-01—M4-03 closure files generated.')
