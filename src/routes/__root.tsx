import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { ConvexProviderWithAuth } from "convex/react";
import { createServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { ErrorScreen } from "@/components/error-screen";
import { ThemeProvider, themeScript } from "@/components/theme-provider";
import { useDocumentTitle } from "@/hooks/use-document-title";
import appCss from "@/styles.css?url";
import logoCss from "@/netplan-logo.css?url";
import { authClient } from "@/lib/auth-client";
import { getToken } from "@/lib/auth-server";
import { getConvexClient } from "@/lib/convex";
import { getRuntimeConfig } from "@/lib/getRuntimeConfig";
import type { RuntimeConfig } from "@/lib/runtimeConfig";
import { createSessionTokens, tokenAnswer } from "@/lib/session-token";
import type { SessionTokens } from "@/lib/session-token";
import { logGraphicsAccelerationStatusOnce } from "@/lib/graphicsAcceleration";

// Read from the session cookie on the server, so a signed-out visitor is
// redirected before any page renders and a signed-in one starts authenticated.
const getAuthToken = createServerFn({ method: "GET" }).handler(
  async () => (await getToken()) ?? null,
);

// What the server said when the page loaded. Signing in and out reload the
// page, so in the browser neither changes until the next full load, and a
// page change does not ask again: during an outage that request failed, and
// its failure replaced every page, the map's queued edits with it, by the
// error screen. A session lost meanwhile shows as Convex refusing it, which
// the signed-in layout handles.
let pageToken: { token: string | null } | undefined;
let pageConfig: RuntimeConfig | undefined;

const readAuthToken = async () => {
  if (typeof window === "undefined") return await getAuthToken();
  pageToken ??= { token: await getAuthToken() };
  return pageToken.token;
};

const readRuntimeConfig = async () => {
  if (typeof window === "undefined") return await getRuntimeConfig();
  return (pageConfig ??= await getRuntimeConfig());
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
  loader: () => readRuntimeConfig(),
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

// One per page in the browser, so a remount keeps the token; one per
// request on the server, which never fetches one.
let browserTokens: SessionTokens | undefined;

const sessionTokens = (initialToken: string | null) => {
  const create = () =>
    createSessionTokens({
      initialToken,
      requestToken: async () => {
        try {
          return tokenAnswer(
            await authClient.convex.token({ fetchOptions: { throw: false } }),
          );
        } catch {
          return { kind: "unreachable" };
        }
      },
    });
  if (typeof window === "undefined") return create();
  return (browserTokens ??= create());
};

// Reading the session slides it and its cookie (ADR 0031), which the token
// requests do not promise. Done on load and when the tab comes back, as
// better-auth's own session hook did; a failure waits for the next one.
function useSessionKeptAlive(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return;
    const read = () => {
      if (document.visibilityState !== "visible") return;
      authClient.getSession().catch(() => {});
    };
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, [signedIn]);
}

function RootComponent() {
  const config = Route.useLoaderData();
  const { token } = Route.useRouteContext();
  // A full load hydrates the server's answers without running `beforeLoad`
  // or the loader in the browser, so the first page change starts from them.
  useEffect(() => {
    pageToken ??= { token };
    pageConfig ??= config;
  }, [token, config]);
  const tokens = sessionTokens(token);
  useSessionKeptAlive(tokens.signedIn);
  // Constant for the page's life: Convex drops the identity whenever these
  // change, and queries in flight then fail as a lost session.
  const useAuth = () => ({
    isLoading: false,
    isAuthenticated: tokens.signedIn,
    fetchAccessToken: tokens.fetchAccessToken,
  });
  return (
    <ConvexProviderWithAuth
      client={getConvexClient(config.convexUrl, { signedIn: tokens.signedIn })}
      useAuth={useAuth}
    >
      <Outlet />
    </ConvexProviderWithAuth>
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
