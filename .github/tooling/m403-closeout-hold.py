from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import os
import re
import subprocess

TARGET_BRANCH = 'work/m4-03-provider-credential-connection'
IMPLEMENTATION_COMMIT = '226aa653913756128070119415ed1a06b12f92f1'


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one target, found {count}')
    return text.replace(old, new, 1)


def append_section(path: str, heading: str, body: str) -> None:
    file = Path(path)
    text = file.read_text()
    if heading not in text:
        file.write_text(text.rstrip() + '\n\n' + heading + '\n\n' + body.strip() + '\n')


for command in [
    ['pnpm', 'lint'],
    ['pnpm', 'typecheck'],
    ['pnpm', 'build'],
    ['pnpm', 'test'],
    ['pnpm', 'test:migration'],
    ['pnpm', 'test:integration'],
    ['pnpm', 'test:security'],
    ['pnpm', 'test:e2e'],
    ['pnpm', 'test:unit'],
    ['pnpm', 'test:eval'],
]:
    run(command)
run(['node', 'scripts/taskctl.mjs', 'validate'])

run_id = os.environ.get('GITHUB_RUN_ID', 'local')
repository = os.environ.get('GITHUB_REPOSITORY', 'sy220284/666')
run_url = f'https://github.com/{repository}/actions/runs/{run_id}' if run_id != 'local' else 'local'

# Record the completed implementation in the task card without activating M4-04.
task_path = Path('docs/tasks/M4/M4-03_PROVIDER_CREDENTIAL_CONNECTION.md')
task = task_path.read_text()
implementation = '''## 实现结果

- 复用App DB `provider_configs`、Electron `safeStorage` Credential Broker和Core Utility Process，数据库只保存`credentialRef`，未建立第二套配置或凭据真源。
- 实现OpenAI兼容与Anthropic适配器；Custom协议仅允许仓库显式注册的批准适配器。
- 连接测试覆盖模型列表或缺失、最短生成、流式、结构化输出、Token统计、认证、限流、超时、中断和取消。
- Provider IPC拆分为独立领域注册模块；Main负责凭据解析，Preload仅暴露受控命令，Renderer不接触网络客户端或凭据明文。
- 端点按回环、局域网和外部分类；外部强制HTTPS；阻断嵌入凭据、query、fragment、保留地址、实例元数据、重定向及DNS跨信任边界解析。
- 请求取消和超时覆盖响应头、JSON正文与SSE完整生命周期；OpenAI流在`finish_reason`和`[DONE]`同时存在时只产生一次完成事件。
- 设置页支持保存配置、凭据替换/移除、连接测试、删除和明确的操作反馈。

## 验证结果

- Provider专项：Contracts、端点安全、凭据IPC和协议集成共13项回归通过。
- 全仓：Lint、Typecheck、Build、全量测试、Migration、Integration、Security、Electron E2E、Unit和Eval全部通过。
- Provider不可用、配置为空或凭据缺失时，不影响离线写作、搜索、恢复和导出基础路径。
- 按用户指令，M4-03收口后保持Implemented，暂不激活M4-04。

'''
if '## 实现结果' not in task:
    task = replace_once(task, '## 完成条件\n', implementation + '## 完成条件\n', 'task result section')
task = replace_once(task, '> 状态：In Progress  ', '> 状态：Implemented  ', 'task status')
task_path.write_text(task)

matrix_path = Path('docs/product/V1.0_TRACEABILITY_MATRIX.md')
matrix = matrix_path.read_text()
matrix = replace_once(
    matrix,
    '| REQ-023 | Provider配置与连接测试             | AI-001/002               | LOCAL_AI_SERVICE_SPEC、PROVIDER_PROTOCOL   | M4-03                            | P0-022                 | Planned     |',
    '| REQ-023 | Provider配置与连接测试             | AI-001/002               | LOCAL_AI_SERVICE_SPEC、PROVIDER_PROTOCOL   | M4-03                            | P0-022                 | Implemented | M4-03已完成真实适配器、连接探测、设置页与端到端接线；最终Verified随M4阶段验收关闭 |',
    'REQ-023 traceability',
)
matrix = replace_once(
    matrix,
    '| REQ-024 | 凭据使用系统安全存储               | AI-001                   | ADR-001、PRIVACY_AND_LOGGING               | M0-02、M4-03                     | P0-067                 | In Progress |',
    '| REQ-024 | 凭据使用系统安全存储               | AI-001                   | ADR-001、PRIVACY_AND_LOGGING               | M0-02、M4-03                     | P0-067                 | Implemented | M4-03复用safeStorage加密后端和权限受限密文文件，数据库仅保存credentialRef，明文仅存在于单次请求内存 |',
    'REQ-024 traceability',
)
matrix = replace_once(
    matrix,
    '| REQ-043 | 本机直连网络边界                   | —                        | ADR-001、LOCAL_AI_SERVICE_SPEC             | M4-03、M8-01                     | P0-070                 | Planned     |',
    '| REQ-043 | 本机直连网络边界                   | —                        | ADR-001、LOCAL_AI_SERVICE_SPEC             | M4-03、M8-01                     | P0-070                 | In Progress | M4-03已实现端点分类、HTTPS要求、保留地址/重定向/DNS信任边界阻断；M8-01继续发布前安全回归 |',
    'REQ-043 traceability',
)
matrix_path.write_text(matrix)

error_path = Path('docs/contracts/ERROR_CODES.md')
errors = error_path.read_text()
if 'AI_ENDPOINT_UNSAFE_013' not in errors:
    errors = replace_once(
        errors,
        '| `AI_RUN_ALREADY_FINISHED_012` | 已结束任务不能再次取消 | 否 |\n',
        '| `AI_RUN_ALREADY_FINISHED_012` | 已结束任务不能再次取消 | 否 |\n| `AI_ENDPOINT_UNSAFE_013` | Provider地址、协议、重定向或DNS解析跨越安全边界 | 否 |\n',
        'AI endpoint error code',
    )
error_path.write_text(errors)

append_section(
    'docs/contracts/IPC_CONTRACTS.md',
    '## M4-03 Provider IPC',
    '''Provider配置使用四个受信invoke通道：列表、保存、删除和连接测试。所有输入先经过Contracts Schema，再由Main的独立Provider IPC领域模块调用Core Utility Process。

- Renderer与Preload不得读取或返回凭据明文。
- 保存命令只接收一次性凭据动作；Main写入Credential Broker后仅把`credentialRef`提交到Core。
- 连接测试由Main按`credentialRef`临时解析明文，并在单次Core请求结束后释放引用。
- 不可信sender、错误operation判别或Schema失败统一返回稳定`CommandFailure`，不泄露URL query、凭据、正文、堆栈或本地路径。
- Provider通道由`provider-ipc-handlers.ts`独立注册与释放，避免通用IPC模块继续膨胀。''',
)
append_section(
    'docs/ai/PROVIDER_PROTOCOL.md',
    '## M4-03 已实现协议边界',
    '''V1内置OpenAI兼容和Anthropic适配器。连接探测依次验证模型列表（允许端点明确不支持）、最短非流式生成、流式完成、结构化输出和Token统计。Custom协议必须由仓库显式注册批准适配器。

请求使用手动重定向策略；适配器不得自动跟随跨主机重定向。取消与超时覆盖获取响应头、JSON正文和SSE读取完整生命周期。OpenAI流同时返回`finish_reason`与`[DONE]`时只发布一个`completed`事件。协议错误统一映射到`AI_*`稳定错误码。''',
)
append_section(
    'docs/ai/LOCAL_AI_SERVICE_SPEC.md',
    '## M4-03 直连端点规则',
    '''Base URL只允许`http:`或`https:`，禁止嵌入用户名/密码、query和fragment。外部端点必须使用HTTPS；HTTP只允许回环或用户明确配置的受信局域网端点。

端点检查阻断未指定、链路本地、保留/基准、组播、实例元数据等地址；DNS答案必须处于单一信任范围，且不得把外部主机解析到回环或局域网。Provider请求直接从本地应用发出，不经过WorldForge云端代理。''',
)
append_section(
    'docs/security/PRIVACY_AND_LOGGING.md',
    '## M4-03 Provider凭据与网络日志',
    '''数据库只保存`credentialRef`。凭据由Electron `safeStorage`可用的安全后端加密后写入权限受限本地文件；`safeStorage`不可用或后端为`basic_text`时阻断写入和读取。

普通日志只允许Provider ID、稳定错误码和诊断ID，不记录API Key、Authorization/x-api-key头、URL query、模型输入输出正文或完整本地路径。凭据替换失败时回滚新密文引用；旧凭据清理失败只记录脱敏警告。''',
)

summary_path = Path('docs/test-evidence/M4-03/summary.md')
summary = summary_path.read_text()
if '## 完整收口记录' not in summary:
    summary += f'''\n## 完整收口记录\n\n- 最终实现提交：`{IMPLEMENTATION_COMMIT}`。\n- 最终专项加固工作流：`30144534592`，Provider专项13/13、Typecheck、Lint、Build、Electron设置页和任务治理通过。\n- 全量测试适配工作流：`30144899128`，专项测试、Typecheck、Lint、完整`pnpm test`和任务治理通过，新增测试保持零unsafe类型逃逸。\n- 完整收口工作流：`{run_id}`（{run_url}），执行任务卡全部验证命令并固化证据。\n- 人工复核：配置/凭据真源唯一；Provider IPC已独立拆分；端点、取消、超时、流式完成和错误脱敏边界与任务卡一致。\n- 治理结论：M4-03标记Implemented并继续作为当前任务保留，M4-04暂不激活。\n'''
summary_path.write_text(summary)

commands_path = Path('docs/test-evidence/M4-03/commands.txt')
commands_path.write_text('''pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:migration
pnpm test:integration
pnpm test:security
pnpm test:e2e
pnpm test:unit
pnpm test:eval
node scripts/taskctl.mjs validate
''')

documents = [
    str(task_path),
    str(matrix_path),
    str(error_path),
    'docs/contracts/IPC_CONTRACTS.md',
    'docs/ai/PROVIDER_PROTOCOL.md',
    'docs/ai/LOCAL_AI_SERVICE_SPEC.md',
    'docs/security/PRIVACY_AND_LOGGING.md',
    str(summary_path),
    'docs/test-evidence/M4-03/known-risks.md',
]
run(['pnpm', 'exec', 'prettier', '--write', *documents])

evidence_dir = Path('docs/test-evidence/M4-03')
files = []
for name in ['baseline-audit.md', 'commands.txt', 'known-risks.md', 'summary.md']:
    path = evidence_dir / name
    data = path.read_bytes()
    files.append({'path': name, 'bytes': len(data), 'sha256': sha256(data).hexdigest()})
manifest = {
    'schemaVersion': 1,
    'taskId': 'M4-03',
    'commit': IMPLEMENTATION_COMMIT,
    'generatedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
    'files': files,
}
(evidence_dir / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
run(['pnpm', 'exec', 'prettier', '--write', str(evidence_dir / 'manifest.json')])

# Implementation-first hold: mark M4-03 Implemented while keeping it active; do not touch M4-04.
index_path = Path('docs/tasks/TASK_INDEX.md')
index = index_path.read_text()
pattern = re.compile(r'^(\|\s*M4-03\s*\|.*?\|\s*)In Progress(\s*\|\s*)$', re.MULTILINE)
index, count = pattern.subn(r'\1Implemented\2', index, count=1)
if count != 1:
    raise SystemExit(f'TASK_INDEX M4-03 status target count: {count}')
index_path.write_text(index)

state_path = Path('docs/tasks/ACTIVE_TASK.json')
state = json.loads(state_path.read_text())
if state.get('activeTask', {}).get('id') != 'M4-03' or state['activeTask'].get('status') != 'IN_PROGRESS':
    raise SystemExit('M4-03 is not the active IN_PROGRESS task')
implemented_at = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
state['authorization']['autoActivateNext'] = False
state['activeTask']['status'] = 'IMPLEMENTED'
state['lastImplementedTask'] = {
    'id': 'M4-03',
    'commit': IMPLEMENTATION_COMMIT,
    'implementedAt': implemented_at,
    'source': state['activeTask']['source'],
    'branch': state['activeTask']['branch'],
    'nextTaskId': 'M4-04',
    'activationDeferred': True,
    'activationDeferredReason': '按用户指令暂不激活下一张任务卡',
    'allowedPaths': state['activeTask']['allowedPaths'],
    'forbiddenPaths': state['activeTask'].get('forbiddenPaths', []),
}
if not any(entry.get('id') == 'M4-03' for entry in state.get('deferredVerification', [])):
    state.setdefault('deferredVerification', []).append({
        'id': 'M4-03',
        'implementationCommit': IMPLEMENTATION_COMMIT,
        'deferredAt': implemented_at,
        'pending': [
            'final traceability verification status',
            'Verified closure',
            'explicit instruction to activate M4-04',
        ],
    })
state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n')

run(['node', 'scripts/taskctl.mjs', 'sync'])
run(['pnpm', 'exec', 'prettier', '--write',
     'docs/tasks/ACTIVE_TASK.json',
     'docs/tasks/ACTIVE_TASK.md',
     'docs/tasks/TASK_INDEX.md',
     'docs/tasks/M4/M4-03_PROVIDER_CREDENTIAL_CONNECTION.md'])
run(['node', 'scripts/taskctl.mjs', 'validate'])
run(['git', 'diff', '--check'])
run(['git', 'add', '--all'])
run(['git', 'commit', '-m', '文档：完成M4-03收口并暂缓后续任务'])
run(['git', 'push', 'origin', f'HEAD:{TARGET_BRANCH}'])
