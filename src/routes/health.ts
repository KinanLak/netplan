import { createFileRoute } from "@tanstack/react-router";
import { checkHealth } from "@/lib/health";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () => {
        const report = await checkHealth({
          env: process.env,
          fetch: (url, init) => fetch(url, init),
          timeoutMs: 3000,
        });
        return Response.json(report, {
          status: report.status === "ok" ? 200 : 503,
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
