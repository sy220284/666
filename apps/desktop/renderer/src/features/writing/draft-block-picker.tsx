import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export interface DraftBlockChoice {
  readonly logicalBlockId: string;
  readonly text: string;
  readonly locked: boolean;
}

interface PickerBaseRequest {
  readonly requestId: number;
  readonly title: string;
  readonly description: string;
  readonly blocks: readonly DraftBlockChoice[];
}

interface MultiplePickerRequest extends PickerBaseRequest {
  readonly kind: 'multiple';
  readonly initialIds: readonly string[];
  readonly allowEmpty: boolean;
  readonly disableLocked: boolean;
}

interface AnchorPickerRequest extends PickerBaseRequest {
  readonly kind: 'anchor';
  readonly initialId: string | null;
  readonly allowStart: boolean;
  readonly labelMode: 'after' | 'select';
}

type PickerRequest = MultiplePickerRequest | AnchorPickerRequest;

type PickerResult =
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'multiple'; readonly ids: readonly string[] }
  | { readonly kind: 'anchor'; readonly id: string | null };

export interface PickMultipleBlocksInput {
  readonly title: string;
  readonly description: string;
  readonly blocks: readonly DraftBlockChoice[];
  readonly initialIds?: readonly string[];
  readonly allowEmpty?: boolean;
  readonly disableLocked?: boolean;
}

export interface PickBlockAnchorInput {
  readonly title: string;
  readonly description: string;
  readonly blocks: readonly DraftBlockChoice[];
  readonly initialId?: string | null;
  readonly allowStart?: boolean;
  readonly labelMode?: 'after' | 'select';
}

export function useDraftBlockPicker(): {
  readonly pickMultipleBlocks: (input: PickMultipleBlocksInput) => Promise<string[] | null>;
  readonly pickBlockAnchor: (input: PickBlockAnchorInput) => Promise<string | null | undefined>;
  readonly picker: ReactNode;
} {
  const [request, setRequest] = useState<PickerRequest | null>(null);
  const resolver = useRef<((result: PickerResult) => void) | null>(null);
  const sequence = useRef(0);

  const cancelCurrent = useCallback((): void => {
    resolver.current?.({ kind: 'cancelled' });
    resolver.current = null;
    setRequest(null);
  }, []);

  useEffect(
    () => () => {
      resolver.current?.({ kind: 'cancelled' });
      resolver.current = null;
    },
    [],
  );

  const start = useCallback((nextRequest: PickerRequest): Promise<PickerResult> => {
    resolver.current?.({ kind: 'cancelled' });
    setRequest(nextRequest);
    return new Promise<PickerResult>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = useCallback((result: PickerResult): void => {
    const resolve = resolver.current;
    resolver.current = null;
    setRequest(null);
    resolve?.(result);
  }, []);

  const pickMultipleBlocks = useCallback(
    async (input: PickMultipleBlocksInput): Promise<string[] | null> => {
      sequence.current += 1;
      const result = await start({
        kind: 'multiple',
        requestId: sequence.current,
        title: input.title,
        description: input.description,
        blocks: input.blocks,
        initialIds: input.initialIds ?? [],
        allowEmpty: input.allowEmpty ?? false,
        disableLocked: input.disableLocked ?? false,
      });
      return result.kind === 'multiple' ? [...result.ids] : null;
    },
    [start],
  );

  const pickBlockAnchor = useCallback(
    async (input: PickBlockAnchorInput): Promise<string | null | undefined> => {
      sequence.current += 1;
      const result = await start({
        kind: 'anchor',
        requestId: sequence.current,
        title: input.title,
        description: input.description,
        blocks: input.blocks,
        initialId: input.initialId ?? null,
        allowStart: input.allowStart ?? false,
        labelMode: input.labelMode ?? 'after',
      });
      return result.kind === 'anchor' ? result.id : undefined;
    },
    [start],
  );

  return {
    pickMultipleBlocks,
    pickBlockAnchor,
    picker: request ? (
      <DraftBlockPickerDialog
        key={request.requestId}
        request={request}
        onCancel={cancelCurrent}
        onConfirm={finish}
      />
    ) : null,
  };
}

function DraftBlockPickerDialog({
  request,
  onCancel,
  onConfirm,
}: {
  readonly request: PickerRequest;
  readonly onCancel: () => void;
  readonly onConfirm: (result: PickerResult) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(request.kind === 'multiple' ? request.initialIds : []),
  );
  const [anchorId, setAnchorId] = useState<string | null>(
    request.kind === 'anchor' ? request.initialId : null,
  );
  const confirmDisabled =
    request.kind === 'multiple' && !request.allowEmpty && selectedIds.size === 0;

  return (
    <dialog className="react-dialog" data-draft-block-picker open>
      <div className="stacked-form">
        <header>
          <div>
            <h2>{request.title}</h2>
            <p>{request.description}</p>
          </div>
          <button type="button" onClick={onCancel}>
            取消
          </button>
        </header>
        <div className="candidate-choice-list" data-draft-block-picker-list>
          {request.kind === 'anchor' && request.allowStart ? (
            <label>
              <input
                checked={anchorId === null}
                name="draft-block-anchor"
                type="radio"
                onChange={() => setAnchorId(null)}
              />
              <span>
                <strong>章节开头</strong>
                <small>放在第一段正文之前</small>
              </span>
            </label>
          ) : null}
          {request.blocks.map((block, index) => {
            const excerpt = blockExcerpt(block.text);
            if (request.kind === 'multiple') {
              const disabled = request.disableLocked && block.locked;
              return (
                <label key={block.logicalBlockId} data-draft-block-choice={block.logicalBlockId}>
                  <input
                    checked={selectedIds.has(block.logicalBlockId)}
                    disabled={disabled}
                    type="checkbox"
                    onChange={(event) =>
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(block.logicalBlockId);
                        else next.delete(block.logicalBlockId);
                        return next;
                      })
                    }
                  />
                  <span>
                    <strong>
                      第 {index + 1} 段{block.locked ? ' · 已锁定' : ''}
                    </strong>
                    <small>{excerpt}</small>
                  </span>
                </label>
              );
            }
            return (
              <label key={block.logicalBlockId} data-draft-block-choice={block.logicalBlockId}>
                <input
                  checked={anchorId === block.logicalBlockId}
                  name="draft-block-anchor"
                  type="radio"
                  onChange={() => setAnchorId(block.logicalBlockId)}
                />
                <span>
                  <strong>
                    {request.labelMode === 'select'
                      ? `第 ${index + 1} 段`
                      : `第 ${index + 1} 段之后`}
                  </strong>
                  <small>{excerpt}</small>
                </span>
              </label>
            );
          })}
        </div>
        {request.blocks.length === 0 ? <p>当前没有可选择的正文段落。</p> : null}
        <div className="inline-actions">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button
            className="primary-button"
            data-confirm-draft-block-picker
            disabled={
              confirmDisabled || (request.kind === 'anchor' && !request.allowStart && !anchorId)
            }
            type="button"
            onClick={() =>
              request.kind === 'multiple'
                ? onConfirm({ kind: 'multiple', ids: [...selectedIds] })
                : onConfirm({ kind: 'anchor', id: anchorId })
            }
          >
            确认选择
          </button>
        </div>
      </div>
    </dialog>
  );
}

function blockExcerpt(text: string): string {
  const normalized = text.replaceAll(/\s+/gu, ' ').trim();
  if (!normalized) return '空段落';
  return normalized.length <= 120 ? normalized : `${normalized.slice(0, 120)}…`;
}
