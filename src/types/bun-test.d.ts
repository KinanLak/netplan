declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function it(
    name: string,
    fn: () => void | Promise<void>,
    timeoutMs?: number,
  ): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;

  export interface Mock<TArgs extends Array<unknown>, TReturn> {
    (...args: TArgs): TReturn;
    mock: {
      calls: Array<TArgs>;
      results: Array<{ type: "return" | "throw"; value: TReturn }>;
    };
    mockClear: () => void;
    mockReset: () => void;
    mockImplementation: (
      impl: (...args: TArgs) => TReturn,
    ) => Mock<TArgs, TReturn>;
    mockReturnValue: (value: TReturn) => Mock<TArgs, TReturn>;
  }

  export interface MockFactory {
    <TArgs extends Array<unknown>, TReturn>(
      fn?: (...args: TArgs) => TReturn,
    ): Mock<TArgs, TReturn>;
    /** Replaces a module in the registry for the current test process. */
    module: (specifier: string, factory: () => unknown) => void;
  }

  export const mock: MockFactory;

  export interface Matchers {
    toBe: <TExpected>(expected: TExpected) => void;
    toEqual: <TExpected>(expected: TExpected) => void;
    toStrictEqual: <TExpected>(expected: TExpected) => void;
    toBeTruthy: () => void;
    toBeFalsy: () => void;
    toBeNull: () => void;
    toBeUndefined: () => void;
    toBeDefined: () => void;
    toHaveLength: (length: number) => void;
    toContain: <TExpected>(expected: TExpected) => void;
    toBeGreaterThan: (n: number) => void;
    toBeGreaterThanOrEqual: (n: number) => void;
    toBeLessThan: (n: number) => void;
    toBeLessThanOrEqual: (n: number) => void;
    toBeInstanceOf: (
      constructor: new (...args: Array<unknown>) => unknown,
    ) => void;
    toMatch: (expected: string | RegExp) => void;
    toMatchObject: <TExpected>(expected: TExpected) => void;
    toHaveBeenCalled: () => void;
    toHaveBeenCalledTimes: (n: number) => void;
    toHaveBeenCalledWith: (...args: Array<unknown>) => void;
    toThrow: (expected?: string | RegExp) => void;
  }

  export interface ExpectChain extends Matchers {
    not: Matchers;
  }

  export function expect<TActual>(value: TActual): ExpectChain;
}
