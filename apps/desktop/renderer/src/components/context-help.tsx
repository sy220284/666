import type { OnboardingTip } from '@worldforge/contracts';

import { authorTerm } from '../presentation/author-terms.js';
import type { AppDisclosureMode } from '../shell/app-shell-model.js';
import type { RendererRouteId } from '../state/ui-state-boundary.js';

interface ContextHelpProps {
  readonly route: RendererRouteId;
  readonly disclosureMode: AppDisclosureMode;
  readonly seenTips: readonly OnboardingTip[];
  readonly onClose: () => void;
  readonly onDismissTip: (tip: OnboardingTip) => void;
  readonly onOpenOnboarding: () => void;
}

interface HelpEntry {
  readonly title: string;
  readonly beginnerBody: string;
  readonly professionalBody: string;
  readonly boundary: string;
  readonly tip: OnboardingTip;
}

const helpByRoute: Partial<Record<RendererRouteId, HelpEntry>> = {
  home: {
    title: '首页与本地作品',
    beginnerBody: '从四种入口创建同一种本地作品，或继续最近一次写作位置。',
    professionalBody: '所有创建入口共用同一作品目录格式、功能命令和恢复边界。',
    boundary: '移除最近记录不会删除磁盘上的作品。',
    tip: 'local-autosave',
  },
  writing: {
    title: '正文工作台',
    beginnerBody: `当前稿会自动保存；创建${authorTerm('version')}后仍可继续写新的当前稿。`,
    professionalBody: `当前稿用于持续编辑；${authorTerm('finalVersion')}和手动留档生成不可变的${authorTerm('version')}。`,
    boundary: '锁定段落不会被直接输入、删除、移动、拆分或合并。',
    tip: 'locked-blocks',
  },
  candidates: {
    title: '智能建议稿审阅',
    beginnerBody: '智能生成结果先成为建议稿，只有你确认采用后才会改变当前稿。',
    professionalBody: `建议稿与当前稿保持隔离；采用前检查内容差异、${authorTerm('revision')}、内容校验值和锁定范围。`,
    boundary: '采用前可预览差异；采用后仍可整体撤销。',
    tip: 'candidate-safety',
  },
  recovery: {
    title: '恢复与导出',
    beginnerBody: '自动备份、重要操作恢复点和手动快照分别保留。',
    professionalBody: '日常备份、重要操作恢复点与命名快照三条路径独立，均带完整性和内容校验状态。',
    boundary: '恢复默认创建安全副本，不覆盖当前作品。',
    tip: 'recovery-copy',
  },
};

export function ContextHelp({
  route,
  disclosureMode,
  seenTips,
  onClose,
  onDismissTip,
  onOpenOnboarding,
}: ContextHelpProps) {
  const help =
    helpByRoute[route] ??
    ({
      title: '当前工作台',
      beginnerBody: '这里与其他页面共用同一套本地数据和安全操作。',
      professionalBody: `页面复用正式${authorTerm('core')}命令，不建立旁路状态。`,
      boundary: '简明模式与完整模式只改变信息密度，不改变业务能力。',
      tip: 'focus-mode',
    } satisfies HelpEntry);
  const seen = seenTips.includes(help.tip);
  return (
    <aside
      aria-label="上下文帮助"
      className="react-context-help"
      data-context-help
      role="complementary"
    >
      <header>
        <div>
          <p className="eyebrow">{disclosureMode === 'beginner' ? '页面说明' : '完整说明'}</p>
          <h2>{help.title}</h2>
        </div>
        <button aria-label="关闭帮助" className="quiet-button" type="button" onClick={onClose}>
          关闭
        </button>
      </header>
      <p>{disclosureMode === 'beginner' ? help.beginnerBody : help.professionalBody}</p>
      <p>
        <strong>安全边界：</strong>
        {help.boundary}
      </p>
      <footer>
        <button className="quiet-button" type="button" onClick={onOpenOnboarding}>
          查看作品引导
        </button>
        <button
          className="quiet-button"
          disabled={seen}
          type="button"
          onClick={() => onDismissTip(help.tip)}
        >
          {seen ? '本页提示已读' : '标记本页提示已读'}
        </button>
      </footer>
    </aside>
  );
}
