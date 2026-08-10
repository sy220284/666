import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useCanonAuthorReferences } from './canon-author-fields.js';
import { ContinuityPanel } from './continuity-panel.js';
import { EntityCanonPanel } from './entity-canon-panel.js';
import { NarrativePlanningPanel } from './narrative-planning-panel.js';
import { StateProposalPanel } from './state-proposal-panel.js';

export type CanonSection = 'entities' | 'continuity' | 'narrative' | 'proposals';

interface CanonWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly projectName: string;
  readonly readOnly: boolean;
  readonly section: CanonSection;
  readonly selectedEntityId?: string | null;
  readonly onSectionChange: (section: CanonSection) => void;
}

export function CanonWorkbench({
  bridge,
  projectId,
  projectName,
  readOnly,
  section,
  selectedEntityId,
  onSectionChange,
}: CanonWorkbenchProps) {
  const references = useCanonAuthorReferences(bridge, projectId);
  return (
    <section className="canon-workbench" data-canon-dialog aria-label="设定工作台">
      <header className="feature-heading">
        <div>
          <p className="eyebrow">人物与世界</p>
          <h1>设定与连续性工作台</h1>
          <p>已确认设定、动态历史、叙事规划和待处理AI设定建议分区保存。</p>
        </div>
      </header>
      <nav className="feature-tabs" aria-label="设定工作台分区">
        <Tab
          current={section === 'entities'}
          label="人物与世界设定"
          onClick={() => onSectionChange('entities')}
        />
        <Tab
          current={section === 'continuity'}
          label="动态状态与时间线"
          marker="open-continuity"
          onClick={() => onSectionChange('continuity')}
        />
        <Tab
          current={section === 'narrative'}
          label="伏笔与弧光"
          marker="open-narrative-planning"
          onClick={() => onSectionChange('narrative')}
        />
        <Tab
          current={section === 'proposals'}
          label="AI设定建议"
          marker="open-state-proposals"
          onClick={() => onSectionChange('proposals')}
        />
      </nav>
      {section === 'entities' ? (
        <EntityCanonPanel
          bridge={bridge}
          projectId={projectId}
          readOnly={readOnly}
          selectedEntityId={selectedEntityId ?? null}
        />
      ) : null}
      {section === 'continuity' ? (
        <ContinuityPanel
          bridge={bridge}
          projectId={projectId}
          projectName={projectName}
          readOnly={readOnly}
          references={references}
        />
      ) : null}
      {section === 'narrative' ? (
        <NarrativePlanningPanel
          bridge={bridge}
          projectId={projectId}
          projectName={projectName}
          readOnly={readOnly}
          references={references}
        />
      ) : null}
      {section === 'proposals' ? (
        <StateProposalPanel
          bridge={bridge}
          projectId={projectId}
          projectName={projectName}
          readOnly={readOnly}
        />
      ) : null}
    </section>
  );
}

function Tab({
  current,
  label,
  marker,
  onClick,
}: {
  readonly current: boolean;
  readonly label: string;
  readonly marker?: 'open-continuity' | 'open-narrative-planning' | 'open-state-proposals';
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-current={current ? 'page' : undefined}
      className={current ? 'is-active' : ''}
      data-open-continuity={marker === 'open-continuity' ? '' : undefined}
      data-open-narrative-planning={marker === 'open-narrative-planning' ? '' : undefined}
      data-open-state-proposals={marker === 'open-state-proposals' ? '' : undefined}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
