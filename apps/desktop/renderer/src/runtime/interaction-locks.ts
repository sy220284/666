export function interactionLocked(...conditions: readonly boolean[]): boolean {
  return conditions.some(Boolean);
}
