export function expectDefined<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`${label} was unexpectedly undefined`);
  }
  return value;
}
