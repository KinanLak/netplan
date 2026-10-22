import { describe, expect, it } from "bun:test";
import {
  describeSources,
  failedAttemptAt,
  describeFreshness,
  describeNextRun,
  isLate,
  nextRun,
  refreshOutcome,
} from "./freshness";
import type { SiteFreshness } from "./freshness";
import { DEFAULT_CADENCE } from "./settings";

const MINUTE = 60_000;
const TZ = "Europe/Paris";
// A Wednesday at 10:00 in Paris: business hours, a cycle every 5 minutes.
const WEDNESDAY_10H = Date.parse("2026-10-14T08:00:00Z");
// The same Wednesday at 23:00: a cycle every hour.
const WEDNESDAY_23H = Date.parse("2026-10-14T21:00:00Z");

const site = (overrides: Partial<SiteFreshness> = {}): SiteFreshness => ({
  paused: false,
  hasSources: true,
  automaticRefresh: true,
  manualRefresh: true,
  cadence: DEFAULT_CADENCE,
  timezone: TZ,
  running: null,
  last: null,
  lastSuccessAt: WEDNESDAY_10H,
  nextRunAt: WEDNESDAY_10H + 5 * MINUTE,
  failures: 0,
  sources: [],
  switches: null,
  ...overrides,
});

describe("isLate", () => {
  it("waits two scheduled cycles and the time to run one, at any cadence", () => {
    expect(isLate(site(), WEDNESDAY_10H + 12 * MINUTE)).toBe(false);
    expect(isLate(site(), WEDNESDAY_10H + 12 * MINUTE + 1)).toBe(true);

    const night = site({ lastSuccessAt: WEDNESDAY_23H });
    expect(isLate(night, WEDNESDAY_23H + 90 * MINUTE)).toBe(false);
    expect(isLate(night, WEDNESDAY_23H + 123 * MINUTE)).toBe(true);
  });

  it("is late after two failures in a row, even with fresh data", () => {
    expect(isLate(site({ failures: 1 }), WEDNESDAY_10H)).toBe(false);
    expect(isLate(site({ failures: 2 }), WEDNESDAY_10H)).toBe(true);
  });

  it("makes no promise without automatic cycles", () => {
    const old = WEDNESDAY_10H + 24 * 60 * MINUTE;
    expect(isLate(site({ automaticRefresh: false }), old)).toBe(false);
    expect(isLate(site({ paused: true }), old)).toBe(false);
    expect(isLate(site({ hasSources: false }), old)).toBe(false);
    expect(isLate(site({ lastSuccessAt: null }), old)).toBe(false);
  });
});

describe("nextRun", () => {
  it("never shows a date in the past", () => {
    const due = WEDNESDAY_10H + 5 * MINUTE;
    expect(nextRun(site(), due - 1)).toEqual({ kind: "at", at: due });
    expect(nextRun(site(), due)).toEqual({ kind: "imminent" });
    expect(nextRun(site(), due + 2 * MINUTE - 1)).toEqual({
      kind: "imminent",
    });
    expect(nextRun(site(), due + 2 * MINUTE)).toEqual({ kind: "waiting" });
    expect(nextRun(site({ nextRunAt: null }), due)).toEqual({
      kind: "imminent",
    });
  });

  it("names what stops the cycles instead of a date", () => {
    const now = WEDNESDAY_10H;
    const running = { startedAt: now, manual: true };
    expect(nextRun(site({ running, paused: true }), now).kind).toBe("running");
    expect(nextRun(site({ paused: true }), now).kind).toBe("paused");
    expect(nextRun(site({ hasSources: false }), now).kind).toBe("no-source");
    expect(nextRun(site({ automaticRefresh: false }), now).kind).toBe(
      "manual-only",
    );
  });
});

describe("descriptions", () => {
  it("shows the time, and its day when it is not today", () => {
    const now = WEDNESDAY_10H;
    expect(describeNextRun({ kind: "at", at: now + 5 * MINUTE }, now, TZ)).toBe(
      "Prochaine collecte : 10:05",
    );
    expect(
      describeNextRun({ kind: "at", at: now + 24 * 60 * MINUTE }, now, TZ),
    ).toMatch(/^Prochaine collecte : jeu\. 15 oct\.,? 10:00$/);
  });
});

describe("describeFreshness", () => {
  it("says how old the data is, late once it is", () => {
    expect(describeFreshness(site(), WEDNESDAY_10H + 3 * MINUTE)).toEqual({
      headline: "Données collectées il y a 3 min",
      tone: "fresh",
    });
    expect(describeFreshness(site({ failures: 2 }), WEDNESDAY_10H)).toEqual({
      headline: "Données en retard : à l'instant",
      tone: "late",
    });
  });

  it("tells a hand-drawn plan from one never collected", () => {
    expect(
      describeFreshness(site({ hasSources: false }), WEDNESDAY_10H).headline,
    ).toBe("Plan dessiné à la main");
    expect(
      describeFreshness(site({ lastSuccessAt: null }), WEDNESDAY_10H),
    ).toEqual({ headline: "Aucune donnée collectée", tone: "none" });
  });

  it("names no failure once the failing source is gone", () => {
    expect(
      describeFreshness(
        site({
          lastSuccessAt: null,
          last: {
            startedAt: WEDNESDAY_10H,
            finishedAt: WEDNESDAY_10H,
            failed: [],
            succeeded: ["netbox"],
          },
        }),
        WEDNESDAY_10H + 5 * MINUTE,
      ),
    ).toEqual({ headline: "Données collectées il y a 5 min", tone: "fresh" });
  });

  it("tells a partial collection from none at all", () => {
    expect(
      describeFreshness(
        site({
          lastSuccessAt: null,
          last: {
            startedAt: WEDNESDAY_10H,
            finishedAt: WEDNESDAY_10H,
            failed: ["librenms"],
            succeeded: ["netbox"],
          },
        }),
        WEDNESDAY_10H + 5 * MINUTE,
      ),
    ).toEqual({
      headline: "Collecte partielle il y a 5 min : LibreNMS en échec",
      tone: "partial",
    });
  });

  it("warns of a site whose cycles keep failing before any succeeded", () => {
    expect(
      describeFreshness(
        site({ lastSuccessAt: null, failures: 2 }),
        WEDNESDAY_10H,
      ),
    ).toEqual({ headline: "Aucune donnée collectée", tone: "late" });
  });
});

describe("refreshOutcome", () => {
  const startedAt = WEDNESDAY_10H;

  it("follows the cycle someone started until it ends", () => {
    expect(
      refreshOutcome(site({ running: { startedAt, manual: true } }), startedAt),
    ).toEqual({ kind: "pending" });
    expect(
      refreshOutcome(
        site({
          last: {
            startedAt,
            finishedAt: startedAt,
            failed: [],
            succeeded: ["netbox"],
          },
        }),
        startedAt,
      ),
    ).toEqual({ kind: "succeeded" });
    expect(
      refreshOutcome(
        site({
          last: {
            startedAt,
            finishedAt: startedAt,
            failed: ["netbox", "librenms"],
            succeeded: [],
          },
        }),
        startedAt,
      ),
    ).toEqual({ kind: "failed", sources: "NetBox et LibreNMS" });
  });

  it("knows a cycle that died, and a site that went", () => {
    expect(refreshOutcome(site(), startedAt)).toEqual({ kind: "interrupted" });
    expect(refreshOutcome(null, startedAt)).toEqual({ kind: "gone" });
  });
});

describe("failedAttemptAt", () => {
  const failed = (startedAt: number) => ({
    startedAt,
    finishedAt: startedAt + MINUTE,
    failed: ["librenms" as const],
    succeeded: [],
  });

  it("keeps a failure said until a cycle succeeds", () => {
    expect(
      failedAttemptAt(site({ last: failed(WEDNESDAY_10H + MINUTE) })),
    ).toBe(WEDNESDAY_10H + 2 * MINUTE);
    expect(
      failedAttemptAt(
        site({ last: failed(WEDNESDAY_10H + MINUTE), lastSuccessAt: null }),
      ),
    ).toBe(WEDNESDAY_10H + 2 * MINUTE);
  });

  it("says nothing once the last cycle succeeded", () => {
    expect(failedAttemptAt(site())).toBeNull();
    expect(
      failedAttemptAt(
        site({
          last: {
            startedAt: WEDNESDAY_10H,
            finishedAt: WEDNESDAY_10H + MINUTE,
            failed: [],
            succeeded: ["netbox"],
          },
        }),
      ),
    ).toBeNull();
  });
});

describe("describeSources", () => {
  it("gives each source its own age, and LibreNMS its switches", () => {
    const freshness = site({
      sources: [
        { source: "netbox", at: WEDNESDAY_10H - 5 * MINUTE, failed: false },
        { source: "librenms", at: WEDNESDAY_10H - 3 * MINUTE, failed: true },
      ],
      switches: { read: 6, noted: 1 },
    });
    expect(describeSources(freshness, WEDNESDAY_10H)).toEqual([
      { label: "NetBox", detail: "Importé il y a 5 min", failed: false },
      {
        label: "LibreNMS",
        detail:
          "6 switchs lus, 1 avec remarque · il y a 3 min · échec à la dernière collecte",
        failed: true,
      },
    ]);
  });

  it("says when a source never brought anything", () => {
    const freshness = site({
      sources: [{ source: "netbox", at: null, failed: false }],
    });
    expect(describeSources(freshness, WEDNESDAY_10H)).toEqual([
      { label: "NetBox", detail: "Rien d'importé", failed: false },
    ]);
  });
});
