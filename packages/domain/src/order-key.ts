export const ORDER_KEY_INTERVAL = 1_024n;
export const SQLITE_INTEGER_MIN = -(2n ** 63n);
export const SQLITE_INTEGER_MAX = 2n ** 63n - 1n;

export type OrderPlacement =
  | { readonly kind: 'start' }
  | { readonly kind: 'end' }
  | { readonly kind: 'before'; readonly siblingId: string }
  | { readonly kind: 'after'; readonly siblingId: string };

export interface OrderedSibling {
  readonly id: string;
  readonly orderKey: bigint;
}

export interface OrderKeyPlan {
  readonly orderKey: bigint;
  readonly rebalanced: ReadonlyArray<OrderedSibling>;
}

function insertionIndex(siblings: readonly OrderedSibling[], placement: OrderPlacement): number {
  if (placement.kind === 'start') return 0;
  if (placement.kind === 'end') return siblings.length;
  const siblingIndex = siblings.findIndex((sibling) => sibling.id === placement.siblingId);
  if (siblingIndex < 0) throw new Error('ORDER_PLACEMENT_SIBLING_NOT_FOUND');
  return placement.kind === 'before' ? siblingIndex : siblingIndex + 1;
}

function midpoint(left: bigint, right: bigint): bigint | null {
  if (right - left <= 1n) return null;
  const candidate = left + (right - left) / 2n;
  return candidate > left && candidate < right ? candidate : null;
}

export function planOrderKey(
  input: readonly OrderedSibling[],
  placement: OrderPlacement,
): OrderKeyPlan {
  const siblings = [...input].sort((left, right) =>
    left.orderKey < right.orderKey ? -1 : left.orderKey > right.orderKey ? 1 : 0,
  );
  const index = insertionIndex(siblings, placement);
  if (siblings.length === 0) return { orderKey: ORDER_KEY_INTERVAL, rebalanced: [] };

  const previous = siblings[index - 1];
  const next = siblings[index];
  let candidate: bigint | null = null;
  if (!previous && next) {
    const value = next.orderKey - ORDER_KEY_INTERVAL;
    if (value >= SQLITE_INTEGER_MIN) candidate = value;
  } else if (previous && !next) {
    const value = previous.orderKey + ORDER_KEY_INTERVAL;
    if (value <= SQLITE_INTEGER_MAX) candidate = value;
  } else if (previous && next) {
    candidate = midpoint(previous.orderKey, next.orderKey);
  }
  if (candidate !== null) return { orderKey: candidate, rebalanced: [] };

  const requiredMaximum = BigInt(siblings.length + 1) * ORDER_KEY_INTERVAL;
  if (requiredMaximum > SQLITE_INTEGER_MAX) throw new Error('ORDER_KEY_SPACE_EXHAUSTED');
  const rebalanced = siblings.map((sibling, siblingIndex) => ({
    id: sibling.id,
    orderKey:
      BigInt(siblingIndex < index ? siblingIndex + 1 : siblingIndex + 2) * ORDER_KEY_INTERVAL,
  }));
  return {
    orderKey: BigInt(index + 1) * ORDER_KEY_INTERVAL,
    rebalanced,
  };
}
