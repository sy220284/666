import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import type { AppDisclosureMode } from '../../shell/app-shell-model.js';
import { BeginnerPlanningQuestions } from './brief/beginner-planning-questions.js';
import { PlanningWorkbench as ProfessionalPlanningWorkbench } from './professional-planning-workbench.js';

export { StructureNavigator } from '../structure/structure-navigator.js';

interface PlanningModeWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly mode: AppDisclosureMode;
  readonly onChangeMode: (mode: AppDisclosureMode) => void;
  readonly onClose: () => void;
}

/**
 * 简明规划和完整规划共用同一份作品核心数据。
 * 模式状态由上层 Settings 单一持有，本组件只展示并发出切换意图。
 */
export function PlanningModeWorkbench({
  bridge,
  projectId,
  readOnly,
  mode,
  onChangeMode,
  onClose,
}: PlanningModeWorkbenchProps) {
  if (mode === 'professional') {
    return (
      <section data-planning-disclosure="professional">
        <div className="planning-disclosure-bar">
          <div>
            <strong>完整规划模式</strong>
            <span>查看完整大纲、卷章、场景和作品核心全部内容。</span>
          </div>
          <button
            className="quiet-button"
            data-planning-mode="beginner"
            type="button"
            onClick={() => onChangeMode('beginner')}
          >
            切换到简明规划
          </button>
        </div>
        <ProfessionalPlanningWorkbench
          bridge={bridge}
          projectId={projectId}
          readOnly={readOnly}
          onClose={onClose}
        />
      </section>
    );
  }

  return (
    <BeginnerPlanningQuestions
      bridge={bridge}
      projectId={projectId}
      readOnly={readOnly}
      onClose={onClose}
      onOpenProfessional={() => onChangeMode('professional')}
    />
  );
}
