#!/usr/bin/env bash
set -euo pipefail

IMPLEMENTATION_HEAD="c37aebb53aa713622d749e5f9b9d837f4642d4bf"
MAIN_HEAD="63d00583fb35876c8552f2d89aaa1fe7560f9432"

test "$(git rev-parse HEAD)" = "${IMPLEMENTATION_HEAD}"
git fetch --no-tags origin main
test "$(git rev-parse origin/main)" = "${MAIN_HEAD}"
git config user.name github-actions[bot]
git config user.email 41898282+github-actions[bot]@users.noreply.github.com
git merge --no-ff origin/main -m "同步：合并最新main基线"

python <<'PY'
from pathlib import Path
import re

database = Path('docs/database/DATABASE_SCHEMA.md')
text = database.read_text()
old_catalog = """- `story_todos(id, target_type, target_id, title, description, status, tags_json, source_issue_id, created_at, updated_at)`
- `comments(id, target_type, target_id, block_id, content, created_at, updated_at)`
- `project_dictionary(term PRIMARY KEY, normalized_term, category, action, notes)`
- `project_settings(key PRIMARY KEY, value_json, updated_at)`
- `search_index_queue(id TEXT PK, target_type TEXT, target_id TEXT, operation TEXT, status TEXT, created_at, updated_at)`"""
new_catalog = """- `story_todos(id, target_type, target_id, title, description, status, tags_json, source_issue_id, created_at, updated_at)`
- `comments(id, target_type, target_id, block_id, content, created_at, updated_at)`
- `project_settings(key PRIMARY KEY, value_json, updated_at)`
- FTS5派生索引、显式队列、索引状态与项目词典见第4节。"""
if old_catalog not in text:
    raise SystemExit('database search catalog target not found')
text = text.replace(old_catalog, new_catalog, 1)
section_start = text.index('## 4. FTS5')
section_end = text.index('## 5. 删除与不可变规则', section_start)
section = """## 4. FTS5、显式索引队列与项目词典

`0020_search_index.sql`将项目Schema升级为20，建立以下可删除、可完整重建的派生数据：

- `search_index_state(singleton_id INTEGER PK, status, last_indexed_at, stale_at, last_error_code, updated_at)`：单例状态，`status`为`ready/stale/rebuilding`。
- `search_index_queue(id TEXT PK, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)`：`target_type`为`draft/version/entity`，`operation`为`upsert/delete`，同目标只保留一条待处理记录。
- `fts_draft_blocks(project_id, draft_id, logical_block_id, chapter_id, title, body)`。
- `fts_version_blocks(project_id, version_id, logical_block_id, chapter_id, title, body)`。
- `fts_entities(project_id, entity_id, entity_type, status, name, aliases, summary, facts)`。

三张FTS5表统一使用`trigram` tokenizer。SQLite触发器只将受影响的权威业务ID写入队列并把索引状态置为`stale`；全文组装、增量消费、失败重试和完整重建均由Core执行。索引失败只记录`failed`与错误码，不回滚已经提交的正文、Version、Entity或Canon事务。

三字符及以上查询在索引`ready`时使用FTS5；少于三字符或索引`stale/rebuilding`时回读权威业务表执行标准化LIKE。FTS5只负责召回业务ID，返回结果前必须按当前项目重新读取Draft、Version或Entity权威数据，不直接展示派生表内容，也不得跨项目返回结果。

`0021_project_dictionary.sql`将项目Schema升级为21，建立：

`project_dictionary(term TEXT PK, normalized_term TEXT UNIQUE, category TEXT, action TEXT, replacement_term TEXT NULL, notes TEXT, created_at TEXT, updated_at TEXT)`

`action`为`canonical/alias/ignore/replacement`。别名和替换项必须提供`replacement_term`，规范词和忽略项不得提供替换值。词典只能由作者权限写入，AI无权修改；精确词典命中可将查询规范化后复用同一搜索服务。

ResearchNote属于P1/V1.5范围，V1.0 P0不预建相关业务表或索引。

"""
database.write_text(text[:section_start] + section + text[section_end:])

traceability = Path('docs/product/V1.0_TRACEABILITY_MATRIX.md')
text = traceability.read_text()
for requirement in ('REQ-025', 'REQ-032', 'REQ-033'):
    pattern = re.compile(rf'^(\| {requirement} \|.*\| )Planned(\s*\|)$', re.MULTILINE)
    text, count = pattern.subn(r'\1In Progress\2', text, count=1)
    if count != 1:
        raise SystemExit(f'traceability row not found: {requirement}')
traceability.write_text(text)

task_card = Path('docs/tasks/M4/M4-01_FTS_INDEX_DICTIONARY.md')
text = task_card.read_text()
anchor = '## 完成条件\n'
if anchor not in text:
    raise SystemExit('M4-01 completion anchor not found')
closeout = """## 实现收口

- Schema 20—21、Core搜索服务、公共合同、迁移、集成与性能测试已形成完整实现。
- Quality运行`30088007101`通过静态、构建、单元、集成、迁移、覆盖率与Electron E2E。
- Security运行`30088006972`、Performance运行`30088006958`、PR Policy运行`30088006973`与Evidence运行`30088006985`均成功。
- 1,563,300字符性能Fixture完整重建耗时202.16ms，30次查询P95为14.12ms；覆盖率为Lines 86.55%、Statements 84.28%、Functions 84.87%、Branches 75.30%。
- 最终搜索页面与安全批量替换继续由M6-03实现；M4-01不提前引入该范围。

"""
task_card.write_text(text.replace(anchor, closeout + anchor, 1))

evidence = Path('docs/test-evidence/M4-01')
evidence.mkdir(parents=True, exist_ok=True)
(evidence / 'summary.md').write_text("""# M4-01 实现与复验记录

## 交付结论

已建立Draft、Version与Entity三类FTS5 trigram派生索引、显式目标队列、索引状态和作者管理的项目词典。SQLite触发器只登记权威业务ID，Core负责全文组装、增量消费、失败重试、完整重建、短词与stale回退以及结果权威回读。

FTS结果仅用于召回业务ID；所有结果按当前项目重新读取权威数据。正文、Candidate采用与撤销、导入、Version、Entity、CanonFact、拆并章、跨章移动及卷章可见性变化均纳入失效传播。ResearchNote未进入V1.0 P0数据模型，因此未预建表或索引。

## 自动化证据

- 实现提交：`c37aebb53aa713622d749e5f9b9d837f4642d4bf`。
- Quality：运行`30088007101`，静态、格式、Lint、Typecheck、Build、Unit、Integration、Migration、Coverage与Electron E2E全部成功。
- Security：运行`30088006972`，秘密扫描、依赖审计与应用安全测试成功。
- Performance：运行`30088006958`，性能预算成功。
- PR Policy：运行`30088006973`成功。
- Evidence：运行`30088006985`成功。
- Coverage工件：`8594653232`，Digest `sha256:9a045425b108c8fafa41afa0cf53e1ba61c777cc38e420be1f0b996a7dabe94c`。
- Electron E2E工件：`8594793290`，Digest `sha256:2f55789970e8bc3e5fa0d0713ea135a80eff31a4f91f7da1e29ee4462d3de681`。

## 量化结果

- 1,563,300字符Fixture完整重建：202.16ms。
- 30次FTS查询P95：14.12ms，预算上限200ms。
- 产品源码覆盖率：Lines 86.55%、Statements 84.28%、Functions 84.87%、Branches 75.30%。

## 范围结论

本记录覆盖M4-01公共检索基础设施和项目词典。最终搜索页面、安全批量替换由M6-03承接；P0—P4约束包由M4-02承接。实现阶段结果可供后续任务直接复用。
""")
(evidence / 'commands.txt').write_text("""pnpm install --frozen-lockfile --prefer-offline
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:coverage
pnpm test:e2e
pnpm test:perf
pnpm exec vitest run tests/integration/search-index.test.ts tests/migration/search-index-migration.test.ts tests/migration/final-coordination-remediation.test.ts tests/migration/sqlite-foundation.test.ts
pnpm exec vitest run tests/performance/search-index-performance.test.ts
""")
(evidence / 'known-risks.md').write_text("""# M4-01 已知边界

- 当前交付提供公共搜索服务、派生索引和项目词典，最终搜索页面与安全批量替换属于M6-03。
- P0—P4约束包在M4-02复用本搜索服务，不在M4-01内实现上下文裁剪和Token预算。
- ResearchNote属于P1/V1.5范围，当前不建立相关业务表或索引。
- FTS为可重建派生数据；业务真源始终是项目SQLite中的Draft、Version、Entity与Canon数据。
- 跨平台安装包与发布级性能复验由M8阶段统一完成。
""")
PY

node scripts/taskctl.mjs advance --ci=success --commit="${IMPLEMENTATION_HEAD}"

pnpm exec prettier --write \
  docs/database/DATABASE_SCHEMA.md \
  docs/product/V1.0_TRACEABILITY_MATRIX.md \
  docs/tasks/ACTIVE_TASK.json \
  docs/tasks/ACTIVE_TASK.md \
  docs/tasks/TASK_INDEX.md \
  docs/tasks/M4/M4-01_FTS_INDEX_DICTIONARY.md \
  docs/tasks/M4/M4-02_CONSTRAINT_PACKAGE.md \
  docs/test-evidence/M4-01/summary.md \
  docs/test-evidence/M4-01/known-risks.md

python <<'PY'
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import json

root = Path('docs/test-evidence/M4-01')
files = []
for name in ('commands.txt', 'known-risks.md', 'summary.md'):
    content = (root / name).read_bytes()
    files.append({'path': name, 'bytes': len(content), 'sha256': sha256(content).hexdigest()})
manifest = {
    'schemaVersion': 1,
    'taskId': 'M4-01',
    'commit': 'c37aebb53aa713622d749e5f9b9d837f4642d4bf',
    'generatedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
    'files': files,
}
(root / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
PY
pnpm exec prettier --write docs/test-evidence/M4-01/manifest.json
node -e "import('./scripts/evidence-policy.mjs').then((module) => module.validateTaskEvidence('M4-01'))"
node scripts/taskctl.mjs validate
pnpm format:check
git diff --check

mapfile -t changed < <(git diff --name-only)
printf '%s\n' "${changed[@]}"
expected=(
  docs/database/DATABASE_SCHEMA.md
  docs/product/V1.0_TRACEABILITY_MATRIX.md
  docs/tasks/ACTIVE_TASK.json
  docs/tasks/ACTIVE_TASK.md
  docs/tasks/M4/M4-01_FTS_INDEX_DICTIONARY.md
  docs/tasks/M4/M4-02_CONSTRAINT_PACKAGE.md
  docs/tasks/TASK_INDEX.md
  docs/test-evidence/M4-01/commands.txt
  docs/test-evidence/M4-01/known-risks.md
  docs/test-evidence/M4-01/manifest.json
  docs/test-evidence/M4-01/summary.md
)
test "${#changed[@]}" -eq "${#expected[@]}"
for index in "${!expected[@]}"; do
  test "${changed[$index]}" = "${expected[$index]}"
done

git add -- "${changed[@]}"
git commit -m "文档：收口M4-01并推进M4-02"
git push origin HEAD:work/m4-01-fts-index-dictionary
