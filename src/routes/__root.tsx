import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { ConvexProvider } from "convex/react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import appCss from "@/styles.css?url";
import logoCss from "@/netplan-logo.css?url";
import { convexClient } from "@/lib/convex";
import { logGraphicsAccelerationStatusOnce } from "@/lib/graphicsAcceleration";

export const Route = createRootRoute({
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
  return (
    <ConvexProvider client={convexClient}>
      <RootDocument>
        <Outlet />
      </RootDocument>
    </ConvexProvider>
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
