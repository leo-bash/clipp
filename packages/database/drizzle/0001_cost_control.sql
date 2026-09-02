CREATE TABLE "cost_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"budget_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"service" text NOT NULL,
	"operation" text NOT NULL,
	"amount_eur" real NOT NULL,
	"status" text DEFAULT 'RESERVED' NOT NULL,
	"cost_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cost_reservations" ADD CONSTRAINT "cost_reservations_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_reservations" ADD CONSTRAINT "cost_reservations_cost_id_costs_id_fk" FOREIGN KEY ("cost_id") REFERENCES "public"."costs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cost_reservations_idempotency_unique" ON "cost_reservations" USING btree ("idempotency_key");