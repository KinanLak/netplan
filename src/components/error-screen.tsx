import { Link, useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useOnline } from "@/hooks/use-online";

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

/**
 * What the router shows instead of a page that failed to load. A page fails
 * mostly when the app's server cannot be reached, so the network coming back
 * retries on its own.
 */
export function ErrorScreen({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const online = useOnline();

  const retry = () => {
    reset();
    void router.invalidate();
  };

  useEffect(() => {
    const onOnline = () => {
      reset();
      void router.invalidate();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [reset, router]);

  const { title, description } = !online
    ? {
        title: "Pas de connexion",
        description:
          "Ce navigateur n'est plus connecté au réseau. La page se rechargera dès son retour.",
      }
    : isNetworkError(error)
      ? {
          title: "Serveur injoignable",
          description:
            "Le serveur NetPlan ne répond pas. Réessayez dans un instant ; si cela dure, prévenez votre administrateur.",
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
