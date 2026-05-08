import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { ConvexProvider } from "convex/react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import appCss from "@/styles.css?url";
import logoCss from "@/netplan-logo.css?url";
import { convexClient } from "@/lib/convex";

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
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    ],
  }),
  component: RootComponent,
});

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
        <SpeedInsights debug={false} />
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
