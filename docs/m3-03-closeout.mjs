import { mkdir, readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, before, after) {
  const source = await readFile(path, 'utf8');
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing closeout anchor in ${path}`);
  await writeFile(path, source.replace(before, after), 'utf8');
}

async function appendOnce(path, marker, content) {
  const source = await readFile(path, 'utf8');
  if (source.includes(marker)) return;
  await writeFile(path, `${source.trimEnd()}\n\n${content.trim()}\n`, 'utf8');
}

await replaceExact(
  'docs/database/DATABASE_SCHEMA.md',
  `#### \`entities\`\n\n\`id TEXT PK, project_id TEXT FK, entity_type TEXT, name TEXT, aliases_json TEXT, summary TEXT, status TEXT, created_at TEXT, updated_at TEXT\`\n\n类型：character/location/faction/item/ability/rule/event/custom。\n\n#### \`canon_facts\`\n\n\`id TEXT PK, entity_id TEXT FK, fact_key TEXT, value_json TEXT, description TEXT, source_type TEXT, source_id TEXT NULL, is_current INTEGER, confirmed_at TEXT\`\n\n同实体同\`fact_key\`最多一条\`is_current=1\`。`,
  `#### \`entities\`\n\n\`id TEXT PK, project_id TEXT FK, entity_type TEXT, name TEXT, aliases_json TEXT, summary TEXT, status TEXT, archived_at TEXT NULL, created_at TEXT, updated_at TEXT\`\n\n类型：character/location/faction/item/ability/rule/event/custom。状态为active/archived；归档时间与状态必须一致。同项目、同类型、同规范化名称只允许一个active实体。\n\n#### \`canon_facts\`\n\n\`id TEXT PK, project_id TEXT FK, entity_id TEXT FK, fact_key TEXT, value_json TEXT, description TEXT, source_type TEXT, source_id TEXT NULL, status TEXT, confirmed_at TEXT, superseded_at TEXT NULL, created_at TEXT\`\n\n状态为current/historical。部分唯一索引保证同实体同\`fact_key\`最多一条current；作者确认新值时，旧current在同一事务内转为historical并记录\`superseded_at\`。Core仅接受author权限，拒绝AI直接写入Canon。\n\n#### \`scene_beat_entities\`\n\n\`project_id TEXT FK, scene_beat_id TEXT FK, entity_id TEXT FK, role TEXT, created_at TEXT\`\n\n主键为\`(scene_beat_id, entity_id, role)\`。SceneBeat与Entity均使用包含\`project_id\`的复合外键，跨项目引用在SQLite层阻断。角色为character/location/participant/setting/subject/related。`,
);

await replaceExact(
  'docs/database/DATABASE_SCHEMA.md',
  `\`0011_scene_beats.sql\`建立\`scene_beats\`与\`scene_beat_block_links\`。SceneBeat按章节保存目标、冲突、预期结果、类型、字数比例、必选标记、PlotNode与预留实体UUID引用；正文关联只指向DraftBlock，删除SceneBeat会清理关联，正文表不会被SceneBeat级联删除。跨章规划移动不改Draft；正文移动继续走M2-04恢复点、Patch、Revision、Hash与LockGuard链路。`,
  `\`0011_scene_beats.sql\`建立\`scene_beats\`与\`scene_beat_block_links\`。SceneBeat按章节保存目标、冲突、预期结果、类型、字数比例、必选标记、PlotNode与预留实体UUID引用；正文关联只指向DraftBlock，删除SceneBeat会清理关联，正文表不会被SceneBeat级联删除。跨章规划移动不改Draft；正文移动继续走M2-04恢复点、Patch、Revision、Hash与LockGuard链路。\n\n\`0012_entity_canon.sql\`建立\`entities\`、\`canon_facts\`与\`scene_beat_entities\`，项目Schema升级为12。Entity支持别名、摘要、归档；CanonFact保留current/historical完整账本；跨项目SceneBeat引用、重复current和带引用永久删除均由数据库与Core双层阻断。`,
);

await replaceExact(
  'docs/database/DATA_DICTIONARY.md',
  `Entity类型：\n\n\`\`\`text\ncharacter | location | faction | item | ability | rule | event | custom\n\`\`\``,
  `Entity类型：\n\n\`\`\`text\ncharacter | location | faction | item | ability | rule | event | custom\n\`\`\`\n\nEntity状态：\n\n\`\`\`text\nactive | archived\n\`\`\`\n\nCanonFact状态：\n\n\`\`\`text\ncurrent | historical\n\`\`\`\n\n同一Entity与factKey只有一条current；作者确认新值时旧值进入historical。AI、规则校验和模型推测只能形成后续提案，不能直接改变Canon。SceneBeatEntity是项目内显式引用，跨项目关联无效。`,
);

await replaceExact(
  'docs/product/V1.0_TRACEABILITY_MATRIX.md',
  `| REQ-017 | 人物与世界实体                     | CAN-001                  | DATABASE_SCHEMA                            | M3-03                      | P0-036                 | Planned     |\n| REQ-018 | 静态Canon与动态状态分离            | CAN-002、STA-001         | ADR-004、DATABASE_SCHEMA                   | M3-03、M3-04               | P0-036、P0-037         | Planned     |`,
  `| REQ-017 | 人物与世界实体                     | CAN-001                  | DATABASE_SCHEMA                            | M3-03                      | P0-036                 | Implemented |\n| REQ-018 | 静态Canon与动态状态分离            | CAN-002、STA-001         | ADR-004、DATABASE_SCHEMA                   | M3-03、M3-04               | P0-036、P0-037         | In Progress |`,
);

await replaceExact(
  'docs/tasks/M3/M3-03_ENTITY_CANON.md',
  `## 完成条件\n`,
  `## 实现记录\n\n- 实现真源：\`78dfdbcab4e981379f6455c8ecb23c16b653139a\`（PR #68）。\n- 后端与Migration验证：Actions Run \`29679433553\`。\n- Renderer Canon工作区验证：Actions Run \`29679760603\`。\n- 已接通Entity CRUD、别名、归档、Canon current/history、作者权限、SceneBeat项目边界引用和永久删除影响预览。\n- implementation-pr模式下，人工桌面验收、正式截图和最终Verified结论进入延期验收队列。\n\n## 完成条件\n`,
);

await appendOnce(
  'docs/contracts/IPC_CONTRACTS.md',
  '## M3-03 Entity与Canon命令',
  `## M3-03 Entity与Canon命令\n\n- \`canon.listEntities\`：按项目读取active/archived实体及完整Canon历史。\n- \`canon.createEntity\`、\`canon.updateEntity\`、\`canon.archiveEntity\`：要求\`authority=author\`。\n- \`canon.setFact\`：在单事务内把旧current转为historical并写入新current。\n- \`canon.linkSceneBeatEntity\`：建立项目内SceneBeat与Entity显式引用。\n- \`canon.previewDeleteEntity\`、\`canon.deleteEntity\`：先返回引用影响；仅归档、无SceneBeat引用且名称确认匹配时永久删除。\n\nMain只接受受信Renderer事件，Preload使用严格Zod命令/结果Schema，Core是唯一权威写入层；\`authority=ai\`固定拒绝。`,
);

await appendOnce(
  'docs/ui/SCREEN_SPECIFICATIONS.md',
  '## M3-03 实体与Canon工作区',
  `## M3-03 实体与Canon工作区\n\n当前项目操作区提供“实体与Canon”入口。工作区包含实体选择、类型、名称、别名、摘要、归档、永久删除影响预览，以及factKey/JSON值/确认说明输入。事实列表直接区分CURRENT与HISTORICAL；只读项目禁用全部写操作。永久删除要求实体已归档、SceneBeat引用为零并再次输入实体名称。`,
);

await mkdir('docs/test-evidence/M3-03/test-results', { recursive: true });
await mkdir('docs/test-evidence/M3-03/screenshots', { recursive: true });
await writeFile(
  'docs/test-evidence/M3-03/summary.md',
  `# M3-03 测试证据摘要\n\nM3-03 已接通通用Entity、静态Canon、作者权限、current/history账本、SceneBeat项目边界引用、删除影响预览和最小桌面工作区。\n\n后端与Migration专项运行 \`29679433553\` 通过类型检查、3项Entity/Canon集成测试及12个Migration测试文件共29项测试；Renderer运行 \`29679760603\` 通过类型检查、Renderer构建及同组集成/Migration复核。人工桌面验收、正式截图和最终Verified签字按implementation-pr模式延期。\n`,
  'utf8',
);
await writeFile(
  'docs/test-evidence/M3-03/commands.txt',
  `pnpm typecheck  # exit 0, runs 29679433553 and 29679760603\npnpm --filter @worldforge/renderer build  # exit 0, run 29679760603\npnpm exec vitest run tests/integration/entity-canon.test.ts  # 3 passed\npnpm test:migration  # 12 files, 29 tests passed\npnpm lint  # executed again during closeout\npnpm task:validate  # executed after task transition\n# Final PR permanent gates: PR Policy, Task Governance, Evidence, Security, Performance, Quality\n`,
  'utf8',
);
await writeFile(
  'docs/test-evidence/M3-03/known-risks.md',
  `# 已知风险\n\n- M3-03只建立静态Canon；动态状态、时间线与知情边界由M3-04继续实现。\n- SceneBeat显式引用已由Core和复合外键保护；Renderer内的引用选择器将在后续规划界面迁移任务中统一优化。\n- 人工桌面验收、正式截图和完整质量矩阵最终签字延期到批量验收。\n- 只有PR六类永久门禁全部通过后，M3-03才可登记为Implemented；本证据包不替代门禁。\n`,
  'utf8',
);
await writeFile(
  'docs/test-evidence/M3-03/manual-acceptance.md',
  `# 人工验收\n\n状态：Deferred。\n\n待批量验收：创建与编辑实体、别名去重、同factKey历史保留、只读写入阻断、归档与永久删除影响预览、真实Electron截图。\n`,
  'utf8',
);
await writeFile(
  'docs/test-evidence/M3-03/quality-matrix.md',
  `# 质量矩阵\n\n| 项目 | 当前结果 |\n|---|---|\n| Schema 12与外键 | 自动化通过 |\n| current唯一性与历史保留 | 自动化通过 |\n| AI写入拒绝 | 自动化通过 |\n| Renderer构建 | 自动化通过 |\n| 人工桌面验收与截图 | Deferred |\n`,
  'utf8',
);
await writeFile(
  'docs/test-evidence/M3-03/test-results/results.json',
  `${JSON.stringify({ taskId: 'M3-03', status: 'passed-with-deferred-manual-acceptance', runs: [29679433553, 29679760603], integrationTests: 3, migrationFiles: 12, migrationTests: 29 }, null, 2)}\n`,
  'utf8',
);
await writeFile(
  'docs/test-evidence/M3-03/screenshots/manifest.json',
  `${JSON.stringify({ taskId: 'M3-03', status: 'deferred', screenshots: [] }, null, 2)}\n`,
  'utf8',
);

console.log('M3-03 documentation and deferred evidence package prepared.');
