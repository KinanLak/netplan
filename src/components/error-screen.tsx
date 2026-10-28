import { Link, useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useOnline } from "@/hooks/use-online";
import { BACKEND_UNREACHABLE } from "@/lib/health";
import { untilServerAnswers } from "@/lib/server-return";
import { waitOrOnline } from "@/lib/session-token";

/**
 * A fetch that never reached a server: the browser is offline, or the app's
 * server is down or unreachable. Chromium, Firefox and Safari each word a
 * page's code that failed to load differently.
 */
export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    /fetch|network|load failed|dynamically imported module|module script/i.test(
      error.message,
    )
  );
}

/** A failure that comes back on its own once the servers answer again. */
export function isConnectionError(error: unknown): boolean {
  return (
    isNetworkError(error) ||
    (error instanceof Error && error.message === BACKEND_UNREACHABLE)
  );
}

const healthAnswers = () =>
  fetch("/health", { cache: "no-store" }).then(
    (response) => response.ok,
    () => false,
  );

/**
 * What the router shows instead of a page that failed to load. A page fails
 * mostly when the app's server or Convex cannot be reached, so the screen
 * says so and comes back by itself when they answer again.
 */
export function ErrorScreen({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const online = useOnline();
  // A screen shown offline heals once the network returns, whatever error
  // the missing network caused.
  const [sawOffline, setSawOffline] = useState(!online);
  if (!online && !sawOffline) setSawOffline(true);
  const heals = sawOffline || isConnectionError(error);

  const retry = () => {
    reset();
    void router.invalidate();
  };
  const retryOnReturn = useEffectEvent(retry);

  useEffect(() => {
    if (!heals) return;
    let cancelled = false;
    void untilServerAnswers({
      probe: healthAnswers,
      wait: waitOrOnline,
      cancelled: () => cancelled,
    }).then((back) => {
      if (back) retryOnReturn();
    });
    return () => {
      cancelled = true;
    };
  }, [heals, error]);

  const title = !online
    ? "Pas de connexion"
    : heals
      ? "Serveur injoignable"
      : "Cette page n'a pas pu s'afficher";

  return (
    <main
      role="alert"
      className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background p-6 text-center"
    >
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={retry}>Réessayer</Button>
        <Link to="/" className={buttonVariants({ variant: "outline" })}>
          Retour au plan
        </Link>
      </div>
    </main>
  );
}
