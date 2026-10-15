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

export const Route = createRootRoute({
  beforeLoad: async () => ({ token: await getAuthToken() }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Netplan" },
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
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function NotFoundComponent() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3">
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <p className="text-muted-foreground">
        L'adresse demandée n'existe pas ou n'est plus disponible.
      </p>
      <Link to="/" className="text-primary underline underline-offset-4">
        Retour à la carte
      </Link>
    </main>
  );
}

function RootComponent() {
  const { convexUrl } = Route.useLoaderData();
  const { token } = Route.useRouteContext();
  return (
    <ConvexBetterAuthProvider
      client={getConvexClient(convexUrl, { signedIn: Boolean(token) })}
      authClient={providerAuthClient}
      initialToken={token}
    >
      <RootDocument>
        <Outlet />
      </RootDocument>
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
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
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
