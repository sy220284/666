from pathlib import Path

ROOT = Path.cwd()

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding='utf-8')

def replace_once(path: str, old: str, new: str) -> None:
    source = read(path)
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{path} anchor count {count}: {old[:100]!r}')
    write(path, source.replace(old, new, 1))

replace_once(
    'docs/contracts/IPC_CONTRACTS.md',
    '- `continuity.state.listCurrent/listHistory`\n- `continuity.stateProposal.list/accept/editAndAccept/reject`\n- `continuity.timeline.create/update/archive/list`\n- `continuity.knowledge.create/update/archive/list`\n',
    '- `continuity.list`：按项目读取动态状态、时间线和知情账本，支持query、includeHistory与effectiveAtChapterId。\n- `continuity.setEntityState`：作者确认EntityState，携带stateKey、JSON值、起止章节、证据和来源Version；旧current保留为historical。\n- `continuity.saveTimelineEvent`：创建或编辑TimelineEvent，携带世界时间值、精度、章节、地点、参与者和依赖；Core执行项目边界、依赖环和确定时间冲突校验。\n- `continuity.setKnowledgeState`：作者确认人物知情状态，携带informationKey、状态、获得章节、Block/Version来源与说明；旧current保留为historical。\n- `continuity.stateProposal.*`由M3-06实现，pending提案不得写入上述权威表。\n',
)

screen_path = 'docs/ui/SCREEN_SPECIFICATIONS.md'
screen = read(screen_path)
section = '''\n\n## M3-04 连续性账本最小界面\n\n当前项目工作区提供“连续性”入口，对话框分为三个区域：\n\n1. 动态状态：选择Entity，录入stateKey、JSON值、起止章节、来源Version和证据锚点；列表同时显示current与历史记录，可按章节查询有效值。\n2. 时间线：创建或编辑事件，维护世界时间值、精度、章节、地点、参与者和前置依赖；Core拒绝确定时间下同一人物多地、依赖循环和顺序冲突。\n3. 人物知情：按informationKey记录knows/believes/suspects/misunderstands/unknown、获得章节、Block或Version来源和说明。\n\n界面支持搜索、历史开关、复制记录ID和只读项目降级。Renderer只调用`window.worldforge.continuity`具名桥接；所有权威ID、项目归属、作者权限与冲突规则由Core复核。\n'''
if '## M3-04 连续性账本最小界面' not in screen:
    write(screen_path, screen.rstrip() + section + '\n')

trace_path = 'docs/product/V1.0_TRACEABILITY_MATRIX.md'
trace = read(trace_path)
trace = trace.replace(
    '| REQ-018 | 静态Canon与动态状态分离            | CAN-002、STA-001         | ADR-004、DATABASE_SCHEMA                   | M3-03、M3-04               | P0-036、P0-037         | In Progress |',
    '| REQ-018 | 静态Canon与动态状态分离            | CAN-002、STA-001         | ADR-004、DATABASE_SCHEMA                   | M3-03、M3-04               | P0-036、P0-037         | Implemented |',
)
trace = trace.replace(
    '| REQ-019 | 时间线                             | TIM-001                  | DATABASE_SCHEMA                            | M3-04                      | P0-038                 | Planned     |',
    '| REQ-019 | 时间线                             | TIM-001                  | DATABASE_SCHEMA                            | M3-04                      | P0-038                 | Implemented |',
)
trace = trace.replace(
    '| REQ-020 | 知情信息                           | KNO-001                  | DATABASE_SCHEMA                            | M3-04                      | P0-039                 | Planned     |',
    '| REQ-020 | 知情信息                           | KNO-001                  | DATABASE_SCHEMA                            | M3-04                      | P0-039                 | Implemented |',
)
write(trace_path, trace)
