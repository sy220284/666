from pathlib import Path
import shutil

ROOT = Path.cwd()


def load(path):
    return (ROOT / path).read_text(encoding='utf-8')


def save(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


def replace_once(path, old, new):
    content = load(path)
    if old not in content:
        raise RuntimeError(f'missing text in {path}: {old!r}')
    save(path, content.replace(old, new, 1))


payload = ROOT / '.github/governance/renderer-task-cards'
destination = ROOT / 'docs/tasks/M3'
for source in sorted(payload.glob('M3-*.md')):
    shutil.copyfile(source, destination / source.name)

replace_once(
    'docs/tasks/TASK_INDEX.md',
    '> 任务体系：M0—M8九阶段，共48张独立任务卡。  ',
    '> 任务体系：M0—M8九阶段，共52张独立任务卡。  ',
)
replace_once(
    'docs/tasks/TASK_INDEX.md',
    '| M3   | 规划、设定与连续性   |      6 | 建立规划、设定与连续性权威数据，作者确认后才改变状态。                        |',
    '| M3   | 规划、设定与连续性   |     10 | 建立权威连续性数据，并在M4前完成Renderer React架构校正与旧入口退役。           |',
)
replace_once(
    'docs/tasks/TASK_INDEX.md',
    '| M3-06 | [`状态提案、定稿、尾快照与失效传播`](M3/M3-06_STATE_PROPOSAL_SNAPSHOT.md) | M3-04、M3-05、M1-07、M2-03 | Planned |\n',
    '| M3-06 | [`状态提案、定稿、尾快照与失效传播`](M3/M3-06_STATE_PROPOSAL_SNAPSHOT.md) | M3-04、M3-05、M1-07、M2-03 | Planned |\n'
    '| M3-07 | [`Renderer React基础、Bridge适配与状态边界`](M3/M3-07_RENDERER_REACT_FOUNDATION.md) | M3-06 | Planned |\n'
    '| M3-08 | [`Renderer壳层、首页、项目与设置迁移`](M3/M3-08_RENDERER_SHELL_HOME_SETTINGS.md) | M3-07 | Planned |\n'
    '| M3-09 | [`Renderer规划、设定、结构与数据工具迁移`](M3/M3-09_RENDERER_PLANNING_CANON_STRUCTURE.md) | M3-08 | Planned |\n'
    '| M3-10 | [`Renderer写作、Version、Candidate迁移与旧入口退役`](M3/M3-10_RENDERER_WRITING_CANDIDATE_CUTOVER.md) | M3-09 | Planned |\n',
)
replace_once(
    'docs/tasks/TASK_INDEX.md',
    '4. 每个用户功能任务必须包含最小可操作UI；M7只做统一整合，不负责第一次接通业务。',
    '4. 每个用户功能任务必须包含最小可操作UI；M3-07—M3-10先完成Renderer正式架构迁移，M7只做统一整合，不负责基础框架重写或第一次接通业务。',
)

replace_once(
    'docs/tasks/M3_TASKS.md',
    '建立规划、设定与连续性权威数据，作者确认后才改变状态。',
    '建立规划、设定与连续性权威数据，作者确认后才改变状态；在M4前完成Renderer React架构校正。',
)
replace_once(
    'docs/tasks/M3_TASKS.md',
    '| M3-06 | [状态提案、定稿、尾快照与失效传播](M3/M3-06_STATE_PROPOSAL_SNAPSHOT.md) | M3-04、M3-05、M1-07、M2-03 | 将章节定稿安全转换为下一章连续性入口，并在旧章返修后标记派生数据失效。 |\n',
    '| M3-06 | [状态提案、定稿、尾快照与失效传播](M3/M3-06_STATE_PROPOSAL_SNAPSHOT.md) | M3-04、M3-05、M1-07、M2-03 | 将章节定稿安全转换为下一章连续性入口，并在旧章返修后标记派生数据失效。 |\n'
    '| M3-07 | [Renderer React基础、Bridge适配与状态边界](M3/M3-07_RENDERER_REACT_FOUNDATION.md) | M3-06 | 建立React Root、Zustand UI边界、Bridge适配、状态仲裁和渐进迁移兼容面。 |\n'
    '| M3-08 | [Renderer壳层、首页、项目与设置迁移](M3/M3-08_RENDERER_SHELL_HOME_SETTINGS.md) | M3-07 | 迁移应用壳、六入口导航、首页、项目、设置、焦点和响应式侧栏。 |\n'
    '| M3-09 | [Renderer规划、设定、结构与数据工具迁移](M3/M3-09_RENDERER_PLANNING_CANON_STRUCTURE.md) | M3-08 | 迁移M1—M3规划、设定、结构、恢复和基础导入导出工作台。 |\n'
    '| M3-10 | [Renderer写作、Version、Candidate迁移与旧入口退役](M3/M3-10_RENDERER_WRITING_CANDIDATE_CUTOVER.md) | M3-09 | 迁移最高风险写作域，删除旧命令式DOM入口，形成M4正式前端基线。 |\n',
)
replace_once(
    'docs/tasks/M3_TASKS.md',
    '- 旧章返修只标记派生数据失效，不自动改写后文。',
    '- 旧章返修只标记派生数据失效，不自动改写后文。\n- React成为Renderer唯一正式渲染系统，Zustand不成为业务真源，旧命令式入口退役。\n- M4新增Renderer能力只能进入Bridge、Feature和统一状态体系。',
)

replace_once(
    'docs/roadmap/V1.0_ROADMAP.md',
    '→ M3 规划、设定与连续性\n→ M4 检索与AI基础设施',
    '→ M3 规划、设定、连续性与Renderer架构收口\n→ M4 检索与AI基础设施',
)
replace_once(
    'docs/roadmap/V1.0_ROADMAP.md',
    '| M3 规划、设定与连续性 | 6 | M2阶段Verified | 建立规划、设定与连续性权威数据，作者确认后才改变状态。 |',
    '| M3 规划、设定与连续性 | 10 | M2阶段Verified | 建立权威连续性数据，并在M4前完成Renderer React架构校正与旧入口退役。 |',
)
replace_once(
    'docs/roadmap/V1.0_ROADMAP.md',
    '- pending提案不改变EntityState或ArcMilestone。',
    '- pending提案不改变EntityState或ArcMilestone。\n- Renderer完成React、Zustand UI边界、Bridge适配、统一状态与Design Token迁移。\n- 旧命令式DOM入口退役，M4不得继续向旧`index.ts`堆入业务功能。',
)

for path in ['docs/product/V1_TASK_SYSTEM_REBASE.md', 'docs/tasks/TASK_TEMPLATE.md', 'AGENTS.md', 'agent.md', 'README.md', 'docs/INDEX.md', 'docs/product/WORLDFORGE_V6.5_FULL_SPEC.md']:
    content = load(path)
    if '48张' in content:
        save(path, content.replace('48张', '52张'))

replace_once(
    'docs/product/V1_TASK_SYSTEM_REBASE.md',
    '8. 用户功能可能到完整UI阶段才第一次可操作。',
    '8. 用户功能可能到完整UI阶段才第一次可操作。\n9. Renderer实际实现偏离冻结的React/Zustand架构，若拖到M7将与完整体验整合形成高风险双重重写。',
)
replace_once(
    'docs/product/V1_TASK_SYSTEM_REBASE.md',
    '- M7负责统一整合，不负责第一次接通业务。',
    '- M3-07—M3-10负责在M4前完成Renderer架构迁移；M7负责统一整合，不负责第一次接通业务或基础框架重写。',
)
replace_once(
    'AGENTS.md',
    '- Every user-facing task includes a minimum usable UI. M7 integrates and unifies; it is not the first time business functions become operable.',
    '- Every user-facing task includes a minimum usable UI. M3-07 through M3-10 migrate the Renderer to the frozen React/Tiptap/Zustand architecture before M4; M7 integrates and unifies rather than rewriting the foundation.',
)
replace_once(
    'agent.md',
    '基础产品未完成时，不得将后期Prompt、AI Schema、人物弧光或主题骨架视为主线完成度。',
    '基础产品未完成时，不得将后期Prompt、AI Schema、人物弧光或主题骨架视为主线完成度。M3-07—M3-10在M4前完成Renderer React/Zustand架构迁移，M7不承担基础框架重写。',
)
replace_once(
    'README.md',
    '→ M3 规划、设定与连续性\n→ M4 检索与AI基础设施',
    '→ M3 规划、设定、连续性与Renderer架构收口\n→ M4 检索与AI基础设施',
)
replace_once(
    'docs/INDEX.md',
    '→ M3 规划、设定与连续性\n→ M4 检索与AI基础设施',
    '→ M3 规划、设定、连续性与Renderer架构收口\n→ M4 检索与AI基础设施',
)

print('renderer task cards applied')
