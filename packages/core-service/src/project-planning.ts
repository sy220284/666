import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  LifecycleStatusSchema,
  PlotNodeCreateInputSchema,
  PlotNodeDeleteInputSchema,
  PlotNodeListSchema,
  PlotNodeMoveInputSchema,
  PlotNodeSchema,
  PlotNodeUpdateInputSchema,
  ProjectBriefRulesSchema,
  ProjectBriefSchema,
  ProjectBriefUpdateInputSchema,
  ProjectIdSchema,
  type PlotNode,
  type PlotNodeCreateInput,
  type PlotNodeDeleteInput,
  type PlotNodeList,
  type PlotNodeMoveInput,
  type PlotNodeUpdateInput,
  type ProjectBrief,
  type ProjectBriefUpdateInput,
} from '@worldforge/contracts';
import {
  SQLITE_INTEGER_MAX,
  SQLITE_INTEGER_MIN,
  planOrderKey,
  type OrderedSibling,
  type OrderPlacement,
} from '@worldforge/domain';

import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export type ProjectPlanningErrorCode =
  'PLANNING_NOT_FOUND' | 'PLANNING_CONFLICT' | 'PLANNING_INVALID_POSITION' | 'PLANNING_INVARIANT';

export class ProjectPlanningError extends Error {
  readonly code: ProjectPlanningErrorCode;

  constructor(code: ProjectPlanningErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProjectPlanningError';
    this.code = code;
  }
}

export interface ProjectPlanningServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
  readonly faultInjector?: (
    stage: 'after-brief-upsert' | 'after-node-write' | 'after-node-move' | 'after-node-delete',
  ) => void;
}

interface BriefRow {
  readonly id: string;
  readonly projectId: string;
  readonly concept: string;
  readonly readingPromise: string;
  readonly protagonistGoal: string;
  readonly coreConflict: string;
  readonly endingIntent: string;
  readonly requiredJson: string;
  readonly forbiddenJson: string;
  readonly updatedAt: string;
}

interface PlotNodeRow {
  readonly id: string;
  readonly projectId: string;
  readonly parentId: string | null;
  readonly nodeType: string;
  readonly title: string;
  readonly goal: string;
  readonly coreConflict: string;
  readonly expectedResult: string;
  readonly orderKey: number | bigint;
  readonly status: string;
}

function text(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ProjectPlanningError('PLANNING_INVARIANT', 'Persisted planning text is invalid.');
  }
  return value;
}

function integer(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new ProjectPlanningError('PLANNING_INVARIANT', 'Persisted planning order is invalid.');
}

function rules(raw: string): string[] {
  try {
    return ProjectBriefRulesSchema.parse(JSON.parse(raw));
  } catch (error) {
    throw new ProjectPlanningError(
      'PLANNING_INVARIANT',
      'Persisted ProjectBrief rules are invalid.',
      {
        cause: error,
      },
    );
  }
}

function assertProject(connection: DatabaseSync, projectId: string): void {
  if (!connection.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) {
    throw new ProjectPlanningError('PLANNING_NOT_FOUND', 'The project was not found.');
  }
}

function emptyBrief(projectId: string): ProjectBrief {
  return ProjectBriefSchema.parse({
    id: null,
    projectId,
    concept: '',
    readingPromise: '',
    protagonistGoal: '',
    coreConflict: '',
    endingIntent: '',
    required: [],
    forbidden: [],
    updatedAt: null,
  });
}

function readBrief(connection: DatabaseSync, projectId: string): ProjectBrief {
  assertProject(connection, projectId);
  const row = connection
    .prepare(
      `SELECT id, project_id AS projectId, concept, reading_promise AS readingPromise,
              protagonist_goal AS protagonistGoal, core_conflict AS coreConflict,
              ending_intent AS endingIntent, required_json AS requiredJson,
              forbidden_json AS forbiddenJson, updated_at AS updatedAt
         FROM project_briefs WHERE project_id = ?`,
    )
    .get(projectId) as BriefRow | undefined;
  if (!row) return emptyBrief(projectId);
  return ProjectBriefSchema.parse({
    id: text(row.id),
    projectId: text(row.projectId),
    concept: text(row.concept),
    readingPromise: text(row.readingPromise),
    protagonistGoal: text(row.protagonistGoal),
    coreConflict: text(row.coreConflict),
    endingIntent: text(row.endingIntent),
    required: rules(text(row.requiredJson)),
    forbidden: rules(text(row.forbiddenJson)),
    updatedAt: text(row.updatedAt),
  });
}

function readPlotNodes(connection: DatabaseSync, projectId: string): PlotNodeList {
  assertProject(connection, projectId);
  const rows = connection
    .prepare(
      `SELECT id, project_id AS projectId, parent_id AS parentId, node_type AS nodeType,
              title, goal, core_conflict AS coreConflict, expected_result AS expectedResult,
              order_key AS orderKey, status
         FROM plot_nodes
        WHERE project_id = ?
        ORDER BY parent_id IS NOT NULL, parent_id, order_key, id`,
    )
    .all(projectId) as unknown as PlotNodeRow[];
  return PlotNodeListSchema.parse({
    projectId,
    nodes: rows.map((row) =>
      PlotNodeSchema.parse({
        id: text(row.id),
        projectId: text(row.projectId),
        parentId: row.parentId === null ? null : text(row.parentId),
        nodeType: text(row.nodeType),
        title: text(row.title),
        goal: text(row.goal),
        coreConflict: text(row.coreConflict),
        expectedResult: text(row.expectedResult),
        orderKey: integer(row.orderKey).toString(),
        status: LifecycleStatusSchema.parse(text(row.status)),
      }),
    ),
  });
}

function nodeRow(connection: DatabaseSync, projectId: string, nodeId: string): PlotNodeRow {
  const row = connection
    .prepare(
      `SELECT id, project_id AS projectId, parent_id AS parentId, node_type AS nodeType,
              title, goal, core_conflict AS coreConflict, expected_result AS expectedResult,
              order_key AS orderKey, status
         FROM plot_nodes WHERE id = ? AND project_id = ?`,
    )
    .get(nodeId, projectId) as PlotNodeRow | undefined;
  if (!row) throw new ProjectPlanningError('PLANNING_NOT_FOUND', 'The PlotNode was not found.');
  return row;
}

function assertParent(connection: DatabaseSync, projectId: string, parentId: string | null): void {
  if (parentId === null) return;
  nodeRow(connection, projectId, parentId);
}

function orderedSiblings(
  connection: DatabaseSync,
  projectId: string,
  parentId: string | null,
  excludedId?: string,
): OrderedSibling[] {
  return (
    connection
      .prepare(
        `SELECT id, order_key AS orderKey
           FROM plot_nodes
          WHERE project_id = ?
            AND ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)
            AND (? IS NULL OR id <> ?)
          ORDER BY order_key, id`,
      )
      .all(
        projectId,
        parentId,
        parentId,
        excludedId ?? null,
        excludedId ?? null,
      ) as unknown as Array<{
      readonly id: string;
      readonly orderKey: number | bigint;
    }>
  ).map((row) => ({ id: text(row.id), orderKey: integer(row.orderKey) }));
}

function orderPlan(siblings: readonly OrderedSibling[], placement: OrderPlacement) {
  try {
    return planOrderKey(siblings, placement);
  } catch (error) {
    throw new ProjectPlanningError(
      'PLANNING_INVALID_POSITION',
      'The requested PlotNode position is not available.',
      { cause: error },
    );
  }
}

function temporaryOrderKeys(
  connection: DatabaseSync,
  projectId: string,
  parentId: string | null,
  count: number,
): bigint[] {
  if (count === 0) return [];
  const range = connection
    .prepare(
      `SELECT MIN(order_key) AS minimum, MAX(order_key) AS maximum
         FROM plot_nodes
        WHERE project_id = ?
          AND ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)`,
    )
    .get(projectId, parentId, parentId) as
    | { readonly minimum: number | bigint | null; readonly maximum: number | bigint | null }
    | undefined;
  const minimum =
    range?.minimum === null || range?.minimum === undefined ? 0n : integer(range.minimum);
  const maximum =
    range?.maximum === null || range?.maximum === undefined ? 0n : integer(range.maximum);
  const required = BigInt(count);
  if (minimum - required >= SQLITE_INTEGER_MIN) {
    return Array.from({ length: count }, (_, index) => minimum - BigInt(index + 1));
  }
  if (maximum + required <= SQLITE_INTEGER_MAX) {
    return Array.from({ length: count }, (_, index) => maximum + BigInt(index + 1));
  }
  throw new ProjectPlanningError(
    'PLANNING_INVARIANT',
    'PlotNode order keys cannot reserve a temporary rebalance range.',
  );
}

function applyRebalance(
  connection: DatabaseSync,
  projectId: string,
  parentId: string | null,
  updates: ReadonlyArray<OrderedSibling>,
): void {
  if (updates.length === 0) return;
  const update = connection.prepare(
    'UPDATE plot_nodes SET order_key = ? WHERE id = ? AND project_id = ?',
  );
  const temporary = temporaryOrderKeys(connection, projectId, parentId, updates.length);
  for (const [index, item] of updates.entries()) {
    const result = update.run(temporary[index]!, item.id, projectId);
    if (Number(result.changes) !== 1) {
      throw new ProjectPlanningError(
        'PLANNING_INVARIANT',
        'A PlotNode could not enter the temporary rebalance range.',
      );
    }
  }
  for (const item of updates) {
    const result = update.run(item.orderKey, item.id, projectId);
    if (Number(result.changes) !== 1) {
      throw new ProjectPlanningError('PLANNING_INVARIANT', 'A PlotNode could not be rebalanced.');
    }
  }
}

function assertUniqueTitle(
  connection: DatabaseSync,
  projectId: string,
  parentId: string | null,
  title: string,
  excludedId?: string,
): void {
  const found = connection
    .prepare(
      `SELECT 1 FROM plot_nodes
        WHERE project_id = ?
          AND ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)
          AND title = ?
          AND (? IS NULL OR id <> ?)
        LIMIT 1`,
    )
    .get(projectId, parentId, parentId, title, excludedId ?? null, excludedId ?? null);
  if (found) {
    throw new ProjectPlanningError(
      'PLANNING_CONFLICT',
      'A sibling PlotNode with the same title already exists.',
    );
  }
}

function assertNoCycle(
  connection: DatabaseSync,
  projectId: string,
  nodeId: string,
  targetParentId: string | null,
): void {
  if (targetParentId === null) return;
  if (targetParentId === nodeId) {
    throw new ProjectPlanningError('PLANNING_INVALID_POSITION', 'A PlotNode cannot parent itself.');
  }
  const descendant = connection
    .prepare(
      `WITH RECURSIVE descendants(id) AS (
         SELECT id FROM plot_nodes WHERE parent_id = ? AND project_id = ?
         UNION ALL
         SELECT child.id
           FROM plot_nodes child
           JOIN descendants parent ON child.parent_id = parent.id
          WHERE child.project_id = ?
       )
       SELECT 1 FROM descendants WHERE id = ? LIMIT 1`,
    )
    .get(nodeId, projectId, projectId, targetParentId);
  if (descendant) {
    throw new ProjectPlanningError(
      'PLANNING_INVALID_POSITION',
      'A PlotNode cannot move below one of its descendants.',
    );
  }
}

export class ProjectPlanningService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;
  readonly #faultInjector: ProjectPlanningServiceOptions['faultInjector'];

  constructor(workspace: ProjectWorkspaceService, options: ProjectPlanningServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#faultInjector = options.faultInjector;
  }

  getBrief(projectId: string): ProjectBrief {
    const validProjectId = ProjectIdSchema.parse(projectId);
    return this.#workspace.readProject(validProjectId, (connection) =>
      readBrief(connection, validProjectId),
    );
  }

  updateBrief(requestId: string, input: ProjectBriefUpdateInput): Promise<ProjectBrief> {
    const valid = ProjectBriefUpdateInputSchema.parse(input);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      assertProject(connection, valid.projectId);
      const current = connection
        .prepare('SELECT id FROM project_briefs WHERE project_id = ?')
        .get(valid.projectId) as { readonly id: string } | undefined;
      const id = current?.id ?? this.#idFactory();
      const timestamp = this.#clock.now().toISOString();
      connection
        .prepare(
          `INSERT INTO project_briefs(
             id, project_id, concept, reading_promise, protagonist_goal, core_conflict,
             ending_intent, required_json, forbidden_json, updated_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(project_id) DO UPDATE SET
             concept = excluded.concept,
             reading_promise = excluded.reading_promise,
             protagonist_goal = excluded.protagonist_goal,
             core_conflict = excluded.core_conflict,
             ending_intent = excluded.ending_intent,
             required_json = excluded.required_json,
             forbidden_json = excluded.forbidden_json,
             updated_at = excluded.updated_at`,
        )
        .run(
          id,
          valid.projectId,
          valid.concept,
          valid.readingPromise,
          valid.protagonistGoal,
          valid.coreConflict,
          valid.endingIntent,
          JSON.stringify(valid.required),
          JSON.stringify(valid.forbidden),
          timestamp,
        );
      this.#faultInjector?.('after-brief-upsert');
      return readBrief(connection, valid.projectId);
    });
  }

  listPlotNodes(projectId: string): PlotNodeList {
    const validProjectId = ProjectIdSchema.parse(projectId);
    return this.#workspace.readProject(validProjectId, (connection) =>
      readPlotNodes(connection, validProjectId),
    );
  }

  createPlotNode(requestId: string, input: PlotNodeCreateInput): Promise<PlotNodeList> {
    const valid = PlotNodeCreateInputSchema.parse(input);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      assertProject(connection, valid.projectId);
      assertParent(connection, valid.projectId, valid.parentId);
      assertUniqueTitle(connection, valid.projectId, valid.parentId, valid.title);
      const plan = orderPlan(
        orderedSiblings(connection, valid.projectId, valid.parentId),
        valid.placement ?? { kind: 'end' },
      );
      applyRebalance(connection, valid.projectId, valid.parentId, plan.rebalanced);
      connection
        .prepare(
          `INSERT INTO plot_nodes(
             id, project_id, parent_id, node_type, title, goal, core_conflict,
             expected_result, order_key, status
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          this.#idFactory(),
          valid.projectId,
          valid.parentId,
          valid.nodeType,
          valid.title,
          valid.goal,
          valid.coreConflict,
          valid.expectedResult,
          plan.orderKey,
          valid.status,
        );
      this.#faultInjector?.('after-node-write');
      return readPlotNodes(connection, valid.projectId);
    });
  }

  updatePlotNode(requestId: string, input: PlotNodeUpdateInput): Promise<PlotNodeList> {
    const valid = PlotNodeUpdateInputSchema.parse(input);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const current = nodeRow(connection, valid.projectId, valid.nodeId);
      const title = valid.patch.title ?? text(current.title);
      assertUniqueTitle(connection, valid.projectId, current.parentId, title, valid.nodeId);
      connection
        .prepare(
          `UPDATE plot_nodes
              SET node_type = ?, title = ?, goal = ?, core_conflict = ?,
                  expected_result = ?, status = ?
            WHERE id = ? AND project_id = ?`,
        )
        .run(
          valid.patch.nodeType ?? text(current.nodeType),
          title,
          valid.patch.goal ?? text(current.goal),
          valid.patch.coreConflict ?? text(current.coreConflict),
          valid.patch.expectedResult ?? text(current.expectedResult),
          valid.patch.status ?? LifecycleStatusSchema.parse(text(current.status)),
          valid.nodeId,
          valid.projectId,
        );
      this.#faultInjector?.('after-node-write');
      return readPlotNodes(connection, valid.projectId);
    });
  }

  movePlotNode(requestId: string, input: PlotNodeMoveInput): Promise<PlotNodeList> {
    const valid = PlotNodeMoveInputSchema.parse(input);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const current = nodeRow(connection, valid.projectId, valid.nodeId);
      assertParent(connection, valid.projectId, valid.targetParentId);
      assertNoCycle(connection, valid.projectId, valid.nodeId, valid.targetParentId);
      assertUniqueTitle(
        connection,
        valid.projectId,
        valid.targetParentId,
        text(current.title),
        valid.nodeId,
      );
      const plan = orderPlan(
        orderedSiblings(connection, valid.projectId, valid.targetParentId, valid.nodeId),
        valid.placement,
      );
      const [temporaryOrderKey] = temporaryOrderKeys(
        connection,
        valid.projectId,
        valid.targetParentId,
        1,
      );
      const staged = connection
        .prepare(
          'UPDATE plot_nodes SET parent_id = ?, order_key = ? WHERE id = ? AND project_id = ?',
        )
        .run(valid.targetParentId, temporaryOrderKey!, valid.nodeId, valid.projectId);
      if (Number(staged.changes) !== 1) {
        throw new ProjectPlanningError(
          'PLANNING_INVARIANT',
          'The moving PlotNode could not enter the temporary order range.',
        );
      }
      applyRebalance(connection, valid.projectId, valid.targetParentId, plan.rebalanced);
      const committed = connection
        .prepare('UPDATE plot_nodes SET order_key = ? WHERE id = ? AND project_id = ?')
        .run(plan.orderKey, valid.nodeId, valid.projectId);
      if (Number(committed.changes) !== 1) {
        throw new ProjectPlanningError(
          'PLANNING_INVARIANT',
          'The PlotNode move was not committed.',
        );
      }
      this.#faultInjector?.('after-node-move');
      return readPlotNodes(connection, valid.projectId);
    });
  }

  deletePlotNode(requestId: string, input: PlotNodeDeleteInput): Promise<PlotNodeList> {
    const valid = PlotNodeDeleteInputSchema.parse(input);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      nodeRow(connection, valid.projectId, valid.nodeId);
      connection
        .prepare('DELETE FROM plot_nodes WHERE id = ? AND project_id = ?')
        .run(valid.nodeId, valid.projectId);
      this.#faultInjector?.('after-node-delete');
      return readPlotNodes(connection, valid.projectId);
    });
  }
}
