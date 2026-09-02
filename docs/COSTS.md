# Costs

The monthly budget ceiling is configured with `MONTHLY_BUDGET_EUR` and defaults to €50. PHASE 3 provides `CostControlService` with `canSpend`, idempotent `reserve`, `commit`, `release`, `getRemainingBudget` and `getForecast`. Reservations are persisted in `cost_reservations` for PostgreSQL and enforce the hard stop before and during commit.

Forecast warnings are emitted at 50%, 75%, 90% and 100%, plus `BUDGET_FORECAST_WARNING` when projected month-end spend exceeds the configured budget. Paid provider adapters must reserve before executing and commit or release afterward.

When the projected month-end spend exceeds 110% of the configured budget, the API raises `PAID_APIS_AUTO_STOPPED` and the in-process operational control blocks new paid reservations with `PAID_APIS_STOPPED`. This decision is visible in the forecast response and does not stop dashboard, analytics or local media operations.
