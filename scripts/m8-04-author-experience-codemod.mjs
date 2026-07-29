/* global console */
import { readFile, writeFile } from 'node:fs/promises';

// 仅用于本阶段的一次性确定性改写；任何旧片段不匹配都会立即失败。
const replacementsByFile = {
  'AGENTS.md': [
    [
      '### INV-002 Candidate 隔离\n\nAI 输出先持久化为 Candidate，只有作者明确接受后才能进入 Draft。',
      '### INV-002 建议稿隔离\n\nAI输出先持久化为建议稿（内部对象：`Candidate`），只有作者明确采用后才能进入当前稿（内部对象：`Draft`）。',
    ],
    [
      '`project.sqlite` 是唯一权威项目数据源。Renderer 状态、Tiptap JSON、缓存、FTS、导出、摘要和日记均为派生数据。',
      '`project.sqlite` 是唯一权威作品数据源。应用界面状态、Tiptap JSON、缓存、全文搜索索引、导出、摘要和日记均为派生数据。',
    ],
    [
      'Lock、Revision、Hash、不可变 Version、项目/路径边界和事务完整性必须由代码保证。Prompt 不能充当安全控制。',
      '锁定保护、保存序号、内容校验、不可变历史版本、作品/路径边界和事务完整性必须由代码保证。生成指令不能充当安全控制。',
    ],
    [
      'AI 可以提议文本、发现和状态变化，但不得直接修改 Canon、定稿文本或权威状态。',
      'AI可以提议文本、发现和状态变化，但不得直接修改已确认设定、定稿文本或权威状态。',
    ],
    [
      '- 纵向影响：Renderer → Preload → Electron Main → Core → Repository → SQLite，以及任务卡、Schema、Migration、IPC、Evidence 和发布链路。',
      '- 纵向影响：应用界面 → 安全连接层 → 桌面主程序 → 本地服务 → 数据访问层 → SQLite，以及任务卡、数据结构、数据结构升级、程序内部通信、验证记录和交付链路。',
    ],
    [
      '## 6. 任务、分支与实施模式',
      `## 5.1 正式中文业务语言\n\n- 正式中文名称以 \`docs/product/AUTHOR_LANGUAGE_GLOSSARY.md\` 为唯一业务语言真源。\n- 应用界面、帮助、错误提示、任务卡、合并请求、提交说明、测试标题、代码注释、自动化步骤和验证记录必须优先使用正式中文名称。\n- 指向具体实现时，中文业务名称在前，内部类型、命令或字段放在反引号内补充。\n- TypeScript类型、函数、变量、数据库表、数据库字段、错误码、文件路径和外部协议字段不因语言统一进行破坏性重命名。\n- 新增业务概念必须先登记正式中文名称、内部标识、适用场景和禁止同义词。\n- 作者可见内容不得将建议稿、当前稿、历史版本、AI连接、设定更新建议、作品检查等概念重新显示为内部英文名。\n- 开发完成后必须运行 \`pnpm check:language\`，已纳入现有代码规范门禁。\n\n## 6. 任务、分支与实施模式`,
    ],
  ],
  'apps/desktop/renderer/src/features/home/home-page.tsx': [
    ['LOCAL FIRST · APPLICATION HOME', '本地写作首页'],
    ['正文、设定、索引和备份保留在本机项目工作区。', '正文、设定、索引和备份均保留在本机作品目录。'],
    ['新建项目', '新建作品'],
    ['打开项目', '打开作品'],
    ['恢复损坏项目', '恢复受损作品'],
    ['aria-label="项目健康提示"', 'aria-label="作品状态提示"'],
    ['四种入口共用同一套本地项目与安全边界，之后可以随时调整创作路径。', '四种入口共用同一套本地作品与安全边界，之后可以随时调整创作方式。'],
    ['最近项目', '最近作品'],
    ['路径丢失时可以重新定位；移除记录不会删除项目文件。', '路径丢失时可以重新定位；移除记录不会删除作品文件。'],
    ['新建或打开一个本地项目后，它会出现在这里。', '新建或打开一部本地作品后，它会出现在这里。'],
    ['CURRENT WORKSPACE', '当前作品'],
    ["readOnly ? '只读兼容模式' : '可写 · 本地数据库'", "readOnly ? '只读保护' : '可以写作 · 本地保存'"],
    ['项目以只读方式打开', '作品以只读方式打开'],
    ['项目数据或可用命令', '作品数据或可用功能'],
    ['移动项目', '移动作品目录'],
    ['关闭项目', '关闭作品'],
    ['恢复与导出', '恢复中心'],
    ['请填写项目名称和创作频道。', '请填写作品名称。'],
    ['应用会一次完成项目、规划输入和首章准备；取消不会留下半成品。', '应用会一次完成作品创建和必要准备；取消不会留下半成品。'],
    ['<span>项目名称</span>', '<span>作品名称</span>'],
    [
      `            <label>\n              <span>创作频道（可跳过）</span>\n              <input data-project-channel defaultValue="未指定" maxLength={120} name="channel" />\n            </label>\n            <label>\n              <span>初始结构</span>\n              <select\n                defaultValue={\n                  entry === 'blank' || disclosureMode === 'professional' ? 'blank' : 'starter'\n                }\n                data-project-initial-structure\n                disabled={entry === 'blank'}\n                name="initialStructure"\n              >\n                <option value="starter">首卷、第一章与当前稿</option>\n                <option value="blank">空白项目</option>\n              </select>\n            </label>`,
      `            {entry !== 'quick' ? (\n              <>\n                <label>\n                  <span>创作频道（可跳过）</span>\n                  <input\n                    data-project-channel\n                    defaultValue="未指定"\n                    maxLength={120}\n                    name="channel"\n                  />\n                </label>\n                <label>\n                  <span>初始结构</span>\n                  <select\n                    defaultValue={\n                      entry === 'blank' || disclosureMode === 'professional' ? 'blank' : 'starter'\n                    }\n                    data-project-initial-structure\n                    disabled={entry === 'blank'}\n                    name="initialStructure"\n                  >\n                    <option value="starter">首卷、第一章与当前稿</option>\n                    <option value="blank">空白作品</option>\n                  </select>\n                </label>\n              </>\n            ) : null}`,
    ],
    ["{entry !== 'blank' ? (", "{entry !== 'blank' && entry !== 'quick' ? ("],
    [
      `          <fieldset>\n            <legend>{entry === 'complete' ? '5. 创作路径' : '创作路径'}</legend>`,
      `          {entry === 'complete' ? (\n            <fieldset>\n              <legend>5. 创作方式</legend>`,
    ],
    [
      `          </fieldset>\n          {error ? <p className="react-field-error">{error}</p> : null}`,
      `            </fieldset>\n          ) : null}\n          {error ? <p className="react-field-error">{error}</p> : null}`,
    ],
    ["{pending ? '正在创建…' : '选择位置并创建'}", "{pending ? '正在创建…' : '选择位置并创建作品'}"],
    ["{ id: 'quick', title: '快速开始', description: '只回答三个可选问题，立即进入第一章。' }", "{ id: 'quick', title: '快速开始', description: '只填写作品名称，立即进入第一章。' }"],
    ["{ id: 'blank', title: '空白项目', description: '只填名称并选择位置，自由搭建。' }", "{ id: 'blank', title: '空白作品', description: '只填名称并选择位置，自由搭建。' }"],
    ["?? '新建本地项目'", "?? '新建本地作品'"],
  ],
  'apps/desktop/renderer/src/features/settings/settings-page.tsx': [
    ['LOCAL PREFERENCES · APP.SQLITE', '本地应用设置'],
    ['显示偏好和应用设置保存在本机，不写入任何项目正文。', '显示偏好和应用设置保存在本机，不写入任何作品正文。'],
    ['重新打开最近项目', '重新打开最近作品'],
    ['<option value="beginner">新手模式</option>', '<option value="beginner">简明模式</option>'],
    ['<option value="professional">专业模式</option>', '<option value="professional">完整模式</option>'],
    ['当前会话已有Provider通过真实连接测试；只调整推荐入口和说明。', '当前会话已有AI连接通过真实连接测试；这里只调整推荐入口和说明。'],
    ['Theme A · 安静编辑部', '安静编辑部'],
    ['Theme B', '水墨印章'],
    ['主题只替换视觉Token；界面缩放不会改变正文内容和导出字号。', '主题只改变视觉样式；界面缩放不会改变正文内容和导出字号。'],
    ['这里只显示安全诊断信息，不通过Renderer暴露堆栈、SQL、密钥或完整日志。', '这里只显示安全诊断信息，不向应用界面暴露调用堆栈、数据库语句、密钥或完整日志。'],
    ['<dt>Core状态</dt>', '<dt>本地服务状态</dt>'],
    ['<dt>诊断ID</dt>', '<dt>诊断编号</dt>'],
    ['bytes ·', '字节 ·'],
    ["{props.pendingKey === 'app.restartCore' ? '正在重启…' : '安全重启Core'}", "{props.pendingKey === 'app.restartCore' ? '正在重启…' : '安全重启本地服务'}"],
  ],
  'apps/desktop/renderer/src/features/planning/professional-planning-workbench.tsx': [
    ['<p className="eyebrow">Planning</p>', '<p className="eyebrow">完整规划</p>'],
    ['<h1>规划工作台</h1>', '<h1>完整规划工作台</h1>'],
    ['卷章与大纲、任务书、SceneBeat及相关设定在同一上下文中协作。', '卷章与大纲、作品任务书、场景节拍及相关设定在同一上下文中协作。'],
    [
      `          >\n            引导\n          </button>`,
      `          >\n            简明\n          </button>`,
    ],
    [
      `          >\n            专业\n          </button>`,
      `          >\n            完整\n          </button>`,
    ],
    ['恢复后仍从Core读取已保存内容。', '恢复后仍从本地服务读取已保存内容。'],
    ['<h2>章节与SceneBeat</h2>', '<h2>章节与场景节拍</h2>'],
    ['暂无实体。可在设定工作台建立人物、地点和规则。', '暂无人物或设定。可在设定工作台建立人物、地点和规则。'],
    ['ProjectBrief、PlotNode与SceneBeat均为规划；正文块移动需要单独预览与确认。', '作品任务书、大纲节点与场景节拍均属于规划；正文块移动需要单独预览与确认。'],
    ['动态状态和提案不会在此自动确认为Canon。', '动态状态和设定更新建议不会在此自动确认为已确认设定。'],
  ],
};

async function replaceRequired(filePath, replacements) {
  let source = await readFile(filePath, 'utf8');
  for (const [before, after] of replacements) {
    if (!source.includes(before)) {
      throw new Error(`${filePath} 缺少预期片段：${before.slice(0, 120)}`);
    }
    source = source.replaceAll(before, after);
  }
  await writeFile(filePath, source, 'utf8');
}

async function updateGovernedPaths() {
  const filePath = 'docs/product/AUTHOR_LANGUAGE_GOVERNED_PATHS.json';
  const state = JSON.parse(await readFile(filePath, 'utf8'));
  const additions = [
    'apps/desktop/renderer/src/features/home/home-page.tsx',
    'apps/desktop/renderer/src/features/settings/settings-page.tsx',
  ];
  state.paths = [...new Set([...state.paths, ...additions])];
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

for (const [filePath, replacements] of Object.entries(replacementsByFile)) {
  await replaceRequired(filePath, replacements);
}
await updateGovernedPaths();
console.log('M8-04作者体验确定性改写已完成。');
