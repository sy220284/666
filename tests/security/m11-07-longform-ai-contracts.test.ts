import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  AiTaskRouteResolveInputSchema,
  LongformAiSettingsSchema,
  LongformAiUpdateSettingsCommandSchema,
  StoryDigestRebuildInputSchema,
  TASK_PROTOCOL_VERSION,
} from '@worldforge/contracts';

describe('M11-07 long-form AI IPC security contracts', () => {
  it('requires author authority and rejects hidden settings fields', () => {
    const command = {
      protocolVersion: TASK_PROTOCOL_VERSION,
      requestId: randomUUID(),
      sentAt: '2026-08-13T09:30:00.000Z',
      command: 'longformAi.updateSettings',
      payload: {
        projectId: randomUUID(),
        authority: 'author',
        expectedUpdatedAt: null,
        settings: {
          schemaVersion: 1,
          activeStyleProfileId: null,
          styleProfiles: [],
          taskRoutes: [],
        },
      },
    };
    expect(LongformAiUpdateSettingsCommandSchema.parse(command)).toEqual(command);
    expect(() =>
      LongformAiUpdateSettingsCommandSchema.parse({
        ...command,
        payload: { ...command.payload, authority: 'ai' },
      }),
    ).toThrow();
    expect(() =>
      LongformAiUpdateSettingsCommandSchema.parse({
        ...command,
        payload: { ...command.payload, credential: 'must-never-cross-ipc' },
      }),
    ).toThrow();
  });

  it('keeps digest rebuild scopes and task-route candidates strict', () => {
    const projectId = randomUUID();
    expect(() =>
      StoryDigestRebuildInputSchema.parse({
        projectId,
        scopeType: 'vector-memory',
        scopeId: randomUUID(),
      }),
    ).toThrow();
    expect(() =>
      AiTaskRouteResolveInputSchema.parse({
        projectId,
        taskType: 'chapter',
        candidates: [
          {
            providerId: randomUUID(),
            model: 'model-a',
            credentialConfigured: true,
            apiKey: 'secret',
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects ambiguous profile and task routing settings', () => {
    const projectId = randomUUID();
    const profileId = randomUUID();
    const profile = {
      id: profileId,
      name: '正文文风',
      origin: 'manual' as const,
      instructions: ['保持动作清楚。'],
      sampleVersionIds: [],
      targetMetrics: null,
      sceneMappings: [],
    };
    const route = {
      taskType: 'chapter' as const,
      primaryProviderId: 'primary-model',
      fallbackProviderIds: ['fallback-model'],
      minimumSupport: 'verified' as const,
    };
    const baseSettings = {
      schemaVersion: 1 as const,
      activeStyleProfileId: profileId,
      styleProfiles: [profile],
      taskRoutes: [route],
    };
    const command = {
      protocolVersion: TASK_PROTOCOL_VERSION,
      requestId: randomUUID(),
      sentAt: '2026-08-13T09:30:00.000Z',
      command: 'longformAi.updateSettings' as const,
      payload: {
        projectId,
        authority: 'author' as const,
        expectedUpdatedAt: null,
        settings: baseSettings,
      },
    };

    expect(LongformAiUpdateSettingsCommandSchema.safeParse(command).success).toBe(true);
    expect(
      LongformAiUpdateSettingsCommandSchema.safeParse({
        ...command,
        payload: {
          ...command.payload,
          settings: { ...baseSettings, styleProfiles: [profile, profile] },
        },
      }).success,
    ).toBe(false);
    expect(
      LongformAiUpdateSettingsCommandSchema.safeParse({
        ...command,
        payload: {
          ...command.payload,
          settings: { ...baseSettings, activeStyleProfileId: randomUUID() },
        },
      }).success,
    ).toBe(false);
    expect(
      LongformAiUpdateSettingsCommandSchema.safeParse({
        ...command,
        payload: {
          ...command.payload,
          settings: { ...baseSettings, taskRoutes: [route, route] },
        },
      }).success,
    ).toBe(false);

    expect(
      LongformAiSettingsSchema.safeParse({
        ...baseSettings,
        updatedAt: null,
        styleProfiles: [profile, profile],
      }).success,
    ).toBe(false);
    expect(
      LongformAiSettingsSchema.safeParse({
        ...baseSettings,
        updatedAt: null,
        activeStyleProfileId: randomUUID(),
      }).success,
    ).toBe(false);
    expect(
      LongformAiSettingsSchema.safeParse({
        ...baseSettings,
        updatedAt: null,
        taskRoutes: [route, route],
      }).success,
    ).toBe(false);
    expect(
      LongformAiSettingsSchema.safeParse({
        ...baseSettings,
        updatedAt: null,
        taskRoutes: [{ ...route, fallbackProviderIds: ['fallback-model', 'fallback-model'] }],
      }).success,
    ).toBe(false);
    expect(
      LongformAiSettingsSchema.safeParse({
        ...baseSettings,
        updatedAt: null,
        taskRoutes: [{ ...route, fallbackProviderIds: ['primary-model'] }],
      }).success,
    ).toBe(false);
  });
});
