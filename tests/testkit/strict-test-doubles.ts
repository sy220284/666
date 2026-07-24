type PropertyBag = Record<PropertyKey, unknown>;

export function strictTestDouble<T extends object>(label: string, members: Partial<T>): T {
  const target = Object.create(
    Object.getPrototypeOf(members),
    Object.getOwnPropertyDescriptors(members),
  ) as PropertyBag;
  return new Proxy(target, {
    get(current, property, receiver) {
      if (property === 'then') return undefined;
      if (typeof property === 'symbol' || Reflect.has(current, property)) {
        return Reflect.get(current, property, receiver);
      }
      throw new Error(`UNEXPECTED_TEST_DOUBLE_ACCESS:${label}.${String(property)}`);
    },
    set(current, property, value, receiver) {
      if (!Reflect.has(current, property)) {
        throw new Error(`UNEXPECTED_TEST_DOUBLE_MUTATION:${label}.${String(property)}`);
      }
      return Reflect.set(current, property, value, receiver);
    },
  }) as T;
}

export function contractInput<T>(value: unknown): T {
  return value as T;
}
