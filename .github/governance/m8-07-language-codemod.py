from pathlib import Path
import os
import re

ROOT = Path.cwd()
CHANGED: set[Path] = set()


def write(path: Path, text: str) -> None:
    old = path.read_text(encoding='utf-8')
    if text != old:
        path.write_text(text, encoding='utf-8')
        CHANGED.add(path)


def add_named_import(text: str, file: Path, name: str, target: Path) -> str:
    if re.search(rf"import\s*\{{[^}}]*\b{re.escape(name)}\b[^}}]*\}}\s*from", text, re.S):
        return text
    relative = os.path.relpath(target, file.parent).replace(os.sep, '/')
    if not relative.startswith('.'):
        relative = './' + relative
    declaration = f"import {{ {name} }} from '{relative}';\n"
    position = 0
    while True:
        while position < len(text) and text[position].isspace():
            position += 1
        if not text.startswith('import ', position):
            break
        end = text.find(';', position)
        if end < 0:
            raise RuntimeError(f'Unterminated import in {file}')
        position = end + 1
    return text[:position] + '\n' + declaration + text[position:]


PHRASES = {
    '最近项目': '最近作品',
    '项目工作区': '作品目录',
    '项目处于': '作品处于',
    '项目创建': '作品创建',
    '项目打开': '作品打开',
    '项目关闭': '作品关闭',
    '项目移动': '作品移动',
    '项目重新定位': '作品重新定位',
    '项目路径': '作品路径',
    '项目文件': '作品文件',
    '中断候选': '未完成建议稿',
    '候选待': '建议稿待',
    '审阅候选': '审阅建议稿',
    '状态提案': '设定更新建议',
    '裁决提案': '处理设定更新建议',
    '校验问题': '检查问题',
}
PRESENTATION = ROOT / 'apps/desktop/renderer/src/presentation/author-error-message.js'
RAW_CODE = re.compile(r"\$\{([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.error\.code\}")

for file in (ROOT / 'apps/desktop/renderer/src').rglob('*'):
    if file.suffix not in {'.ts', '.tsx'}:
        continue
    text = file.read_text(encoding='utf-8')
    for source, target in PHRASES.items():
        text = text.replace(source, target)
    replaced, count = RAW_CODE.subn(r'${authorErrorSummary(\1.error)}', text)
    if count:
        text = add_named_import(replaced, file, 'authorErrorSummary', PRESENTATION)
    write(file, text)

error_file = ROOT / 'apps/desktop/renderer/src/presentation/author-error-message.ts'
text = error_file.read_text(encoding='utf-8').replace(
    'const content = authorErrorMessage(error.code, error.message);',
    'const content = authorErrorMessage(error.code);',
)
write(error_file, text)

status_file = ROOT / 'apps/desktop/renderer/src/presentation/author-status-labels.ts'
text = status_file.read_text(encoding='utf-8')
anchor = "  critical: '必须处理',\n"
additions = (
    "  healthy: '运行正常',\n"
    "  starting: '正在启动',\n"
    "  degraded: '部分功能受限',\n"
    "  stopped: '已经停止',\n"
    "  crashed: '意外停止',\n"
    "  unreachable: '暂时无法连接',\n"
)
if "healthy: '运行正常'" not in text:
    text = text.replace(anchor, anchor + additions)
write(status_file, text)

language_gate = ROOT / 'scripts/check-author-language.mjs'
text = language_gate.read_text(encoding='utf-8')
helper_anchor = "function isModulePathLiteral(node) {\n"
helper = """function isTechnicalDiagnosticLiteral(node) {
  let current = node.parent;
  while (current) {
    if (
      ts.isNewExpression(current) &&
      ts.isIdentifier(current.expression) &&
      ['Error', 'TypeError', 'RangeError', 'AggregateError'].includes(current.expression.text)
    ) {
      return true;
    }
    if (ts.isStatement(current) || ts.isSourceFile(current)) return false;
    current = current.parent;
  }
  return false;
}

"""
if 'function isTechnicalDiagnosticLiteral' not in text:
    text = text.replace(helper_anchor, helper + helper_anchor)
text = text.replace(
    "if (!isModulePathLiteral(node) && !/^(?:\\.{0,2}\\/|@|node:)/u.test(value)) {",
    "if (\n        !isModulePathLiteral(node) &&\n        !isTechnicalDiagnosticLiteral(node) &&\n        !/^(?:\\.{0,2}\\/|@|node:)/u.test(value)\n      ) {",
)
text = text.replace(
    "} else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {\n      values.push(node.text);",
    "} else if (\n      (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) &&\n      !isTechnicalDiagnosticLiteral(node)\n    ) {\n      values.push(node.text);",
)
write(language_gate, text)

app_shell = ROOT / 'apps/desktop/renderer/src/app/app-shell-m3.tsx'
text = app_shell.read_text(encoding='utf-8')
text = add_named_import(text, app_shell, 'authorErrorSummary', PRESENTATION)
text = text.replace(
    'message: `${outcome.error.message} · ${authorErrorSummary(outcome.error)}`,',
    'message: authorErrorSummary(outcome.error),',
)
text = text.replace(
    '              bridge={bridge}\n              initialContinuation={continuation}',
    '              bridge={bridge}\n              disclosureMode={disclosureMode}\n              initialContinuation={continuation}',
)
write(app_shell, text)

wrapper = ROOT / 'apps/desktop/renderer/src/features/writing/writing-workbench.tsx'
text = wrapper.read_text(encoding='utf-8')
if "import type { AppDisclosureMode }" not in text:
    text = text.replace(
        "import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';",
        "import type { AppDisclosureMode } from '../../shell/app-shell-model.js';\nimport type { AuthorNavigationTarget } from '../../shell/navigation-target.js';",
    )
if 'readonly disclosureMode: AppDisclosureMode;' not in text:
    text = text.replace(
        '  readonly bridge: RendererBridgeAdapter;\n',
        '  readonly bridge: RendererBridgeAdapter;\n  readonly disclosureMode: AppDisclosureMode;\n',
    )
write(wrapper, text)

core = ROOT / 'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx'
text = core.read_text(encoding='utf-8')
if "import type { AppDisclosureMode }" not in text:
    text = text.replace(
        "import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';",
        "import type { AppDisclosureMode } from '../../shell/app-shell-model.js';\nimport type { AuthorNavigationTarget } from '../../shell/navigation-target.js';",
    )
if 'readonly disclosureMode: AppDisclosureMode;' not in text:
    text = text.replace(
        '  readonly bridge: RendererBridgeAdapter;\n',
        '  readonly bridge: RendererBridgeAdapter;\n  readonly disclosureMode: AppDisclosureMode;\n',
        1,
    )
if 'function savedStatus(' not in text:
    marker = 'const EMPTY_STATISTICS: WritingStatistics = {\n'
    index = text.index(marker)
    end = text.index('};', index) + 3
    helper = "\nfunction savedStatus(\n  label: string,\n  revision: number,\n  disclosureMode: AppDisclosureMode,\n): string {\n  return disclosureMode === 'beginner' ? label : `${label} · 保存序号 ${revision}`;\n}\n"
    text = text[:end] + helper + text[end:]
text = text.replace('  bridge,\n  project,', '  bridge,\n  disclosureMode,\n  project,', 1)
text = text.replace(
    "`已保存 · 保存序号 ${result.data.revision}${JSON.stringify(instance.getJSON()) === signature ? '' : ' · 编辑器仍有新输入'}`",
    "`${savedStatus('已保存', result.data.revision, disclosureMode)}${JSON.stringify(instance.getJSON()) === signature ? '' : ' · 编辑器仍有新输入'}`",
)
text = text.replace(
    '`已保存 · 保存序号 ${activeDraft.current?.revision ?? 0}`',
    "savedStatus('已保存', activeDraft.current?.revision ?? 0, disclosureMode)",
)
text = text.replace(
    'setStatus(`自动保存完成 · 保存序号 ${activeDraft.current?.revision ?? 0}`);',
    "setStatus(savedStatus('自动保存完成', activeDraft.current?.revision ?? 0, disclosureMode));",
)
text = text.replace(
    'setStatus(`已手动保存 · 保存序号 ${activeDraft.current?.revision ?? 0}`);',
    "setStatus(savedStatus('已手动保存', activeDraft.current?.revision ?? 0, disclosureMode));",
)
text = text.replace('    bridge,\n    persistedBlocks,', '    bridge,\n    disclosureMode,\n    persistedBlocks,', 1)
text = text.replace(
    '  }, [saveContinuation, setStatus]);',
    '  }, [disclosureMode, saveContinuation, setStatus]);',
    1,
)
text = text.replace(
    '      destroyEditor,\n      persistDraft,',
    '      destroyEditor,\n      disclosureMode,\n      persistDraft,',
    1,
)
text = text.replace('  }, [flush, setStatus]);', '  }, [disclosureMode, flush, setStatus]);', 1)
write(core, text)

settings = ROOT / 'apps/desktop/renderer/src/features/settings/settings-page.tsx'
text = settings.read_text(encoding='utf-8')
text = add_named_import(
    text,
    settings,
    'authorStatusLabel',
    ROOT / 'apps/desktop/renderer/src/presentation/author-status-labels.js',
)
old = """      <dl className="react-diagnostic-list">
        <div>
          <dt>本地服务状态</dt>
          <dd>{core?.status ?? '未知'}</dd>
        </div>
        <div>
          <dt>重启次数</dt>
          <dd>{core?.restartCount ?? '—'}</dd>
        </div>
        <div>
          <dt>错误码</dt>
          <dd>{core?.lastErrorCode ?? '无'}</dd>
        </div>
        <div>
          <dt>诊断编号</dt>
          <dd>{core?.diagnosticId ?? '无'}</dd>
        </div>
      </dl>"""
new = """      <dl className="react-diagnostic-list">
        <div>
          <dt>本地服务状态</dt>
          <dd>{core ? authorStatusLabel(core.status) : '状态未知'}</dd>
        </div>
        <div>
          <dt>重启次数</dt>
          <dd>{core?.restartCount ?? '—'}</dd>
        </div>
      </dl>
      {core?.lastErrorCode || core?.diagnosticId ? (
        <details className="react-technical-details">
          <summary>技术详情</summary>
          <dl className="react-diagnostic-list">
            <div>
              <dt>错误码</dt>
              <dd>{core.lastErrorCode ?? '无'}</dd>
            </div>
            <div>
              <dt>诊断编号</dt>
              <dd>{core.diagnosticId ?? '无'}</dd>
            </div>
          </dl>
        </details>
      ) : null}"""
if old not in text:
    raise RuntimeError('settings diagnostic block changed unexpectedly')
text = text.replace(old, new)
write(settings, text)

foundation = ROOT / 'apps/desktop/renderer/src/runtime/renderer-foundation-runtime.ts'
text = foundation.read_text(encoding='utf-8')
replacements = {
    "'Renderer foundation runtime is disposed.'": "'应用界面运行环境已经关闭。'",
    "'Renderer foundation is starting.'": "'应用界面正在启动。'",
    "'Renderer startup was cancelled during shutdown.'": "'应用关闭过程中已取消界面启动。'",
    "'Legacy compatibility initialization failed.'": "'兼容层初始化失败。'",
    "'Renderer foundation is ready.'": "'应用界面已就绪。'",
    "'Renderer foundation startup failed.'": "'应用界面启动失败。'",
    "'Renderer foundation disposal failed.'": "'应用界面关闭清理失败。'",
    "'Core status request was cancelled.'": "'本地服务状态读取已取消。'",
    "'Core status response was superseded by a newer request.'": "'本地服务状态已由更新结果替代。'",
    "'Copy diagnostics, restart Core, or close the application safely.'": "'请复制诊断信息、重启本地服务，或安全关闭应用。'",
}
for source, target in replacements.items():
    text = text.replace(source, target)
if 'function coreStatusLabel(' not in text:
    marker = "const FAILED_STATUS_ID = 'renderer-foundation-failed';\n"
    helper = """

function coreStatusLabel(status: CoreStatus['status']): string {
  if (status === 'healthy') return '运行正常';
  if (status === 'starting') return '正在启动';
  if (status === 'degraded') return '部分功能受限';
  if (status === 'stopped') return '已经停止';
  if (status === 'crashed') return '意外停止';
  return '状态未知';
}
"""
    text = text.replace(marker, marker + helper)
text = text.replace(
    'message: `Core is ${outcome.data.status}.`,',
    'message: `本地服务${coreStatusLabel(outcome.data.status)}。`,',
)
write(foundation, text)

tests = ROOT / 'tests/unit/author-language.test.ts'
text = tests.read_text(encoding='utf-8')
text = text.replace(
    "import { authorErrorMessage } from '../../apps/desktop/renderer/src/presentation/author-error-message.js';",
    "import {\n  authorErrorMessage,\n  authorErrorSummary,\n} from '../../apps/desktop/renderer/src/presentation/author-error-message.js';",
)
text = text.replace(
    "    expect(authorStatusLabel('false_positive')).toBe('已标记为误报');",
    "    expect(authorStatusLabel('false_positive')).toBe('已标记为误报');\n    expect(authorStatusLabel('degraded')).toBe('部分功能受限');",
)
if '不把桥接消息和错误码带入普通提示' not in text:
    text = text.replace(
        "  it('未知错误使用安全回退说明', () => {",
        "  it('未知错误摘要不把桥接消息和错误码带入普通提示', () => {\n    const summary = authorErrorSummary({\n      code: 'CORE_STATUS_FAILED',\n      message: 'CORE_STATUS_FAILED',\n    });\n    expect(summary).toContain('操作未完成');\n    expect(summary).not.toContain('CORE_STATUS_FAILED');\n  });\n\n  it('未知错误使用安全回退说明', () => {",
    )
write(tests, text)

manifest = ROOT / 'test-results/m8-07-codemod-files.txt'
manifest.parent.mkdir(parents=True, exist_ok=True)
manifest.write_text(
    '\n'.join(sorted(str(path.relative_to(ROOT)) for path in CHANGED)) + '\n',
    encoding='utf-8',
)
