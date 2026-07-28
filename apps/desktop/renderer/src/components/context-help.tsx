import type { OnboardingTip } from '@worldforge/contracts';

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
    title: '首页与本地项目',
    beginnerBody: '从四种入口创建同一种本地项目，或继续最近一次写作位置。',
    professionalBody: '项目入口共用同一工作区格式、命令与恢复边界。',
    boundary: '移除最近记录不会删除磁盘上的项目。',
    tip: 'local-autosave',
  },
  writing: {
    title: '正文工作台',
    beginnerBody: '当前稿会自动保存；创建历史版本后仍可继续写新的当前稿。',
    professionalBody: '当前稿对应活动 Draft；定稿与手动留档生成不可变 Version。',
    boundary: '锁定段落不会被直接输入、删除、移动、拆分或合并。',
    tip: 'locked-blocks',
  },
  candidates: {
    title: 'AI建议稿审阅',
    beginnerBody: 'AI结果先成为建议稿，只有你确认采用后才会改变当前稿。',
    professionalBody: 'Candidate 与 Draft 隔离；采用前执行差异、Revision、Hash 与锁定校验。',
    boundary: '采用前可预览差异；采用后仍可整体撤销。',
    tip: 'candidate-safety',
  },
  recovery: {
    title: '恢复与导出',
    beginnerBody: '自动备份、重大操作恢复点和手动快照分别保留。',
    professionalBody: '日常、重大操作与命名快照三轨独立，均带完整性与哈希状态。',
    boundary: '恢复默认创建安全副本，不覆盖当前项目。',
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
      title: '当前工作区',
      beginnerBody: '这里与其他页面共用同一套本地数据和安全操作。',
      professionalBody: '页面复用正式 Core 命令，不建立旁路状态。',
      boundary: '新手与专业模式只改变信息密度，不改变业务能力。',
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
          <p className="eyebrow">{disclosureMode === 'beginner' ? '页面说明' : '专业速查'}</p>
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
          查看项目引导
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
