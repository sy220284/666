import {
  type GenerationRunServiceContext,
  GenerationRunServiceError,
} from './run-repository.js';
import {
  type GenerationModelSupportInput,
  GenerationModelSupportInputSchema,
  type ModelSupportProfile,
  ModelSupportProfileSchema,
} from '@worldforge/contracts';

export function getModelSupport(
  context: GenerationRunServiceContext,
  raw: GenerationModelSupportInput,
): ModelSupportProfile {
  const input = GenerationModelSupportInputSchema.parse(raw);
  return context.workspace.readProject(input.projectId, (database) => {
    const row = database
      .prepare(
        `SELECT provider_id AS providerId, model, task_type AS taskType,
                  prompt_id AS promptId, prompt_version AS promptVersion,
                  status, evaluated_at AS evaluatedAt,
                  fixture_set_version AS fixtureSetVersion,
                  metrics_json AS metricsJson, limitations_json AS limitationsJson
             FROM model_support_profiles
            WHERE provider_id = ? AND model = ? AND task_type = ?
              AND prompt_id = ? AND prompt_version = ?`,
      )
      .get(input.providerId, input.model, input.taskType, input.promptId, input.promptVersion);
    if (!row) {
      return ModelSupportProfileSchema.parse({
        providerId: input.providerId,
        model: input.model,
        taskType: input.taskType,
        promptId: input.promptId,
        promptVersion: input.promptVersion,
        status: 'unverified',
        limitations: ['该Provider、模型、任务与Prompt版本组合尚未完成独立评测。'],
      });
    }
    try {
      return ModelSupportProfileSchema.parse({
        providerId: row.providerId,
        model: row.model,
        taskType: row.taskType,
        promptId: row.promptId,
        promptVersion: Number(row.promptVersion),
        status: row.status,
        evaluatedAt: row.evaluatedAt ?? undefined,
        fixtureSetVersion: row.fixtureSetVersion ?? undefined,
        metrics: row.metricsJson ? JSON.parse(String(row.metricsJson)) : undefined,
        limitations: JSON.parse(String(row.limitationsJson)),
      });
    } catch (error) {
      throw new GenerationRunServiceError(
        'GENERATION_MODEL_SUPPORT_INVALID',
        'The persisted ModelSupportProfile is invalid.',
        { cause: error },
      );
    }
  });
}

export function upsertModelSupport(
  context: GenerationRunServiceContext,
  requestId: string,
  projectId: string,
  raw: ModelSupportProfile,
): Promise<ModelSupportProfile> {
  const profile = ModelSupportProfileSchema.parse(raw);
  return context.workspace.writeProject(requestId, projectId, (database) => {
    const now = context.clock.now().toISOString();
    database
      .prepare(
        `INSERT INTO model_support_profiles(
             provider_id, model, task_type, prompt_id, prompt_version, status,
             evaluated_at, fixture_set_version, metrics_json, limitations_json,
             created_at, updated_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(provider_id, model, task_type, prompt_id, prompt_version)
           DO UPDATE SET
             status = excluded.status,
             evaluated_at = excluded.evaluated_at,
             fixture_set_version = excluded.fixture_set_version,
             metrics_json = excluded.metrics_json,
             limitations_json = excluded.limitations_json,
             updated_at = excluded.updated_at`,
      )
      .run(
        profile.providerId,
        profile.model,
        profile.taskType,
        profile.promptId,
        profile.promptVersion,
        profile.status,
        profile.evaluatedAt ?? null,
        profile.fixtureSetVersion ?? null,
        profile.metrics ? JSON.stringify(profile.metrics) : null,
        JSON.stringify(profile.limitations),
        now,
        now,
      );
    return profile;
  });
}
