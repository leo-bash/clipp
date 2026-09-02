import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Budget, Cost } from "@shortfactory/shared";
import { BudgetExceededError } from "@shortfactory/shared";
import { costReservations, costs, schema } from "@shortfactory/database";

export interface BudgetKey { scope: string; scopeId: string; period: string; }
export interface ReservationRequest extends BudgetKey { idempotencyKey: string; amount: number; provider: string; service: string; operation: string; channelId?: string; candidateId?: string; videoId?: string; }
export interface BudgetSummary extends Budget { remainingEur: number; utilization: number; forecastMonthEndEur: number; warnings: string[]; }
export interface Reservation { id: string; idempotencyKey: string; budgetId: string; amount: number; status: "RESERVED" | "COMMITTED" | "RELEASED"; provider: string; service: string; operation: string; }

interface LedgerBudget extends BudgetKey { id: string; budgetEur: number; spentEur: number; reservedEur: number; warningThreshold: number; hardStop: boolean; createdAt: string; }
interface LedgerCost extends Cost { budgetId: string; }

export interface CostControlLedger {
  ensureBudget(input: BudgetKey & { budgetEur: number; warningThreshold: number; hardStop: boolean }): Promise<LedgerBudget>;
  getBudget(input: BudgetKey): Promise<LedgerBudget | undefined>;
  reserve(request: ReservationRequest & { budgetId: string }): Promise<Reservation | undefined>;
  commit(reservationId: string, actualAmount: number, cost: Omit<LedgerCost, "id" | "createdAt" | "actualCostEur" | "budgetId">): Promise<LedgerCost>;
  release(reservationId: string): Promise<void>;
}

const iso = (value: Date): string => value.toISOString();
const periodDays = (period: string): number => {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, month ?? 1, 0)).getUTCDate();
};

export class CostControlService {
  public constructor(private readonly ledger: CostControlLedger, private readonly defaults: { monthlyBudgetEur: number; warningLevels?: number[] } = { monthlyBudgetEur: 50 }, private readonly clock: () => Date = () => new Date()) {}

  public async canSpend(input: BudgetKey & { amount: number }): Promise<boolean> {
    if (input.amount < 0) return false;
    const budget = await this.ensureBudget(input);
    return !budget.hardStop || budget.spentEur + budget.reservedEur + input.amount <= budget.budgetEur;
  }

  public async reserve(request: ReservationRequest): Promise<Reservation> {
    if (request.amount < 0) throw new BudgetExceededError("cost amount cannot be negative");
    const budget = await this.ensureBudget(request);
    const reservation = await this.ledger.reserve({ ...request, budgetId: budget.id });
    if (!reservation) throw new BudgetExceededError(`budget exceeded for ${request.service}`);
    return reservation;
  }

  public async commit(reservationId: string, actualAmount: number, cost: Omit<LedgerCost, "id" | "createdAt" | "actualCostEur" | "budgetId">): Promise<LedgerCost> {
    if (actualAmount < 0) throw new BudgetExceededError("actual cost cannot be negative");
    return this.ledger.commit(reservationId, actualAmount, cost);
  }

  public async release(reservationId: string): Promise<void> { await this.ledger.release(reservationId); }

  public async getRemainingBudget(input: BudgetKey): Promise<number> {
    const budget = await this.ensureBudget(input);
    return Math.max(0, budget.budgetEur - budget.spentEur - budget.reservedEur);
  }

  public async getForecast(input: BudgetKey): Promise<BudgetSummary> {
    const budget = await this.ensureBudget(input);
    const current = this.clock();
    const elapsedDays = Math.max(1, Math.min(periodDays(input.period), current.getUTCDate()));
    const forecast = (budget.spentEur / elapsedDays) * periodDays(input.period);
    const utilization = budget.budgetEur === 0 ? 1 : (budget.spentEur + budget.reservedEur) / budget.budgetEur;
    const levels = this.defaults.warningLevels ?? [0.5, 0.75, 0.9, 1];
    const warnings = levels.filter((level) => utilization >= level).map((level) => level === 1 ? "BUDGET_HARD_STOP" : `BUDGET_WARNING_${Math.round(level * 100)}`);
    if (forecast > budget.budgetEur) warnings.push("BUDGET_FORECAST_WARNING");
    return { ...budget, remainingEur: Math.max(0, budget.budgetEur - budget.spentEur - budget.reservedEur), utilization, forecastMonthEndEur: forecast, warnings: [...new Set(warnings)] };
  }

  private async ensureBudget(input: BudgetKey): Promise<LedgerBudget> { return this.ledger.ensureBudget({ ...input, budgetEur: this.defaults.monthlyBudgetEur, warningThreshold: 0.75, hardStop: true }); }
}

export class InMemoryCostControlLedger implements CostControlLedger {
  private readonly budgets = new Map<string, LedgerBudget>();
  private readonly reservations = new Map<string, Reservation>();
  private readonly costs = new Map<string, LedgerCost>();

  public async ensureBudget(input: BudgetKey & { budgetEur: number; warningThreshold: number; hardStop: boolean }): Promise<LedgerBudget> {
    const key = `${input.scope}:${input.scopeId}:${input.period}`;
    const existing = this.budgets.get(key);
    if (existing) return existing;
    const created: LedgerBudget = { id: randomUUID(), ...input, spentEur: 0, reservedEur: 0, createdAt: new Date().toISOString() };
    this.budgets.set(key, created);
    return created;
  }
  public async getBudget(input: BudgetKey): Promise<LedgerBudget | undefined> { return this.budgets.get(`${input.scope}:${input.scopeId}:${input.period}`); }
  public async reserve(request: ReservationRequest & { budgetId: string }): Promise<Reservation | undefined> {
    const existing = this.reservations.get(request.idempotencyKey);
    if (existing) return existing;
    const budget = [...this.budgets.values()].find((candidate) => candidate.id === request.budgetId);
    if (!budget || (budget.hardStop && budget.spentEur + budget.reservedEur + request.amount > budget.budgetEur)) return undefined;
    budget.reservedEur += request.amount;
    const reservation: Reservation = { id: randomUUID(), idempotencyKey: request.idempotencyKey, budgetId: request.budgetId, amount: request.amount, status: "RESERVED", provider: request.provider, service: request.service, operation: request.operation };
    this.reservations.set(request.idempotencyKey, reservation);
    this.reservations.set(reservation.id, reservation);
    return reservation;
  }
  public async commit(reservationId: string, actualAmount: number, cost: Omit<LedgerCost, "id" | "createdAt" | "actualCostEur" | "budgetId">): Promise<LedgerCost> {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) throw new Error("reservation not found");
    if (reservation.status === "COMMITTED") { const existing = this.costs.get(reservation.id); if (existing) return existing; }
    const budget = [...this.budgets.values()].find((candidate) => candidate.id === reservation.budgetId);
    if (!budget) throw new Error("budget not found");
    if (budget.hardStop && budget.spentEur + actualAmount > budget.budgetEur) throw new BudgetExceededError("actual cost would exceed budget hard stop");
    budget.reservedEur = Math.max(0, budget.reservedEur - reservation.amount);
    budget.spentEur += actualAmount;
    reservation.status = "COMMITTED";
    const committed: LedgerCost = { ...cost, id: randomUUID(), actualCostEur: actualAmount, budgetId: budget.id, createdAt: new Date().toISOString() };
    this.costs.set(reservation.id, committed);
    return committed;
  }
  public async release(reservationId: string): Promise<void> { const reservation = this.reservations.get(reservationId); if (!reservation || reservation.status !== "RESERVED") return; const budget = [...this.budgets.values()].find((candidate) => candidate.id === reservation.budgetId); if (budget) budget.reservedEur = Math.max(0, budget.reservedEur - reservation.amount); reservation.status = "RELEASED"; }
}

type PgDb = NodePgDatabase<typeof schema>;

export class PostgresCostControlLedger implements CostControlLedger {
  public constructor(private readonly db: PgDb) {}
  public async ensureBudget(input: BudgetKey & { budgetEur: number; warningThreshold: number; hardStop: boolean }): Promise<LedgerBudget> { await this.db.insert(schema.budgets).values(input).onConflictDoNothing({ target: [schema.budgets.scope, schema.budgets.scopeId, schema.budgets.period] }); const [row] = await this.db.select().from(schema.budgets).where(and(eq(schema.budgets.scope, input.scope), eq(schema.budgets.scopeId, input.scopeId), eq(schema.budgets.period, input.period))); if (!row) throw new Error("budget could not be initialized"); return toBudget(row); }
  public async getBudget(input: BudgetKey): Promise<LedgerBudget | undefined> { const [row] = await this.db.select().from(schema.budgets).where(and(eq(schema.budgets.scope, input.scope), eq(schema.budgets.scopeId, input.scopeId), eq(schema.budgets.period, input.period))); return row ? toBudget(row) : undefined; }
  public async reserve(request: ReservationRequest & { budgetId: string }): Promise<Reservation | undefined> { return this.db.transaction(async (tx) => { const [existing] = await tx.select().from(costReservations).where(eq(costReservations.idempotencyKey, request.idempotencyKey)); if (existing) return toReservation(existing); const [budget] = await tx.update(schema.budgets).set({ reservedEur: sql`${schema.budgets.reservedEur} + ${request.amount}` }).where(and(eq(schema.budgets.id, request.budgetId), sql`(${schema.budgets.hardStop} = false OR ${schema.budgets.spentEur} + ${schema.budgets.reservedEur} + ${request.amount} <= ${schema.budgets.budgetEur})`)).returning(); if (!budget) return undefined; const [created] = await tx.insert(costReservations).values({ idempotencyKey: request.idempotencyKey, budgetId: request.budgetId, provider: request.provider, service: request.service, operation: request.operation, amountEur: request.amount }).returning(); return created ? toReservation(created) : undefined; }); }
  public async commit(reservationId: string, actualAmount: number, cost: Omit<LedgerCost, "id" | "createdAt" | "actualCostEur" | "budgetId">): Promise<LedgerCost> { return this.db.transaction(async (tx) => { const [reservation] = await tx.select().from(costReservations).where(eq(costReservations.id, reservationId)); if (!reservation) throw new Error("reservation not found"); if (reservation.status === "COMMITTED" && reservation.costId) { const [existing] = await tx.select().from(costs).where(eq(costs.id, reservation.costId)); if (existing) return toCost(existing, reservation.budgetId); } const [createdCost] = await tx.insert(costs).values({ provider: cost.provider, service: cost.service, operation: cost.operation, channelId: cost.channelId, candidateId: cost.candidateId, videoId: cost.videoId, quantity: cost.quantity, unit: cost.unit, estimatedCostEur: cost.estimatedCostEur, actualCostEur: actualAmount }).returning(); if (!createdCost) throw new Error("cost could not be recorded"); const [updatedBudget] = await tx.update(schema.budgets).set({ reservedEur: sql`${schema.budgets.reservedEur} - ${reservation.amountEur}`, spentEur: sql`${schema.budgets.spentEur} + ${actualAmount}` }).where(and(eq(schema.budgets.id, reservation.budgetId), sql`(${schema.budgets.hardStop} = false OR ${schema.budgets.spentEur} + ${actualAmount} <= ${schema.budgets.budgetEur})`)).returning(); if (!updatedBudget) throw new BudgetExceededError("actual cost would exceed budget hard stop"); await tx.update(costReservations).set({ status: "COMMITTED", costId: createdCost.id, updatedAt: new Date() }).where(eq(costReservations.id, reservationId)); return toCost(createdCost, reservation.budgetId); }); }
  public async release(reservationId: string): Promise<void> { await this.db.transaction(async (tx) => { const [reservation] = await tx.select().from(costReservations).where(eq(costReservations.id, reservationId)); if (!reservation || reservation.status !== "RESERVED") return; await tx.update(schema.budgets).set({ reservedEur: sql`${schema.budgets.reservedEur} - ${reservation.amountEur}` }).where(eq(schema.budgets.id, reservation.budgetId)); await tx.update(costReservations).set({ status: "RELEASED", updatedAt: new Date() }).where(eq(costReservations.id, reservationId)); }); }
}

export function createPostgresCostControlLedger(pool: Pool): PostgresCostControlLedger { return new PostgresCostControlLedger(drizzle(pool, { schema })); }

function toBudget(row: typeof schema.budgets.$inferSelect): LedgerBudget { return { id: row.id, scope: row.scope, scopeId: row.scopeId, period: row.period, budgetEur: row.budgetEur, spentEur: row.spentEur, reservedEur: row.reservedEur, warningThreshold: row.warningThreshold, hardStop: row.hardStop, createdAt: iso(row.createdAt) }; }
function toReservation(row: typeof costReservations.$inferSelect): Reservation { return { id: row.id, idempotencyKey: row.idempotencyKey, budgetId: row.budgetId, amount: row.amountEur, status: row.status as Reservation["status"], provider: row.provider, service: row.service, operation: row.operation }; }
function toCost(row: typeof costs.$inferSelect, budgetId: string): LedgerCost { return { id: row.id, provider: row.provider, service: row.service, operation: row.operation, channelId: row.channelId ?? undefined, candidateId: row.candidateId ?? undefined, videoId: row.videoId ?? undefined, quantity: row.quantity, unit: row.unit, estimatedCostEur: row.estimatedCostEur, actualCostEur: row.actualCostEur ?? undefined, createdAt: iso(row.createdAt), budgetId }; }
