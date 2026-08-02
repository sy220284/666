import { useEffect, useState } from 'react';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import type { AppDisclosureMode } from '../../shell/app-shell-model.js';
import { BeginnerPlanningQuestions } from './brief/beginner-planning-questions.js';
import { PlanningWorkbench as ProfessionalPlanningWorkbench } from './professional-planning-workbench.js';

export { StructureNavigator } from '../structure/structure-navigator.js';

interface PlanningModeWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly disclosureMode?: AppDisclosureMode;
  readonly onClose: () => void;
}

/**
 * 简明规划和完整规划共用同一份作品任务书数据。
 * 简明规划只显示四个核心问题，完整规划展示全部大纲与场景节拍能力。
 */
export function PlanningModeWorkbench({
  bridge,
  projectId,
  readOnly,
  disclosureMode,
  onClose,
}: PlanningModeWorkbenchProps) {
  const initialMode = disclosureMode ?? currentDisclosureMode();
  const [professional, setProfessional] = useState(initialMode === 'professional');

  useEffect(() => {
    const synchronize = (): void => {
      setProfessional((disclosureMode ?? currentDisclosureMode()) === 'professional');
    };
    synchronize();
    if (disclosureMode) return;
    const observer = new MutationObserver(synchronize);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-author-mode'],
    });
    return () => observer.disconnect();
  }, [disclosureMode]);

  if (professional) {
    return (
      <section data-planning-disclosure="professional">
        <div className="planning-disclosure-bar">
          <div>
            <strong>完整规划模式</strong>
            <span>完整大纲树、卷章、场景节拍和作品任务书全部字段。</span>
          </div>
          <button
            className="quiet-button"
            data-planning-mode="beginner"
            type="button"
            onClick={() => setProfessional(false)}
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
      onOpenProfessional={() => setProfessional(true)}
    />
  );
}

function currentDisclosureMode(): AppDisclosureMode {
  return document.body.dataset.authorMode === 'professional' ? 'professional' : 'beginner';
}
