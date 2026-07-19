from pathlib import Path

ROOT = Path.cwd()

def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    source = target.read_text(encoding='utf-8')
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{path} anchor count {count}: {old[:100]!r}')
    target.write_text(source.replace(old, new, 1), encoding='utf-8')

replace_once(
    'docs/database/DATABASE_SCHEMA.md',
    '`id TEXT PK, entity_id TEXT FK, state_key TEXT, value_json TEXT, valid_from_chapter_id TEXT FK, valid_until_chapter_id TEXT NULL, record_status TEXT, evidence_json TEXT, source_version_id TEXT FK`\n\n状态：current/historical/superseded/invalid。\n',
    'M3-04由`migrations/project/0013_state_timeline_knowledge.sql`建立：\n\n`id TEXT PK, project_id TEXT FK, entity_id TEXT FK, state_key TEXT, value_json TEXT, valid_from_chapter_id TEXT FK, valid_until_chapter_id TEXT NULL, record_status TEXT, evidence_json TEXT, source_version_id TEXT FK, created_at TEXT`\n\n状态：current/historical/superseded/invalid。部分唯一索引保证同一Entity与stateKey最多一条current；作者确认新状态时旧current转为historical。`valid_until_chapter_id`为排他结束章节。章节、Entity、证据锚点和来源Version必须属于同一项目。\n',
)
replace_once(
    'docs/database/DATABASE_SCHEMA.md',
    '`id TEXT PK, project_id TEXT FK, title TEXT, start_value TEXT, end_value TEXT NULL, precision TEXT, chapter_id TEXT NULL, location_id TEXT NULL, description TEXT`\n\n关联：`timeline_event_entities`、`timeline_dependencies`。\n',
    'M3-04由Schema 13建立：\n\n`id TEXT PK, project_id TEXT FK, title TEXT, start_value TEXT, end_value TEXT NULL, precision TEXT, chapter_id TEXT NULL, location_id TEXT NULL, description TEXT, created_at TEXT, updated_at TEXT`\n\n精度：exact/day/month/year/approximate/unknown。关联表`timeline_event_entities(project_id,event_id,entity_id,role,created_at)`和`timeline_dependencies(project_id,event_id,depends_on_event_id,created_at)`使用项目复合外键。Core阻断依赖循环、可比较时间顺序冲突，以及同一人物在同一确定时间出现于不同地点；unknown/approximate不冒充确定时刻。\n',
)
replace_once(
    'docs/database/DATABASE_SCHEMA.md',
    '`id TEXT PK, information_key TEXT, character_id TEXT FK, knowledge_status TEXT, acquired_chapter_id TEXT NULL, source_block_id TEXT NULL, notes TEXT`\n\n状态：knows/believes/suspects/misunderstands/unknown。\n',
    'M3-04由Schema 13建立：\n\n`id TEXT PK, project_id TEXT FK, information_key TEXT, character_id TEXT FK, knowledge_status TEXT, acquired_chapter_id TEXT NULL, source_block_id TEXT NULL, source_version_id TEXT NULL, notes TEXT, record_status TEXT, created_at TEXT, superseded_at TEXT NULL`\n\n知情状态：knows/believes/suspects/misunderstands/unknown；账本状态：current/historical。同一人物与informationKey最多一条current。非unknown记录必须有获得章节以及Block或Version来源锚点；人物、章节和来源均需属于同一项目。\n',
)
replace_once(
    'docs/database/DATA_DICTIONARY.md',
    'EntityState状态：\n\n```text\ncurrent | historical | superseded | invalid\n```\n',
    'EntityState状态：\n\n```text\ncurrent | historical | superseded | invalid\n```\n\nM3-04中`validUntilChapterId`采用排他语义；按章节查询时满足`validFrom <= chapter < validUntil`。作者确认新current后旧记录保留为historical，证据锚点和来源Version不得跨项目。\n',
)
replace_once(
    'docs/database/DATA_DICTIONARY.md',
    'KnowledgeState状态：\n\n```text\nknows | believes | suspects | misunderstands | unknown\n```\n',
    'KnowledgeState状态：\n\n```text\nknows | believes | suspects | misunderstands | unknown\n```\n\nKnowledgeState同时维护current/historical账本；非unknown状态必须记录获得章节和Block或Version来源。\n',
)
