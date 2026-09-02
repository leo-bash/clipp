import type { FastifyInstance } from "fastify";
import type { AnalyticsSnapshotStore } from "@shortfactory/analytics";
import { buildAnalyticsOverview } from "@shortfactory/analytics";

export async function registerAnalyticsRoutes(server: FastifyInstance, store: AnalyticsSnapshotStore, prefix = ""): Promise<void> {
  server.get(`${prefix}/analytics/overview`, async () => buildAnalyticsOverview(await store.list()));
  server.get<{ Params: { id: string } }>(`${prefix}/analytics/publications/:id`, async (request) => store.list(request.params.id));
}
