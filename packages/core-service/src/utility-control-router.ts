import { CoreControlMessageSchema } from '@worldforge/contracts';

import {
  createUtilityControlContext,
  type UtilityControlRouterOptions,
} from './utility-control-context.js';
import { dispatchUtilityLifecycle } from './utility-control-lifecycle.js';
import { dispatchUtilityOperation } from './utility-control-operations.js';
import type { UtilityParentMessage } from './utility-runtime-context.js';

export type { UtilityControlRouterOptions };

export function createUtilityControlHandler(options: UtilityControlRouterOptions) {
  const context = createUtilityControlContext(options);

  return ({ data, ports }: UtilityParentMessage): void => {
    const parsed = CoreControlMessageSchema.safeParse(data);
    if (!parsed.success) return;
    if (dispatchUtilityOperation(context, parsed.data)) return;
    dispatchUtilityLifecycle(context, parsed.data, ports);
  };
}
