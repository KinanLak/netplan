import { Link, useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, useEffectEvent } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useOnline } from "@/hooks/use-online";

/**
 * What the app's server throws when it cannot read the session because
 * Convex does not answer. A message rather than a class: the error crosses
 * from the server to the browser, which only keeps its message.
 */
export const BACKEND_UNREACHABLE = "NetPlan: backend unreachable";

/**
 * A fetch that never reached a server: the browser is offline, or the app's
 * server is down or unreachable.
 */
export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    /fetch|network|load failed/i.test(error.message)
  );
}

/** A failure that comes back on its own once the servers answer again. */
export function isConnectionError(error: unknown): boolean {
  return (
    isNetworkError(error) ||
    (error instanceof Error && error.message === BACKEND_UNREACHABLE)
  );
}

const FIRST_PROBE_MS = 2_000;
const MAX_PROBE_MS = 30_000;

/**
 * Calls `onBack` once the app's server and Convex answer again, asking
 * `/health` with a growing delay, and at once when the network returns.
 */
function useServerReturn(enabled: boolean, onBack: () => void) {
  const back = useEffectEvent(onBack);
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    let delay = FIRST_PROBE_MS;
    let stopped = false;
    const probe = async () => {
      try {
        const response = await fetch("/health", { cache: "no-store" });
        if (response.ok && !stopped) {
          stopped = true;
          back();
          return;
        }
      } catch {
        // Still unreachable.
      }
      if (stopped) return;
      delay = Math.min(delay * 2, MAX_PROBE_MS);
      timer = window.setTimeout(() => void probe(), delay);
    };
    const onOnline = () => {
      window.clearTimeout(timer);
      void probe();
    };
    timer = window.setTimeout(() => void probe(), delay);
    window.addEventListener("online", onOnline);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled]);
}

/**
 * What the router shows instead of a page that failed to load. A page fails
 * mostly when the app's server or Convex cannot be reached, so the screen
 * says so and comes back by itself when they answer again.
 */
export function ErrorScreen({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const online = useOnline();
  const connection = !online || isConnectionError(error);

  const retry = () => {
    reset();
    void router.invalidate();
  };

  useServerReturn(connection, retry);

  const { title, description } = !online
    ? {
        title: "Pas de connexion",
        description:
          "Ce navigateur n'est plus connecté au réseau. La page se rechargera dès son retour.",
      }
    : connection
      ? {
          title: "Serveur injoignable",
          description:
            "Le serveur NetPlan ne répond pas. La page se rechargera dès son retour ; si cela dure, prévenez votre administrateur.",
        }
      : {
          title: "Cette page n'a pas pu s'afficher",
          description:
            "Une erreur inattendue s'est produite. Réessayez ; si cela se reproduit, prévenez votre administrateur.",
        };

  return (
    <main
      role="alert"
      className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background p-6 text-center"
    >
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={retry}>Réessayer</Button>
        <Link to="/" className={buttonVariants({ variant: "outline" })}>
          Retour au plan
        </Link>
      </div>
    </main>
  );
}
