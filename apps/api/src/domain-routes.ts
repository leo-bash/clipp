import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import type { BudgetKey, CostControlService, ReservationRequest } from "@shortfactory/cost-control";
import type { RightsGate } from "@shortfactory/rights";
import { type DomainStore, type PageParams, type CreateBudgetInput, type CreateCandidateInput, type CreateChannelInput, type CreateCostInput, type CreatePublicationInput, type CreateSourceInput, type CreateVideoInput, type UpdateChannelInput, type UpdateSourceInput, type UpdateVideoInput } from "@shortfactory/database";
import { AppError, channelStatuses, channelTypes, defaultPublishingSlots, platforms, publicationStatuses, rightsStatuses, type OperationalControls } from "@shortfactory/shared";

const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
const idSchema = z.object({ id: z.string().uuid() });
const channelSchema = z.object({ name: z.string().trim().min(1).max(120), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), type: z.enum(channelTypes), language: z.string().trim().min(2).max(12), timezone: z.string().trim().min(1).max(80), status: z.enum(channelStatuses).optional(), videosPerDay: z.number().int().min(0).max(100), minDuration: z.number().int().min(1).max(600), maxDuration: z.number().int().min(1).max(600), autoPublish: z.boolean(), manualReviewRequired: z.boolean(), monthlyBudget: z.number().nonnegative(), publishingSlots: z.array(z.string().regex(/^\d{2}:\d{2}$/u)).max(24).default([...defaultPublishingSlots]), keywords: z.array(z.string().trim().min(1).max(80)).max(100).default([]), priority: z.number().int().min(0).max(100).default(0), settings: z.record(z.unknown()).default({}), killSwitches: z.record(z.boolean()).default({}) });
const sourceSchema = z.object({ name: z.string().trim().min(1).max(120), type: z.string().trim().min(1).max(60), url: z.string().url(), platform: z.enum(platforms).optional(), rightsStatus: z.enum(rightsStatuses), creator: z.string().trim().max(120).optional(), notes: z.string().trim().max(2000).optional(), licenseUrl: z.string().url().optional(), attributionRequired: z.boolean().default(false), attributionText: z.string().trim().max(1000).optional(), keywords: z.array(z.string().trim().min(1).max(80)).max(100).default([]), enabled: z.boolean() });
const candidateSchema = z.object({ channelId: z.string().uuid(), topic: z.string().trim().min(1).max(240), sourceAssetId: z.string().uuid().optional(), scoreTotal: z.number().min(0).max(100).optional() });
const videoSchema = z.object({ channelId: z.string().uuid(), candidateId: z.string().uuid().optional(), contentPlanId: z.string().uuid().optional(), rightsStatus: z.enum(rightsStatuses), metadata: z.record(z.unknown()).optional() });
const videoMetadataSchema = z.object({ metadata: z.record(z.unknown()) });
const publicationSchema = z.object({ videoId: z.string().uuid(), platform: z.enum(platforms), platformAccountId: z.string().uuid().optional(), status: z.enum(publicationStatuses).optional(), scheduledAt: z.string().datetime().optional() });
const costSchema = z.object({ provider: z.string().trim().min(1).max(80), service: z.string().trim().min(1).max(80), operation: z.string().trim().min(1).max(120), channelId: z.string().uuid().optional(), candidateId: z.string().uuid().optional(), videoId: z.string().uuid().optional(), quantity: z.number().positive(), unit: z.string().trim().min(1).max(40), estimatedCostEur: z.number().nonnegative(), actualCostEur: z.number().nonnegative().optional() });
const budgetSchema = z.object({ scope: z.string().trim().min(1).max(40), scopeId: z.string().trim().min(1).max(120), period: z.string().trim().regex(/^\d{4}-\d{2}$/), budgetEur: z.number().nonnegative(), warningThreshold: z.number().min(0).max(1), hardStop: z.boolean() });
const rejectSchema = z.object({ reason: z.string().trim().min(1).max(1000) });
const budgetKeySchema = z.object({ scope: z.string().trim().min(1).max(40).default("GLOBAL"), scopeId: z.string().trim().min(1).max(120).default("global"), period: z.string().trim().regex(/^\d{4}-\d{2}$/).default(`${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`) });
const reservationSchema = budgetKeySchema.extend({ idempotencyKey: z.string().trim().min(1).max(200), amount: z.number().positive(), provider: z.string().trim().min(1).max(80), service: z.string().trim().min(1).max(80), operation: z.string().trim().min(1).max(120), channelId: z.string().uuid().optional(), candidateId: z.string().uuid().optional(), videoId: z.string().uuid().optional() });
const commitSchema = z.object({ actualAmount: z.number().nonnegative(), provider: z.string().trim().min(1).max(80), service: z.string().trim().min(1).max(80), operation: z.string().trim().min(1).max(120), quantity: z.number().positive(), unit: z.string().trim().min(1).max(40), estimatedCostEur: z.number().nonnegative(), channelId: z.string().uuid().optional(), candidateId: z.string().uuid().optional(), videoId: z.string().uuid().optional() });

type Params = { id: string };

function parsePage(query: unknown): PageParams { return pageSchema.parse(query); }
function body<T>(value: unknown, schema: z.ZodType<T>): T { return schema.parse(value); }
function notFound<T>(value: T | undefined): T { if (!value) throw new Error("NOT_FOUND"); return value; }

export async function registerDomainRoutes(server: FastifyInstance, store: DomainStore, costControl: CostControlService, rightsGate: RightsGate, prefix = "", controls: OperationalControls = { stopAllPublishing: false, stopRendering: false, stopPaidApis: false }): Promise<void> {
  server.get(`${prefix}/channels`, async (request) => store.listChannels(parsePage(request.query)));
  server.post(`${prefix}/channels`, async (request) => store.createChannel(body(request.body, channelSchema) as CreateChannelInput));
  server.get<{ Params: Params }>(`${prefix}/channels/:id`, async (request) => notFound(await store.getChannel(idSchema.parse(request.params).id)));
  server.patch<{ Params: Params }>(`${prefix}/channels/:id`, async (request) => {
    const input = body(request.body, channelSchema.partial()) as UpdateChannelInput;
    return notFound(await store.updateChannel(idSchema.parse(request.params).id, input));
  });

  server.get(`${prefix}/sources`, async (request) => store.listSources(parsePage(request.query)));
  server.post(`${prefix}/sources`, async (request) => store.createSource(body(request.body, sourceSchema) as CreateSourceInput));
  server.patch<{ Params: Params }>(`${prefix}/sources/:id`, async (request) => notFound(await store.updateSource(idSchema.parse(request.params).id, body(request.body, sourceSchema.partial()) as UpdateSourceInput)));

  server.get(`${prefix}/candidates`, async (request) => store.listCandidates(parsePage(request.query)));
  server.post(`${prefix}/candidates`, async (request) => store.createCandidate(body(request.body, candidateSchema) as CreateCandidateInput));
  server.post<{ Params: Params }>(`${prefix}/candidates/:id/analyze`, async (request) => notFound(await store.analyzeCandidate(idSchema.parse(request.params).id)));
  server.post<{ Params: Params }>(`${prefix}/candidates/:id/plan`, async (request) => notFound(await store.planCandidate(idSchema.parse(request.params).id)));
  server.post<{ Params: Params }>(`${prefix}/candidates/:id/select`, async (request) => notFound(await store.selectCandidate(idSchema.parse(request.params).id)));
  server.post<{ Params: Params }>(`${prefix}/candidates/:id/reject`, async (request) => notFound(await store.rejectCandidate(idSchema.parse(request.params).id, body(request.body, rejectSchema).reason)));

  server.get(`${prefix}/videos`, async (request) => store.listVideos(parsePage(request.query)));
  server.post(`${prefix}/videos`, async (request) => { if (controls.stopRendering) throw new AppError("RENDERING_STOPPED", "rendering is disabled by the global kill switch"); const input = body(request.body, videoSchema) as CreateVideoInput; rightsGate.assertCanRender({ rightsStatus: input.rightsStatus }); return store.createVideo(input); });
  server.get<{ Params: Params }>(`${prefix}/videos/:id`, async (request) => notFound(await store.getVideo(idSchema.parse(request.params).id)));
  server.post<{ Params: Params }>(`${prefix}/videos/:id/approve`, async (request) => notFound(await store.approveVideo(idSchema.parse(request.params).id)));
  server.post<{ Params: Params }>(`${prefix}/videos/:id/reject`, async (request) => notFound(await store.rejectVideo(idSchema.parse(request.params).id)));
  server.patch<{ Params: Params }>(`${prefix}/videos/:id`, async (request) => notFound(await store.updateVideo(idSchema.parse(request.params).id, body(request.body, videoMetadataSchema) as UpdateVideoInput)));
  server.post<{ Params: Params }>(`${prefix}/videos/:id/rerender`, async (request) => { if (controls.stopRendering) throw new AppError("RENDERING_STOPPED", "rendering is disabled by the global kill switch"); const id = idSchema.parse(request.params).id; const video = notFound(await store.getVideo(id)); rightsGate.assertCanRender({ rightsStatus: video.rightsStatus }); return notFound(await store.rerenderVideo(id)); });
  server.post<{ Params: Params }>(`${prefix}/videos/:id/render`, async (request) => { if (controls.stopRendering) throw new AppError("RENDERING_STOPPED", "rendering is disabled by the global kill switch"); const id = idSchema.parse(request.params).id; const video = notFound(await store.getVideo(id)); rightsGate.assertCanRender({ rightsStatus: video.rightsStatus }); return notFound(await store.rerenderVideo(id)); });

  server.get(`${prefix}/publications`, async (request) => store.listPublications(parsePage(request.query)));
  server.post(`${prefix}/publications`, async (request) => { if (controls.stopAllPublishing) throw new AppError("PUBLISHING_STOPPED", "publishing is disabled by the global kill switch"); const input = body(request.body, publicationSchema) as CreatePublicationInput; const video = notFound(await store.getVideo(input.videoId)); const channel = notFound(await store.getChannel(video.channelId)); if (video.status === "APPROVED") rightsGate.assertCanRender({ rightsStatus: video.rightsStatus }); else rightsGate.assertCanAutoPublish({ rightsStatus: video.rightsStatus }, channel); return store.createPublication(input); });
  server.post<{ Params: Params }>(`${prefix}/publications/:id/retry`, async (request) => { if (controls.stopAllPublishing) throw new AppError("PUBLISHING_STOPPED", "publishing is disabled by the global kill switch"); return notFound(await store.retryPublication(idSchema.parse(request.params).id)); });
  server.get(`${prefix}/costs`, async (request) => store.listCosts(parsePage(request.query)));
  server.post(`${prefix}/costs`, async (request) => store.createCost(body(request.body, costSchema) as CreateCostInput));
  server.get(`${prefix}/budgets`, async (request) => store.listBudgets(parsePage(request.query)));
  server.post(`${prefix}/budgets`, async (request) => store.createBudget(body(request.body, budgetSchema) as CreateBudgetInput));
  server.get(`${prefix}/costs/forecast`, async (request) => {
    const forecast = await costControl.getForecast(body(request.query, budgetKeySchema) as BudgetKey);
    if (forecast.forecastMonthEndEur > forecast.budgetEur * 1.1) {
      controls.stopPaidApis = true;
      forecast.warnings = [...new Set([...forecast.warnings, "PAID_APIS_AUTO_STOPPED"])];
    }
    return forecast;
  });
  server.post(`${prefix}/cost-control/reserve`, async (request) => { if (controls.stopPaidApis) { const input = body(request.body, reservationSchema) as ReservationRequest; if (input.amount > 0) throw new AppError("PAID_APIS_STOPPED", "paid API usage is disabled by the global kill switch"); } return costControl.reserve(body(request.body, reservationSchema) as ReservationRequest); });
  server.post<{ Params: Params }>(`${prefix}/cost-control/:id/release`, async (request) => { await costControl.release(idSchema.parse(request.params).id); return { status: "RELEASED" }; });
  server.post<{ Params: Params }>(`${prefix}/cost-control/:id/commit`, async (request) => { const input = body(request.body, commitSchema); const { actualAmount, ...cost } = input; return costControl.commit(idSchema.parse(request.params).id, actualAmount, cost); });
}

export function isRequestValidationError(error: unknown): error is ZodError { return error instanceof ZodError; }
