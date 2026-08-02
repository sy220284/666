import {
  CoreAppDataResultSchema,
  CoreControlMessageSchema,
  CoreGenerationResultSchema,
  CoreProjectResultSchema,
  CoreProviderResultSchema,
  PROTOCOL_VERSION,
  PROJECT_WORKSPACE_COMMANDS,
  type CoreEvent,
} from "@worldforge/contracts";

import type { TaskCommandRouter, TaskProtocol } from "./task-protocol.js";
import { executeAppDataOperation } from "./utility-app-data-router.js";
import { windowPreferencesError } from "./utility-errors.js";
import { executeGenerationOperation } from "./utility-generation-router.js";
import { executeProjectOperation } from "./utility-project-router.js";
import { executeProviderOperation } from "./utility-provider-router.js";
import {
  adaptTransferredPort,
  derivedRequestId,
  type UtilityParentMessage,
  type UtilityParentPort,
} from "./utility-runtime-context.js";
import type { UtilityServiceContainer } from "./utility-service-container.js";

export type UtilityControlRouterOptions = UtilityServiceContainer & {
  readonly parentPort: UtilityParentPort;
  readonly startedAt: number;
  readonly taskProtocol: TaskProtocol;
  readonly taskCommands: TaskCommandRouter;
};

export function createUtilityControlHandler(
  options: UtilityControlRouterOptions,
) {
  let shuttingDown = false;
  let acceptingAppDataOperations = true;
  const activeAppDataOperations = new Set<Promise<void>>();

  function send(message: CoreEvent): void {
    options.parentPort.postMessage(message);
  }

  function track(operation: Promise<void>): void {
    activeAppDataOperations.add(operation);
    void operation.finally(() => activeAppDataOperations.delete(operation));
  }

  return ({ data, ports }: UtilityParentMessage): void => {
    const parsed = CoreControlMessageSchema.safeParse(data);
    if (!parsed.success) return;

    switch (parsed.data.type) {
      case "core.ping":
        send({
          type: "core.health",
          protocolVersion: PROTOCOL_VERSION,
          requestId: parsed.data.requestId,
          status: "healthy",
          uptimeMs: Math.max(0, Date.now() - options.startedAt),
        });
        break;
      case "core.command":
        send({
          type: "core.command-result",
          protocolVersion: PROTOCOL_VERSION,
          requestId: parsed.data.requestId,
          result: options.taskCommands.execute(parsed.data.envelope),
        });
        break;
      case "core.attach-task-port": {
        const port = ports[0];
        if (!port || ports.length !== 1) return;
        options.taskProtocol.attachPort(
          adaptTransferredPort(port),
          parsed.data.connection.projectId,
        );
        break;
      }
      case "core.window-preferences.get":
        try {
          send({
            type: "core.window-preferences-result",
            protocolVersion: PROTOCOL_VERSION,
            requestId: parsed.data.requestId,
            result: {
              ok: true,
              preferences: options.appRuntime.windowPreferences.get(),
            },
          });
        } catch (error) {
          send({
            type: "core.window-preferences-result",
            protocolVersion: PROTOCOL_VERSION,
            requestId: parsed.data.requestId,
            result: { ok: false, errorCode: windowPreferencesError(error) },
          });
        }
        break;
      case "core.window-preferences.set": {
        const requestId = parsed.data.requestId;
        void options.appRuntime.windowPreferences
          .save(requestId, parsed.data.preferences)
          .then((preferences) => {
            send({
              type: "core.window-preferences-result",
              protocolVersion: PROTOCOL_VERSION,
              requestId,
              result: { ok: true, preferences },
            });
          })
          .catch((error: unknown) => {
            send({
              type: "core.window-preferences-result",
              protocolVersion: PROTOCOL_VERSION,
              requestId,
              result: { ok: false, errorCode: windowPreferencesError(error) },
            });
          });
        break;
      }
      case "core.app-data.command": {
        const requestId = parsed.data.requestId;
        const operation = parsed.data.operation;
        if (!acceptingAppDataOperations) {
          send({
            type: "core.app-data.result",
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result: CoreAppDataResultSchema.parse({
              ok: false,
              operation: operation.operation,
              errorCode: "COMMON_CANCELLED_004",
            }),
          });
          break;
        }
        track(
          executeAppDataOperation(
            options.appRuntime,
            requestId,
            operation,
          ).then((result) => {
            send({
              type: "core.app-data.result",
              protocolVersion: PROTOCOL_VERSION,
              requestId,
              result,
            });
          }),
        );
        break;
      }
      case "core.provider.command": {
        const requestId = parsed.data.requestId;
        const operation = parsed.data.operation;
        if (!acceptingAppDataOperations) {
          send({
            type: "core.provider.result",
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result: CoreProviderResultSchema.parse({
              ok: false,
              operation: operation.operation,
              errorCode: "COMMON_CANCELLED_004",
            }),
          });
          break;
        }
        track(
          executeProviderOperation(
            options.appRuntime,
            requestId,
            operation,
          ).then((result) => {
            send({
              type: "core.provider.result",
              protocolVersion: PROTOCOL_VERSION,
              requestId,
              result,
            });
          }),
        );
        break;
      }
      case "core.generation.command": {
        const requestId = parsed.data.requestId;
        const operation = parsed.data.operation;
        if (!acceptingAppDataOperations) {
          send({
            type: "core.generation.result",
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result: CoreGenerationResultSchema.parse({
              ok: false,
              operation: operation.operation,
              errorCode: "COMMON_CANCELLED_004",
            }),
          });
          break;
        }
        track(
          executeGenerationOperation(
            options.generationServices,
            requestId,
            operation,
          ).then((result) => {
            send({
              type: "core.generation.result",
              protocolVersion: PROTOCOL_VERSION,
              requestId,
              result,
            });
          }),
        );
        break;
      }
      case "core.project.command": {
        const requestId = parsed.data.requestId;
        const operation = parsed.data.operation;
        if (!acceptingAppDataOperations) {
          send({
            type: "core.project.result",
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result: CoreProjectResultSchema.parse({
              ok: false,
              operation: operation.operation,
              errorCode: "COMMON_CANCELLED_004",
            }),
          });
          break;
        }
        track(
          executeProjectOperation(options.services, requestId, operation).then(
            async (result) => {
              if (
                result.ok &&
                (operation.operation === PROJECT_WORKSPACE_COMMANDS.create ||
                  operation.operation ===
                    PROJECT_WORKSPACE_COMMANDS.openRecent ||
                  operation.operation ===
                    PROJECT_WORKSPACE_COMMANDS.openSelected) &&
                options.projectWorkspace.activeProject?.databaseMode ===
                  "read-write"
              ) {
                await options.generationRuns.recoverInterrupted(
                  derivedRequestId(requestId, "generation-recovery"),
                  options.projectWorkspace.activeProject.projectId,
                );
              }
              send({
                type: "core.project.result",
                protocolVersion: PROTOCOL_VERSION,
                requestId,
                result,
              });
            },
          ),
        );
        break;
      }
      case "core.drain": {
        acceptingAppDataOperations = false;
        const requestId = parsed.data.requestId;
        void Promise.all([
          options.taskProtocol.beginDrain(),
          ...activeAppDataOperations,
        ]).then(() => {
          send({
            type: "core.drained",
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            pendingTasks: 0,
          });
        });
        break;
      }
      case "core.shutdown": {
        if (
          options.taskProtocol.accepting ||
          options.taskProtocol.activeTaskCount > 0 ||
          acceptingAppDataOperations ||
          activeAppDataOperations.size > 0 ||
          shuttingDown
        ) {
          return;
        }
        shuttingDown = true;
        options.taskProtocol.close();
        const requestId = parsed.data.requestId;
        void options.projectWorkspace
          .shutdown()
          .then(() => options.appRuntime.close())
          .then(() => {
            send({
              type: "core.shutdown-complete",
              protocolVersion: PROTOCOL_VERSION,
              requestId,
            });
            setImmediate(() => process.exit(0));
          })
          .catch(() => process.exit(1));
        break;
      }
    }
  };
}
