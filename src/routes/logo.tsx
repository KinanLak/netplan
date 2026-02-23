import { createFileRoute } from "@tanstack/react-router";
import { NetplanLogo } from "@/components/netplan-logo";

const PREVIEW_SIZES = [24, 36, 52, 80] as const;

export const Route = createFileRoute("/logo")({
  component: LogoPreviewPage,
});

function LogoPreviewPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_0%_0%,oklch(0.99_0.02_245),transparent_54%),radial-gradient(circle_at_100%_0%,oklch(0.95_0.03_230),transparent_60%),oklch(0.99_0_0)] px-4 py-8 sm:px-8 md:py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            Brand playground
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Logo NetPlan
          </h1>
        </header>

        <section className="space-y-6">
          <div className="light rounded-3xl border border-[rgb(0_0_0/0.08)] bg-[radial-gradient(circle_at_18%_0%,rgb(0_156_210/0.06),transparent_50%),linear-gradient(150deg,#f5f8fc,#eef3f9)] p-4 sm:p-6 md:p-8">
            <h2 className="mb-4 text-sm font-semibold tracking-wide text-[rgb(52_61_78)] uppercase">
              Variante light
            </h2>
            <div className="flex flex-wrap items-end gap-4 md:gap-5">
              {PREVIEW_SIZES.map((size) => (
                <div
                  key={`light-${size}`}
                  className="rounded-xl border border-[rgb(0_0_0/0.08)] bg-[rgb(255_255_255/0.65)] p-4"
                >
                  <NetplanLogo size={size} />
                </div>
              ))}
            </div>
          </div>

          <div className="dark rounded-3xl border border-[rgb(255_255_255/0.11)] bg-[radial-gradient(circle_at_18%_0%,rgb(130_236_255/0.08),transparent_50%),linear-gradient(150deg,#060b15,#121929)] p-4 sm:p-6 md:p-8">
            <h2 className="mb-4 text-sm font-semibold tracking-wide text-[rgb(223_231_245)] uppercase">
              Variante dark
            </h2>
            <div className="flex flex-wrap items-end gap-4 md:gap-5">
              {PREVIEW_SIZES.map((size) => (
                <div
                  key={`dark-${size}`}
                  className="rounded-xl border border-[rgb(255_255_255/0.1)] bg-[rgb(0_0_0/0.2)] p-4"
                >
                  <NetplanLogo size={size} />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
