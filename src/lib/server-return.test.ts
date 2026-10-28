import { describe, expect, it } from "bun:test";
import { untilServerAnswers } from "@/lib/server-return";

describe("untilServerAnswers", () => {
  it("asks after a growing delay until the servers answer", async () => {
    const waits: Array<number> = [];
    const answers = [false, false, false, false, false, true];
    const back = await untilServerAnswers({
      probe: () => Promise.resolve(answers.shift() ?? false),
      wait: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
      cancelled: () => false,
    });
    expect(back).toBe(true);
    expect(waits).toEqual([2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
  });

  it("stops without asking once cancelled", async () => {
    let probes = 0;
    let cancelled = false;
    const back = await untilServerAnswers({
      probe: () => {
        probes += 1;
        return Promise.resolve(true);
      },
      wait: () => {
        cancelled = true;
        return Promise.resolve();
      },
      cancelled: () => cancelled,
    });
    expect(back).toBe(false);
    expect(probes).toBe(0);
  });
});
