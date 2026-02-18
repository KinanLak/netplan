declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void): void;

  export interface Matchers {
    toBe: (expected: unknown) => void;
    toEqual: (expected: unknown) => void;
    toBeTruthy: () => void;
    toBeFalsy: () => void;
    toHaveLength: (length: number) => void;
    toContain: (expected: unknown) => void;
  }

  export function expect(value: unknown): Matchers;
}
