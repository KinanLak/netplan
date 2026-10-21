import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { createServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { ErrorScreen, isNetworkError } from "@/components/error-screen";
import { ThemeProvider, themeScript } from "@/components/theme-provider";
import { useDocumentTitle } from "@/hooks/use-document-title";
import appCss from "@/styles.css?url";
import logoCss from "@/netplan-logo.css?url";
import { providerAuthClient } from "@/lib/auth-client";
import { getToken } from "@/lib/auth-server";
import { getConvexClient } from "@/lib/convex";
import { getRuntimeConfig } from "@/lib/getRuntimeConfig";
import { logGraphicsAccelerationStatusOnce } from "@/lib/graphicsAcceleration";

// Read from the session cookie on the server, so a signed-out visitor is
// redirected before any page renders and a signed-in one starts authenticated.
const getAuthToken = createServerFn({ method: "GET" }).handler(
  async () => (await getToken()) ?? null,
);

// The token the browser last read. Every page change asks again, and without
// a network that request fails: the session has not changed for it, so the
// page opens and says it is offline instead of failing. Signing in and out
// reload the page, and the signed-in layout notices a session lost meanwhile.
// Any other failure still fails: the server may have something to say.
let lastClientToken: string | null | undefined;

const readAuthToken = async () => {
  if (typeof window === "undefined") return await getAuthToken();
  try {
    lastClientToken = await getAuthToken();
  } catch (error) {
    const offline = isNetworkError(error) || !navigator.onLine;
    if (!offline || lastClientToken === undefined) throw error;
  }
  return lastClientToken;
};

export const Route = createRootRoute({
  beforeLoad: async () => ({ token: await readAuthToken() }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "color-scheme", content: "light dark" },
      { title: "NetPlan" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: logoCss },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: import.meta.env.DEV ? "/favicon-dev.svg" : "/favicon.svg",
      },
    ],
  }),
  loader: () => getRuntimeConfig(),
  staleTime: Infinity,
  shellComponent: RootDocument,
  component: RootComponent,
  errorComponent: ErrorScreen,
  notFoundComponent: NotFoundComponent,
});

function NotFoundComponent() {
  useDocumentTitle("Page introuvable");
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3">
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <p className="text-muted-foreground">
        L'adresse demandée n'existe pas ou n'est plus disponible.
      </p>
      <Link to="/" className="text-primary underline underline-offset-4">
        Retour au plan
      </Link>
    </main>
  );
}

function RootComponent() {
  const { convexUrl } = Route.useLoaderData();
  const { token } = Route.useRouteContext();
  // A full load hydrates the server's context without running `beforeLoad`
  // in the browser, so the first page change offline starts from it.
  useEffect(() => {
    lastClientToken ??= token;
  }, [token]);
  return (
    <ConvexBetterAuthProvider
      client={getConvexClient(convexUrl, { signedIn: Boolean(token) })}
      authClient={providerAuthClient}
      initialToken={token}
    >
      <Outlet />
    </ConvexBetterAuthProvider>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  useEffect(() => {
    logGraphicsAccelerationStatusOnce();

    if (!import.meta.env.DEV) {
      return;
    }

    void import("react-scan").then(({ scan }) => {
      scan({
        enabled: false,
        showToolbar: true,
      });
    });
  }, []);

  return (
    // The head script sets the theme class before React hydrates.
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <TanStackDevtools
          config={{
            position: "middle-left",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
