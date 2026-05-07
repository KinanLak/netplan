declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void): void;

  export interface Matchers {
    toBe: <TExpected>(expected: TExpected) => void;
    toEqual: <TExpected>(expected: TExpected) => void;
    toBeTruthy: () => void;
    toBeFalsy: () => void;
    toHaveLength: (length: number) => void;
    toContain: <TExpected>(expected: TExpected) => void;
  }

  export function expect<TActual>(value: TActual): Matchers;
}
