import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  ResearchAttachment,
  ResearchAttachmentPreview,
  ResearchCatalog,
  ResearchLink,
  ResearchReference,
  ResearchTargetType,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import {
  listResearchReferenceSelection,
  removeResearchReferenceSelection,
  researchReferenceKey,
  setResearchReferenceSelected,
} from '../../bridge/research-reference-selection.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { useUnsavedChangesGuard } from '../../runtime/unsaved-changes.js';
import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';
import { useRendererUiStore } from '../../state/ui-store.js';
import { useResearchTargetOptions } from './research-target-options.js';

interface ResearchEditingSnapshot {
  readonly note: ResearchCatalog['notes'][number];
  readonly attachments: readonly ResearchAttachment[];
  readonly links: readonly ResearchLink[];
}

interface ResearchWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly selectedNoteId: string | null;
  readonly navigationQuery: string | null;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
  readonly onSelectNote: (noteId: string | null) => void;
  readonly onReturn?: () => void;
  readonly onClose: () => void;
}

const TARGET_OPTIONS: readonly [ResearchTargetType, string][] = [
  ['chapter', 'ç« èŠ‚'],
  ['volume', 'å·'],
  ['entity', 'äººç‰©æˆ–è®¾å®š'],
  ['relationship', 'äººç‰©å…³ç³»'],
  ['timeline', 'æ—¶é—´çº¿äº‹ä»¶'],
  ['foreshadowing', 'ä¼ç¬”'],
  ['arc', 'äººç‰©æˆé•¿çº¿'],
  ['milestone', 'æˆé•¿é‡Œç¨‹ç¢‘'],
  ['idea', 'çµæ„Ÿ'],
];
const PREVIEW_MEDIA_TYPES = new Set(['text/plain', 'text/markdown', 'application/json']);

function splitTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[ï¼Œ,ã€\s]+/u)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ].slice(0, 50);
}

function attachmentLabel(attachment: ResearchAttachment): string {
  const size =
    attachment.sizeBytes < 1024 * 1024
      ? `${Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB`
      : `${(attachment.sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  return `${attachment.displayName} Â· ${size} Â· ${attachment.mediaType}`;
}

function linkNavigation(projectId: string, link: ResearchLink): AuthorNavigationTarget {
  return {
    type: 'research-link-target',
    projectId,
    targetType: link.targetType,
    targetId: link.targetId,
  };
}

function selectedReferenceKeys(projectId: string): ReadonlySet<string> {
  return new Set(listResearchReferenceSelection(projectId).map(researchReferenceKey));
}

export function ResearchWorkbench({
  bridge,
  projectId,
  readOnly,
  selectedNoteId,
  navigationQuery,
  onNavigate,
  onSelectNote,
  onReturn,
  onClose,
}: ResearchWorkbenchProps) {
  const returnLocation = useRendererUiStore((state) => state.returnLocation);
  const [catalog, setCatalog] = useState<ResearchCatalog | null>(null);
  const [editingSnapshot, setEditingSnapshot] = useState<ResearchEditingSnapshot | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const knownNoteIds = useRef<Set<string>>(new Set());
  const filterChangePending = useRef(false);
  const [query, setQuery] = useState(navigationQuery ?? '');
  const [showArchived, setShowArchived] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [targetFilterType, setTargetFilterType] = useState<ResearchTargetType | 'all'>('all');
  const [targetFilterId, setTargetFilterId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [sourceUri, setSourceUri] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [targetType, setTargetType] = useState<ResearchTargetType>('chapter');
  const [targetId, setTargetId] = useState('');
  const [preview, setPreview] = useState<ResearchAttachmentPreview | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const { dirty, markDirty, clearDirty, confirmDiscard } = useUnsavedChangesGuard('ç ”ç©¶ç¬”è®°');
  const loadedNoteIdentity = useRef<string | null>(null);
  const [notice, setNotice] = useState(
    'ç ”ç©¶èµ„æ–™ä¸ä¼šè‡ªåŠ¨å†™å…¥äººç‰©ä¸ä¸–ç•Œï¼Œä¹Ÿä¸ä¼šè‡ªåŠ¨è¿›å…¥æ™ºèƒ½ä¸Šä¸‹æ–‡ã€‚',
  );
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<ReadonlySet<string>>(() =>
    selectedReferenceKeys(projectId),
  );
  const targetOptions = useResearchTargetOptions(bridge, projectId);
  const linkTargetOptions = useMemo(
    () => targetOptions.filter((option) => option.type === targetType),
    [targetOptions, targetType],
  );
  const filterTargetOptions = useMemo(
    () =>
      targetFilterType === 'all'
        ? []
        : targetOptions.filter((option) => option.type === targetFilterType),
    [targetFilterType, targetOptions],
  );
  const availableTags = useMemo(
    () =>
      [
        ...new Set(
          [...(catalog?.notes.flatMap((note) => note.tags) ?? []), tagFilter].filter(Boolean),
        ),
      ].sort((left, right) => left.localeCompare(right, 'zh-CN')),
    [catalog?.notes, tagFilter],
  );
  const availableSources = useMemo(
    () =>
      [
        ...new Set(
          [
            ...(catalog?.notes.map((note) => note.sourceType).filter(Boolean) ?? []),
            sourceFilter || null,
          ].filter((value): value is string => Boolean(value)),
        ),
      ].sort((left, right) => left.localeCompare(right, 'zh-CN')),
    [catalog?.notes, sourceFilter],
  );

  const filteredSelected = useMemo(
    () => catalog?.notes.find((note) => note.id === selectedNoteId) ?? null,
    [catalog?.notes, selectedNoteId],
  );
  const selected =
    filteredSelected ?? (editingSnapshot?.note.id === selectedNoteId ? editingSnapshot.note : null);
  const selectedAttachments = filteredSelected
    ? (catalog?.attachments.filter((attachment) => attachment.noteId === selectedNoteId) ?? [])
    : editingSnapshot?.note.id === selectedNoteId
      ? editingSnapshot.attachments
      : [];
  const selectedLinks = filteredSelected
    ? (catalog?.links.filter(
        (link) => link.sourceType === 'note' && link.sourceId === selectedNoteId,
      ) ?? [])
    : editingSnapshot?.note.id === selectedNoteId
      ? editingSnapshot.links
      : [];
  const selectedOutsideCurrentFilter = Boolean(selected && !filteredSelected);

  const restrictiveFiltersActive =
    Boolean(query.trim()) ||
    Boolean(tagFilter) ||
    Boolean(sourceFilter) ||
    targetFilterType !== 'all' ||
    Boolean(targetFilterId);

  const load = useCallback(async (): Promise<void> => {
    const outcome = await bridge.research.list(
      {
        projectId,
        includeArchived: showArchived,
        ...(query.trim() ? { query: query.trim() } : {}),
        ...(tagFilter ? { tags: [tagFilter] } : {}),
        ...(sourceFilter ? { noteSourceType: sourceFilter } : {}),
        ...(targetFilterType !== 'all' ? { targetType: targetFilterType } : {}),
        ...(targetFilterId ? { targetId: targetFilterId } : {}),
      },
      {
        mode: 'replace',
        laneKey: `research.list:${projectId}`,
      },
    );
    if (outcome.state !== 'success') {
      if (outcome.state === 'failure') {
        setNotice(bç ”ç©¶èµ„æ–™è¯»å—å¤±è´¥ï¼š${authorErrorSummary(outcome.error)}`);
      }
      return;
    }
    setCatalog(outcome.data);
    for (const note of outcome.data.notes) knownNoteIds.current.add(note.id);
    if (selectedNoteId && !outcome.data.notes.some((note) => note.id === selectedNoteId)) {
      const hasLoadedEditingContext = loadedNoteIdentity.current?.startsWith(
        `${selectedNoteId}:`,
      );
      const preserveSelection = restrictiveFiltersActive || filterChangePending.current;
      if (!preserveSelection || !hasLoadedEditingContext) {
        onSelectNote(outcome.data.notes[0]?.id ?? null);
      }
    } else if (!selectedNoteId && outcome.data.notes[0]) {
      onSelectNote(outcome.data.notes[0].id);
    }
    filterChangePending.current = false;
  }, [
    bridge.research,
    restrictiveFiltersActive,
    onSelectNote,
    projectId,
    query,
    refreshVersion,
    selectedNoteId,
    showArchived,
    sourceFilter,
    tagFilter,
    targetFilterId,
    targetFilterType,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedReferenceIds(selectedReferenceKeys(projectId));
  }, [projectId]);

  useEffect(() => {
    if (!selectedNoteId) {
      setEditingSnapshot(null);
      loadedNoteIdentity.current = null;
      return;
    }
    const note = catalog?.notes.find((item) => item.id === selectedNoteId);
    if (!note) return;
    setEditingSnapshot({
      note,
      attachments:
        catalog?.attachments.filter((attachment) => attachment.noteId === note.id) ?? [],
      links:
        catalog?.links.filter(
          (link) => link.sourceType === 'note' && link.sourceId === note.id,
        ) ?? [],
    });
  }, [catalog, selectedNoteId]);

  const restoreSelectedDraft = useCallback((): void => {
    setPreview(null);
    if (!selected) {
      setTitle('');
      setBody('');
      setSourceType('');
      setSourceLabel('');
      setSourceUri('');
      setTagsText('');
      clearDirty();
      return;
    }
    setTitle(selected.title);
    setBody(selected.body);
    setSourceType(selected.sourceType ?? '');
    setSourceLabel(selected.sourceLabel ?? '');
    setSourceUri(selected.sourceUri ?? '');
    setTagsText(selected.tags.join('ï¼Œ'));
    clearDirty();
  }, [clearDirty, selected]);

  useEffect(() => {
    const identity = selected ? `${selected.id}:${selected.updatedAt}` : null;
    if (loadedNoteIdentity.current === identity) return;
    loadedNoteIdentity.current = identity;
    restoreSelectedDraft();
  }, [restoreSelectedDraft, selected]);

  const markFilterChange = (): void => {
    filterChangePending.current = true;
  };

  const confirmDiscardUnsaved = (action: string): boolean => {
    if (!dirty) return true;
    if (!confirmDiscard(action)) {
      setNotice('å·²ä¿ç•™å½“å‰ç‚S¦Û²S¢ºÃjšr«’şw–¶c’ş»šRçœ¤ì(€€€€€É•ÑÕÉ¸™…±Í”ì(€€€ô(€€€É•ÍÑ½É•M•±•Ñ•‘É…™Ğ ¤ì(€€€É•ÑÕÉ¸ÑÉÕ”ì(€ôì((€½¹ÍĞ…ÁÁ±å…Ñ…±½œ€ô€¡¹•áĞèI•Í•…É¡…Ñ…±½œ°ÁÉ•™•ÉÉ•‘%üèÍÑÉ¥¹œ¤èÙ½¥€ôøì(€€€­¹½İ¹9½Ñ•%‘Ì¹ÕÉÉ•¹Ğ€ô¹•ÜM•Ğ¡¹•áĞ¹¹½Ñ•Ì¹µ…À ¡¹½Ñ”¤€ôø¹½Ñ”¹¥¤¤ì(€€€½¹ÍĞÙ¥Í¥‰±•…±±‰…­%€ô…Ñ…±½œü¹¹½Ñ•Ì¹™¥¹ ¡¹½Ñ”¤€ôø(€€€€€¹•áĞ¹¹½Ñ•Ì¹Í½µ” ¡…¹‘¥‘…Ñ”¤€ôø…¹‘¥‘…Ñ”¹¥€ôôô¹½Ñ”¹¥¤°(€€€€¤ü¹¥ì(€€€½¹ÍĞ¹•áÑM•±•Ñ•‘%€ô(€€€€€ÁÉ•™•ÉÉ•‘%€üü(€€€€€€¡Í•±•Ñ•‘9½Ñ•%€˜˜¹•áĞ¹¹½Ñ•Ì¹Í½µ” ¡¹½Ñ”¤€ôø¹½Ñ”¹¥€ôôôÍ•±•Ñ•‘9½Ñ•%¤(€€€€€€€€üÍ•±•Ñ•‘9½Ñ•%(€€€€€€€€è€¡Ù¥Í¥‰±•…±±‰…­%€üü¹Õ±°¤¤ì(€€€Í•Ñ…Ñ…±½œ¡¹•áĞ¤ì(€€€¥˜€¡¹•áÑM•±•Ñ•‘%¤ì(€€€€€½¹ÍĞ¹½Ñ”€ô¹•áĞ¹¹½Ñ•Ì¹™¥¹ ¡¥Ñ•´¤€ôø¥Ñ•´¹¥€ôôô¹•áÑM•±•Ñ•‘%¤ì(€€€€€¥˜€¡¹½Ñ”¤ì(€€€€€€€Í•Ñ‘¥Ñ¥¹M¹…ÁÍ¡½Ğ¡ì(€€€€€€€€€¹½Ñ”°(€€€€€€€€€…ÑÑ…¡µ•¹ÑÌè¹•áĞ¹…ÑÑ…¡µ•¹ÑÌ¹™¥±Ñ•È ¡…ÑÑ…¡µ•¹Ğ¤€ôø…ÑÑ…¡µ•¹Ğ¹¹½Ñ•%€ôôô¹½Ñ”¹¥¤°(€€€€€€€€€±¥¹­Ìè¹•áĞ¹±¥¹­Ì¹™¥±Ñ•È (€€€€€€€€€€€€¡±¥¹¬¤€ôø±¥¹¬¹Í½ÕÉ•QåÁ”€ôôô€¹½Ñ”œ€˜˜±¥¹¬¹Í½ÕÉ•%€ôôô¹½Ñ”¹¥°(€€€€€€€€€€¤°(€€€€€€€ô¤ì(€€€€€ô(€€€ô•±Í”ì(€€€€€Í•Ñ‘¥Ñ¥¹M¹…ÁÍ¡½Ğ¡¹Õ±°¤ì(€€€€€±½…‘•‘9½Ñ•%‘•¹Ñ¥Ñä¹ÕÉÉ•¹Ğ€ô¹Õ±°ì(€€€ô(€€€½¹M•±•Ñ9½Ñ”¡¹•áÑM•±•Ñ•‘%¤ì(€€€Í•ÑI•™É•Í¡Y•ÉÍ¥½¸ ¡Ù•ÉÍ¥½¸¤€ôøÙ•ÉÍ¥½¸€¬€Ä¤ì(€ôì((€½¹ÍĞÉ•…Ñ•9½Ñ”€ô…Íå¹Œ€ ¤èAÉ½µ¥Í”ñÙ½¥ø€ôøì(€€€¥˜€¡É•…‘=¹±äñğÁ•¹‘¥¹œñğ€……Ñ…±½œñğ€…½¹™¥Éµ¥Í…É‘U¹Í…Ù• ŸšZÃ–îë²S¢ºÀœ¤¤É•ÑÕÉ¸ì(€€€½¹ÍĞ•á¥ÍÑ¥¹9½Ñ•%‘Ì€ô¹•ÜM•Ğ¡­¹½İ¹9½Ñ•%‘Ì¹ÕÉÉ•¹Ğ¤ì(€€€Í•ÑA•¹‘¥¹œ É•…Ñ”œ¤ì(€€€½¹ÍĞ½ÕÑ½µ”€ô…İ…¥Ğ‰É¥‘”¹É•Í•…É ¹É•…Ñ•9½Ñ” (€€€€€ì(€€€€€€€ÁÉ½©•Ñ%°(€€€€€€€Ñ¥Ñ±”è€Ÿšr«–F÷–B7‚S¦Û²S¢ºÀœ°(€€€€€€€‰½‘äè€œœ°(€€€€€€€Í½ÕÉ•QåÁ”è¹Õ±°°(€€€€€€€Í½ÕÉ•1…‰•°è¹Õ±°°(€€€€€€€Í½ÕÉ•UÉ¤è¹Õ±°°(€€€€€€€Ñ…Ìèmt°(€€€€€ô°(€€€€€ìµ½‘”è€É•©•Ğœ°É•ÅÕ•ÍÑ-•äèÉ•Í•…É ¹É•…Ñ”è‘íÁÉ½©•Ñ%‘õ€ô°(€€€€¤ì(€€€Í•ÑA•¹‘¥¹œ¡¹Õ±°¤ì(€€€¥˜€¡½ÕÑ½µ”¹ÍÑ…Ñ”€ôôô€ÍÕ•ÍÌœ¤ì(€€€€€½¹ÍĞÉ•…Ñ•€ô½ÕÑ½µ”¹‘…Ñ„¹¹½Ñ•Ì(€€€€€€€€¹™¥±Ñ•È ¡¹½Ñ”¤€ôø€…•á¥ÍÑ¥¹9½Ñ•%‘Ì¹¡…Ì¡¹½Ñ”¹¥¤¤(€€€€€€€€¹Í½ÉĞ ¡±•™Ğ°É¥¡Ğ¤€ôøÉ¥¡Ğ¹É•…Ñ•‘Ğ¹±½…±•½µÁ…É”¡±•™Ğ¹É•…Ñ•‘Ğ¤¥lÁtì(€€€€€…ÁÁ±å…Ñ…±½œ¡½ÕÑ½µ”¹‘…Ñ„°É•…Ñ•ü¹¥¤ì(€€€€€Í•Ñ9½Ñ¥” Ÿ‚òk¦Û²S¢ºÃ–ŞË–"o–îëœ¤ì(€€€ô•±Í”¥˜€¡½ÕÑ½µ”¹ÍÑ…Ñ”€ôôô€™…¥±ÕÉ”œ¤ì(€€€€€Í•Ñ9½Ñ¥”¡ƒ–"o–îë–’Ç¢Ò—¾òh‘í…ÕÑ¡½ÉÉÉ½ÉMÕµµ…Éä¡½ÕÑ½µ”¹•ÉÉ½È¥õ€¤ì(€€€ô(€ôì((€½¹ÍĞÍ…Ù•9½Ñ”€ô…Íå¹Œ€ ¤èAÉ½µ¥Í”ñÙ½¥ø€ôøì(€€€¥˜€ …Í•±•Ñ•ñğÉ•…‘=¹±äñğÁ•¹‘¥¹œñğ€…Ñ¥Ñ±”¹ÑÉ¥´ ¤¤É•ÑÕÉ¸ì(€€€Í•ÑA•¹‘¥¹œ Í…Ù”œ¤ì(€€€½¹ÍĞ½ÕÑ½µ”€ô…İ…¥Ğ‰É¥‘”¹É•Í•…É ¹ÕÁ‘…Ñ•9½Ñ” (€€€€€ì(€€€€€€€ÁÉ½©•Ñ%°(€€€€€€€¹½Ñ•%èÍ•±•Ñ•¹¥°(€€€€€€€•áÁ•Ñ•‘UÁ‘…Ñ•‘ĞèÍ•±•Ñ•¹ÕÁ‘…Ñ•‘Ğ°(€€€€€€€Ñ¥Ñ±”èÑ¥Ñ±”¹ÑÉ¥´ ¤°(€€€€€€€‰½‘ä°(€€€€€€€Í½ÕÉ•QåÁ”èÍ½ÕÉ•QåÁ”¹ÑÉ¥´ ¤ñğ¹Õ±°°(€€€€€€€Í½ÕÉ•1…‰•°èÍ½ÕÉ•1…‰•°¹ÑÉ¥´ ¤ñğ¹Õ±°°(€€€€€€€Í½ÕÉ•UÉ¤èÍ½ÕÉ•UÉ¤¹ÑÉ¥´ ¤ñğ¹Õ±°°(€€€€€€€Ñ…ÌèÍÁ±¥ÑQ…Ì¡Ñ…ÍQ•áĞ¤°(€€€€€ô°(€€€€€ìµ½‘”è€É•©•Ğœ°É•ÅÕ•ÍÑ-•äèÉ•Í•…É ¹Í…Ù”è‘íÍ•±•Ñ•¹¥‘õ€ô°(€€€€¤ì(€€€Í•ÑA•¹‘¥¹œ¡¹Õ±°¤ì(€€€¥˜€¡½ÕÑ½µ”¹ÍÑ…Ñ”€ôôô€ÍÕ•ÍÌœ¤ì(€€€€€±•…É¥ÉÑä ¤ì(€€€€€…ÁÁ±å…Ñ…±½œ¡½ÕÑ½µ”¹‘…Ñ„°Í•±•Ñ•¹¥¤ì(€€€€€Í•Ñ9½Ñ¥” Ÿ‚S¦Û²S¢ºÃ–ŞË’şw–¶cœ¤ì(€€€ô•±Í”¥˜€¡½ÕÑ½µ”¹ÍÑ…Ñ”€ôôô€™…¥±ÕÉ”œ¤ì(€€€€€Í•Ñ9½Ñ¥”¡ƒ’şw–¶c–’Ç¢Ò—¾òh‘í…ÕÑ¡½ÉÉÉ½ÉMÕµµ…Éä¡½ÕÑ½µ”¹•ÉÉ½È¥õ€¤ì(€€€ô(€ôì((€½¹ÍĞÑ½±•É¡¥Ù•€ô…Íå¹Œ€ ¤èAÉ½µ¥Í”ñÙ½¥ø€ôøì(€€€¥˜€ …Í•±•Ñ•ñğÉ•…‘=¹±äñğÁ•¹‘¥¹œñğ€…½¹™¥Éµ¥Í…É‘U¹Í…Ù• Ÿ–"š6‹–öKš†*ßšœ¤¤É•ÑÕÉ¸ì(€€€Í•ÑA•¹‘¥¹œ ÍÑ…ÑÕÌœ¤ì(€€€½¹ÍĞ½ÕÑ½µ”€ô…İ…¥Ğ‰É¥‘”¹É•Í•…É ¹Í•Ñ9½Ñ•MÑ…ÑÕÌ (€€€€€ì(€€€€€€€ÁÉ½©•Ñ%°(€€€€€€€¹½Ñ•%èÍ•±•Ñ•¹¥°(€€€€€€€•áÁ•Ñ•‘UÁ‘…Ñ•‘ĞèÍ•±•Ñ•¹ÕÁ‘…Ñ•‘Ğ°(€€€€€€€ÍÑ…ÑÕÌèÍ•±•Ñ•¹ÍÑ…ÑÕÌ€ôôô€…Ñ¥Ù”œ€ü€…É¡¥Ù•œ€è€…Ñ¥Ù”œ°(€€€€€ô°(€€€€€ìµ½‘”è€É•©•Ğœ°É•ÅÕ•ÍÑ-•äèÉ•Í•…É ¹ÍÑ…ÑÕÌè‘íÍ•±•Ñ•¹¥‘õ€ô°(€€€€¤ì(€€€Í•ÑA•¹‘¥¹œ¡¹Õ±°¤ì(€€€¥˜€¡½ÕÑ½µ”¹ÍÑ…Ñ”€ôôô€ÍÕ•ÍÌœ¤ì(€€€€€…ÁÁ±å…Ñ…±½œ¡½ÕÑ½µ”¹‘…Ñ„°Í•±•Ñ•¹¥¤ì(€€€€€Í•Ñ9½Ñ¥”¡Í•±•Ñ•¹ÍÑ…ÑÕÌ€ôôô€…Ñ¥Ù”œ€ü€Ÿ‚S¦Û²S¢ºÃ–ŞË–öKš†œ€è€Ÿ‚S¦Û²S¢ºÃ–ŞËš
/–’7œ¤ì(€€€ô•±Í”¥˜€¡½ÕÑ½µ”¹ÍÑ…Ñ”€ôôô€™…¥±ÕÉ”œ¤ì(€€€€€Í•Ñ9½Ñ¥”¡ƒ*ÛššnÓšZÃ–’Ç¢Ò—¾òh‘í…ÕÑ¡½ÉÉÉ½ÉMÕµµ…Éä¡½ÕÑ½µ”¹•ÉÉ½È¥õ€¤ì(€€€ô(€ôì((€½¹ÍĞ‘•±•Ñ•9½Ñ”€ô…Íå¹Œ€ ¤èAÉ½µ¥Í”ñÙ½¥ø€ôøì(€€€¥˜€ …Í•±•Ñ•ñğÉ•…‘=¹±äñğÁ•¹‘¥¹œñğ€…½¹™¥Éµ¥Í…É‘U¹Í…Ù• Ÿ–"ƒ¦f“²S¢ºÀœ¤¤É•ÑÕÉ¸ì(€€€Í•ÑA•¹‘¥¹œ ‘•±•Ñ”µ¹½Ñ”œ¤ì(€€€½¹ÍĞ½ÕÑ½µ”€ô…İ…¥Ğ‰É¥‘”¹É•Í•…É ¹‘•±•Ñ•9½Ñ” (€€€€€ì(€€€€€€€ÁÉ½©•Ñ%°(€€€€€€€¹½Ñ•%èÍ•±•Ñ•¹¥°(€€€€€€€•áÁ•Ñ•‘UÁ‘…Ñ•‘ĞèÍ•±•Ñ•¹ÕÁ‘…Ñ•‘Ğ°(€€€€€ô°(€€€€€ìµ½‘”è€É•©•Ğœ°É•ÅÕ•ÍÑ-•äèÉ•Í•…É ¹‘•±•Ñ•9½Ñ”è‘íÍ•±•Ñ•¹¥‘õ€ô°(€€€€¤ì(€€€Í•ÑA•¹‘¥¹œ¡¹Õ±°¤ì(€€€¥˜€¡½ÕÑ½µ”¹ÍÑ…Ñ”€ôôô€ÍÕ•ÍÌœ¤ì(€€€€€É•µ½Ù•I•Í•…É¡I•™•É•¹•M•±•Ñ¥½¸¡ÁÉ½©•Ñ%°ìÍ½ÕÉ•QåÁ”è€¹½Ñ”œ°Í½ÕÉ•%èÍ•±•Ñ•¹¥ô¤ì(€€€€€Í•ÑM•±•Ñ•‘I•™•É•¹•%‘Ì¡Í•±•Ñ•‘I•™•É•¹•-•åÌ¡ÁÉ½©•Ñ%¤¤ì(€€€€€…ÁÁ±å…Ñ…±½œ¡½ÕÑ½µ”¹‘…Ñ„¤ì(€€€€€Í•Ñ9½Ñ¥” Ÿ‚òk¦Û²S¢ºÃ–ŞË–"ƒ¦f“¾òo–>_º‡¦f’îÛ’şwVg’âë.³®/¢ÆšZgœ¤ì(€€€ô•±Í”¥˜€¡½ÕÑ½µ”¹ÍÑ…Ñ”€ôôô€™…¥±ÕÉ”œ¤ì(€€€€€Í•Ñ9½Ñ¥”¡ƒ–"ƒ¦f“–’Ç¢Ò—¾òh‘í…ÕÑ¡½ÉÉÉ½ÉMÕµµ…Éä¡½ÕÑ½µ”¹•ÉÉ½È¥õ€¤ì(€€€ô(€ôì((€½¹ÍĞ¥µÁ½ÉÑÑÑ…¡µ•¹Ğ€ô…Íå¹Œ€ ¤èAÉ½µ¥Í”ñÙ½¥ø€ôøì(€€€¥˜€ …Í•±•Ñ•ñğÉ•…‘=¹±äñğÁ•¹‘¥¹œ¤É•ÑÕÉ¸ì(€€€Í•ÑA•¹‘¥¹œ …ÑÑ…¡µ•¹Ğœ¤ì(€€€½¹ÍĞ½ÕÑ½µ”€ô…İ…¥Ğ‰É¥‘”¹É•Í•…É ¹¥µÁ½ÉÑÑÑ…¡µ•¹Ğ (€€€€€ìÁÉ½©•Ñ%°¹½Ñ•%èÍ•±•Ñ•¹¥ô°(€€€€€ìµ½‘”è€É•©•Ğœ°É•ÅÕ•ÍÑ-•äèÉ•Í•…É ¹…ÑÑ…¡µ•¹Ğè‘íÍ•±•Ñ•¹¥‘õ€ô°(€€€€€¤ì(€€€Í•ÑA•¹‘¥¹œ¡¹Õ±°¤ì(€€€¥˜€¡½ÕÑ½µ”¹ÍÑ…Ñ”€ôôô€ÍÕ•ÍÌœ¤ì(€€€€€…ÁÁ±å…Ñ…±½œ¡½ÕÑ½µ”¹‘…Ñ„°Í•±•Ñ•¹¥¤ì(€€€€€Í•Ñ9½Ñ¥” Ÿ¦f’îÛ–ŞË–’7–"Û–"Ã–öO–&7’ös–Nj–>_º‹ÖšZon»–öWœ¤ì(€€€ô•±Í”¥˜€¡½ÕÑ½µ”¹ÍÑ…Ñ”€ôôô€™…¥±ÕÉ”œ¤ì(€€€€€Í•Ñ9½Ñ¥” (€€€€€€€½ÕÑ½µ”¹•ÉÉ½È¹½‘”€ôôô€=55=9}911|ÀÀĞœ(€€€€€€€€€€ü€Ÿ–ŞË–>[šÚ#¦'š.§¦f’îÛœ(€€€€€€€€€€èƒ¦f’îÛ–¾ó–—–’Ç¢Ò—¾òh‘í…ÕÑ¡½ÉÉÉ½ÉMÕµµ…Éä¡½ÕÑ½µ”¹•ÉÉ½È¥õ€°(€€€€€€¤ì(€€€ô(€ôì((€½¹ÍĞÁÉ•Ù¥•İÑÑ…¡µ•¹Ğ€ô…Íå¹Œ€¡…ÑÑ…¡µ•¹Ñ%èÍÑÉ¥¹œ¤èAÉ½µ¥Í”ñÙ½¥ø€ôøì(€€€¥˜€¡Á•¹‘¥¹œ¤É•ÑÕÉ¸ì(€€€Í•ÑA•¹‘¥¹œ¡ÁÉ•Ù¥•Üè‘í…ÑÑ…¡µ•¹Ñ%‘õ€¤ì(€€€½¹ÍĞ½ÕÑ½µ”€ô…İ…¥Ğ‰É¥‘”¹É•Í•…É ¹ÁÉ•Ù¥•İÑÑ…¡µ•¹Ğ (€€€€€ìÁÉ½©•Ñ%°…ÑÑ…¡µ•¹Ñ%ô°(€€€€€ìµ½‘”è€É•Á±…”œ°±…¹•-•äèÉ•Í•…É ¹ÁÉ•Ù¥•Üè‘íÁÉ½©•Ñ%‘õ€ô°(€€€€¤ì(€€€Í•ÑA•¹‘¥¹œ¡¹Õ±°¤ì(€€€¥˜€¡½ÕÑ½µ”¹ÍÑ…Ñ”€ôôô€ÍÕ•ÍÌœ¤ì(€€€€€Í•ÑAÉ•Ù¥•Ü¡½ÕÑ½µ”¹‘…Ñ„¤ì(€€€€€Í•Ñ9½Ñ¥”¡½ÕÑ½µ”¹‘…Ñ„¹ÑÉÕ¹…Ñ•€ü€Ÿ¦Š¢š–ŞËš2'¦f@€ÈÔØ-¥ƒ–º'–£’â+¦fCš"«šZ’â?œ€è€Ÿ¦f’îÛ¦Š¢#–ŞËš‚‡šª3¾ò3
çœ¤ì(€€€ô•±Í”¥˜€¡½ÕÑ½µ”¹ÍÑ…Ñ”€ôôô€™…¥±ÕÉ”œ¤ì(€€€€€Í•ÑAÉ•Ù¥•Ü¡¹Õ±°¤ì(€€€€€Í•Ñ9½Ñ¥”¡¦Š¢š–’Ç¢Ò—¾òh‘í…ÕÑ¡½ÉÉÉ½ÉMÕµµ…Éä¡½ÕÑ½µ”¹•ÉÉ½È¥õ€¤ì(€€€ô(€ôì((€½¹ÍĞ‘•±•Ñ•ÑÑ…¡µ•¹Ğ€ô…Íå¹Œ€¡…ÑÑ…¡µ•¹Ñ%èÍÑÉ¥¹œ¤èAÉ½µ¥Í”ñÙ½¥ø€ôøì(€€€¥˜€¡É•…‘=¹±äñğÁ•¹‘¥¹œ¤É•ÑÕÉ¸ì(€€€Í•ÑA•¹‘¥¹œ¡‘•±•Ñ”è‘í…ÑÑ…¡µ•¹Ñ%‘õ€¤ì(€€€½¹ÍĞ½ÕÑ½µ”€ô…İ…¥Ğ‰É¥‘”¹É•Í•…É ¹‘•±•Ñ•ÑÑ…¡µ•¹Ğ (€€€€€ìÁÉ½©•Ñ%°…ÑÑ…¡µ•¹Ñ%ô°(€€€€€ì(€€€€€€€µ½‘”è€É•©•Ğœ°(€€€€€€€É•ÅÕ•ÍÑ-•äèÉ•Í•…É ¹‘•±•Ñ•ÑÑ…¡µ•¹Ğè‘í…ÑÑ…¡µ•¹Ñ%‘õ€°(€€€€€ô°(€€€€¤ì(€€€Í•ÑA•¹‘¥¹œ¡¹Õ±°¤ì(€€€¥˜€¡½ÕÑ½µ”¹ÍÑ…Ñ”€ôôô€ÍÕ•ÍÌœ¤ì(€€€€€…ÁÁ±å…Ñ…±½œ¡½ÕÑ½µ”¹‘…Ñ„°Í•±•Ñ•ü¹¥¤ì(€€€€€É•µ½Ù•I•Í•…É¡I•™•É•¹•M•±•Ñ¥½¸¡ÁÉ½©•Ñ%°ì(€€€€€€€Í½ÕÉ•QåÁ”è€…ÑÑ…¡µ•¹Ğœ°(€€€€€€€Í½ÕÉ•%è…ÑÑ…¡µ•¹Ñ%°(€€€€€ô¤ì(€€€€€¥˜€¡ÁÉ•Ù¥•Üü¹…ÑÑ…¡µ•¹Ñ%€ôôô…ÑÑ…¡µ•¹Ñ%¤Í•ÑAÉ•Ù¥•Ü¡¹Õ±°¤ì(€€€€€Í•ÑM•±•Ñ•‘I•™•É•¹•%‘Ì¡Í•±•Ñ•‘I•™•É•¹•-•åÌ¡ÁÉ½©•Ñ%¤¤ì(€€€€€Í•Ñ9½Ñ¥” Ÿ¦f’îÛ–ŞË’î;’ös–N¢ÖšZg–êOï¦f“œ¤ì(€€€ô•±Í”¥˜€¡½ÕÑ½µ”¹ÍÑ…Ñ”€ôôô€™…¥±ÕÉ”œ¤ì(€€€€€Í•Ñ9½Ñ¥”¡ƒ¦f’îÛ–"ƒ¦f“–’Ç¢Ò—¾òh‘í…ÕÑ¡½ÉÉÉ½ÉMÕµµ…Éä¡½ÕÑ½µ”¹•ÉÉ½È¥õ€¤ì(€€€ô(€ôì((€½¹ÍĞ…‘‘1¥¹¬€ô…Íå¹Œ€ ¤èAÉ½µ¥Í”ñÙ½¥ø€ôøì(€€€¥˜€ …Í•±•Ñ•ñğÉ•…‘=¹±äñğÁ•¹‘¥¹œñğ€…Ñ…É•Ñ%¹ÑÉ¥´ ¤¤É•ÑÕÉ¸ì(€€€Í•ÑA•¹‘¥¹œ ±¥¹¬œ¤ì(€€€½¹ÍĞ½ÕÑ½µ”€ô…İ…¥Ğ‰É¥‘”¹É•Í•…É ¹…‘‘1¥¹¬ (€€€€€ì(€€€€€€€ÁÉ½©•Ñ%°(€€€€€€€Í½ÕÉ•QåÁ”è€¹½Ñ”œ°(€€€€€€€Í½ÕÉ•%èÍ•±•Ñ•¹¥°(€€€€€€€Ñ…É•ÑQåÁ”°(€€€€€€€Ñ…É•Ñ%èÑ…É•Ñ%¹ÑÉ¥´ ¤°(€€€€€ô°(€€€€€ì(€€€€€€€µ½‘”è€É•©•Ğœ°(€€€€€€€É•ÅÕ•ÍÑ-•äèÉ•Í•…É ¹±¥¹¬è‘íÍ•±•Ñ•¹¥‘ôè‘íÑ…É•ÑQåÁ•ôè‘íÑ…É•Ñ%¹ÑÉ¥´ ¥õ€°(€€€€€ô°(€€€€¤ì(€€€Í•ÑA•¹‘¥¹œ¡¹Õ±°¤ì(€€€¥˜€¡½ÕÑ½µ”¹ÍÑ…Ñ”€ôôô€ÍÕ•ÍÌœ¤ì(€€€€€…ÁÁ±å…Ñ…±½œ¡½ÕÑ½µ”¹‘…Ñ„°Í•±•Ñ•¹¥¤ì(€€€€€Í•ÑQ…É•Ñ% œœ¤ì(€€€€€Í•Ñ9½Ñ¥” Ÿ–Ï¢S–ŞË’şw–¶c¾òo‚S¦Û¢ÖšZg’î7’şwš2.³®/¾ò3’â7’òkšRç–gšv–¢¢ºû–ºkœ¤ì(€€€ô•±Í”¥˜€¡½ÕÑ½µ”¹ÍÑ…Ñ”€ôôô€™…¥±ÕÉ”œ¤ì(€€€€€Í•Ñ9½Ñ¥”¡–Ï¢S–’Ç¢Ò—¾òh‘í…ÕÑ¡½ÉÉÉ½ÉMÕµµ…Éä¡½ÕÑ½µ”¹•ÉÉ½È¥õ€¤ì(€€€ô(€ôì((€½¹ÍĞÉ•µ½Ù•1¥¹¬€ô…Íå¹Œ€¡±¥¹­%èÍÑÉ¥¹œ¤èAÉ½µ¥Í”ñÙ½¥ø€ôøì(€€€¥˜€¡É•…‘=¹±äñğÁ•¹‘¥¹œ¤É•ÑÕÉ¸ì(€€€Í•ÑA•¹‘¥¹œ¡Õ¹±¥¹¬è‘í±¥¹­%‘õ€¤ì(€€€½¹ÍĞ½ÕÑ½µ”€ô…İ…¥Ğ‰É¥‘”¹É•Í•…É ¹É•µ½Ù•1¥¹¬ (€€€€€ìÁÉ½©•Ñ%°±¥¹­%ô°(€€€€€ìµ½‘”è€É•©•Ğœ°É•ÅÕ•ÍÑ-•äèÉ•Í•…É ¹Õ¹±¥¹¬è‘í±¥¹­%‘õ€ô°(€€€€¤ì(€€€Í•ÑA•¹‘¥¹œ¡¹Õ±°¤ì(€€€¥˜€¡½ÕÑ½µ”¹ÍÑ…Ñ”€ôôô€ÍÕ•ÍÌœ¤…ÁÁ±å…Ñ…±½œ¡½ÕÑ½µ”¹‘…Ñ„°Í•±•Ñ•ü¹¥¤ì(€€€•±Í”¥˜€¡½ÕÑ½µ”¹ÍÑ…Ñ”€ôôô€™…¥±ÕÉ”œ¤ì(€€€€€Í•Ñ9½Ñ¥”¡ƒï¦f“–Ï¢S–’Ç¢Ò—¾òh‘í…ÕÑ¡½ÉÉÉ½ÉMÕµµ…Éä¡½ÕÑ½µ”¹•ÉÉ½È¥õ€¤ì(€€€ô(€ôì((€½¹ÍĞÑ½±•I•™•É•¹”€ô€¡É•™•É•¹”èI•Í•…É¡I•™•É•¹”¤èÙ½¥€ôøì(€€€½¹ÍĞ­•ä€ôÉ•Í•…É¡I•™•É•¹•-•ä¡É•™•É•¹”¤ì(€€€½¹ÍĞ¹•áĞ€ôÍ•ÑI•Í•…É¡I•™•É•¹•M•±•Ñ•¡ÁÉ½©•Ñ%°É•™•É•¹”°€…Í•±•Ñ•‘I•™•É•¹•%‘Ì¹¡…Ì¡­•ä¤¤ì(€€€Í•ÑM•±•Ñ•‘I•™•É•¹•%‘Ì¡¹•ÜM•Ğ¡¹•áĞ¹µ…À¡É•Í•…É¡I•™•É•¹•-•ä¤¤ì(€ôì((€É•ÑÕÉ¸€ (€€€€ñµ…¥¸±…ÍÍ9…µ”ô‰İ½É­ÍÁ…”µÁ…”É•Í•…É µİ½É­‰•¹ ˆ‘…Ñ„µÑ•ÍÑ¥ô‰É•Í•…É µİ½É­‰•¹ ˆø(€€€€€íÉ•ÑÕÉ¹1½…Ñ¥½¸€˜˜½¹I•ÑÕÉ¸€ü€ (€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰™•…ÑÕÉ”µ…É¹…Ù¥…Ñ¥½¸µÉ•ÑÕÉ¸ˆ‘…Ñ„µ¹…Ù¥…Ñ¥½¸µÉ•ÑÕÉ¸É½±”ô‰ÍÑ…ÑÕÌˆø(€€€€€€€€€€ñÍÁ…¸û–ŞË’î;šv—šêO¦†×¦v‹š&O–ò‚S¦Û¢ÖšZgğ½ÍÁ…¸ø(€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€½¹±¥¬õì ¤€ôøì(€€€€€€€€€€€€€¥˜€¡½¹™¥Éµ¥Í…É‘U¹Í…Ù• Ÿ¢şS–n{šv—šêC¦†×¦vˆœ¤¤½¹I•ÑÕÉ¸ ¤ì(€€€€€€€€€€€õô(€€€€€€€€€€ø(€€€€€€€€€€€ƒ¢şS–n{šv—šêO¦†×¦vˆ(€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€ğ½Í•Ñ¥½¸ø(€€€€€€¤€è¹Õ±±ô(€€€€€€ñ¡•…‘•È±…ÍÍ9…µ”ô‰İ½É­ÍÁ…”µÁ…•}}¡•…‘•Èˆø(€€€€€€€€ñ‘¥Øø(€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰•å•‰É½Üˆûš¶—¢Z×‚S¦Û¢ÖšZdğ½Àø(€€€€€€€€€€ñ Äû‚S¦Û¢ÖšZg¾ò3–Æ¦£’òƒš&dğ½ Äø(€€€€€€€€€€ñÀû²S¢ºÃ’â;¦f’îÛ–>«’ös’âë’ös¢¢ÖšZg¾òo–>«šr'’öƒšb;†»–.û¦'–B;¾ò3š&7–¢ºã–—–—’âš²‡šfë¢÷’š"C¢¾ßšÆğ½Àø(€€€€€€€€ğ½‘¥Øø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰‰ÕÑÑ½¸µÉ½Üˆø(€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€±…ÍÍ9…µ”ô‰‰ÕÑÑ½¸Í•½¹‘…Éäˆ(€€€€€€€€€€€½¹±¥¬õì ¤€ôøì(€€€€€€€€€€€€€¥˜€¡½¹™¥Éµ¥Í…É‘U¹Í…Ù• Ÿ’ï–ò‚S¦Û¢ÖšZgr’’öä6Æ÷6R‚“°¢×Ğ¢à¢‹ùNY¹îi›®KÙÀ¢Âö'WGFöãà¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢6Æ74æÖSÒ&'WGFöâ&–Ö'’ ¢F—6&ÆVC×·&VDöæÇ’ÇÂVæF–ærÓÒçVÆÂÇÂ6FÆörÓÓÒçVÆÇĞ¢öä6Æ–6³×²‚’Óâfö–B7&VFTæ÷FR‚—Ğ¢à¢ik[»®zÉNŠë ¢Âö'WGFöãà¢ÂöF—cà¢Âö†VFW#à ¢Ç6Æ74æÖSÒ'7FGW2ÖÆ–æR"&öÆSÒ'7FGW2#à¢·&VDöæÇ’òXú®Šû¾KÙÎY8+rG¶æ÷F–6WÖ¢F—'G’òz-‰Ç§¢Øœ{úlyËb¢w%jËjg