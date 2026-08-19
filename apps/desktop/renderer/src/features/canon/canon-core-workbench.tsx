import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { confirmRegisteredUnsavedChanges } from '../../runtime/unsaved-changes.js';
import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';
import { useCanonAuthorReferences } from './canon-author-fields.js';
import { ContinuityPanel } from './continuity-panel.js';
import { EntityCanonPanel } from './entity-canon-panel.js';
import { NarrativePlanningPanel } from './narrative-planning-panel.js';
import { StateProposalPanel } from './state-proposal-panel.js';
import { StoryKnowledgePanel } from './story-knowledge-panel.js';

export type CanonSection = 'entities' | 'continuity' | 'narrative' | 'proposals' | 'knowledge';

interface CanonWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly projectName: string;
  readonly readOnly: boolean;
  readonly section: CanonSection;
  readonly selectedEntityId?: string | null;
  readonly selectedChapterId?: string | null;
  readonly onSectionChange: (section: CanonSection) => void;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
}

export function CanonWorkbench({
  bridge,
  projectId,
  projectName,
  readOnly,
  section,
  selectedEntityId,
  selectedChapterId,
  onSectionChange,
  onNavigate,
}: CanonWorkbenchProps) {
  const references = useCanonAuthorReferences(bridge, projectId);
  const changeSection = (nextSection: CanonSection): void => {
    if (
      nextSection === section ||
      confirmRegisteredUnsavedChanges('切换人物与世界设定分区')
    ) {
      onSectionChange(nextSection);
    }
  };
  return (
    <section className="canon-workbench" data-canon-dialog aria-label="设定工作台">
      <header className="feature-heading">
        <div>
          <p className="eyebrow">人物与世界</p>
          <h1>设定与连续性工作台</h1>
          <p>人物与世界、动态历史、叙事规划、故事知识和待处理智能审阅分区保存。</p>
        </div>
      </header>
      <nav className="feature-tabs" aria-label="设定工作台分区">
        <Tab
          current={section === 'entities'}
          label="人物与世界设定"
          onClick={() => changeSection('entities')}
        />
        <Tab
          current={section === 'continuity'}
          label="动态状态与时间线"
          marker="open-continuity"
          onClick={() => changeSection('continuity')}
        />
        <Tab
          current={section === 'narrative'}
          label="伏笔与弧光"
          marker="open-narrative-planning"
          onClick={() => changeSection('narrative')}
        />
        <Tab
          current={section === 'knowledge'}
          label="故事知识"
          marker="open-story-knowledge"
          onClick={() => changeSection('knowledge')}
        />
        <Tab
          current={section === 'proposals'}
          label="智能审阅"
          marker="open-state-proposals"
          onClick={() => changeSection('proposals')}
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
      {section === 'knowledge' ? (
        <StoryKnowledgePanel
          bridge={bridge}
          projectId={projectId}
          readOnly={readOnly}
          selectedEntityId={selectedEntityId ?? null}
          selectedChapterId={selectedChapterId ?? null}
          onNavigate={onNavigate}
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
  readonly marker?:
    'open-continuity' | 'open-narrative-planning' | 'open-state-proposals' | 'open-story-knowledge';
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-current={current ? 'page' : undefined}
      className={current ? 'is-active' : ''}
      data-open-continuity={marker === 'open-continuity' ? '' : undefined}
      data-open-narrative-planning={marker === 'open-narrative-planning' ? '' : undefined}
      data-open-state-proposals={marker === 'open-state-proposals' ? '' : undefined}
      data-open-story-knowledge={marker === 'open-story-knowledge' ? '' : undefined}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
