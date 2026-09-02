# Daily orchestrator

`@shortfactory/orchestrator` is the scheduling boundary for the daily content run. It does not call providers or publish media itself.

## Inventory policy

- Active channels default to 6 unique videos/day.
- Three active channels therefore target 18 unique videos/day.
- The ready inventory target is two days: 36 videos.
- Fewer than 18 ready videos raises pipeline jobs to `HIGH` priority.
- More than 54 ready videos switches the run to `REDUCE` and emits no new work.

The input separates `readyByChannel` from `approvedOrScheduledByChannel`, so the daily publication target and the processing buffer are not conflated.

## Job safety

Every stage receives a batch payload containing the orchestration date, channel, target count, priority and correlation ID. The idempotency key is:

```text
{orchestrationDate}:{channelId}:{queue}
```

Redis/BullMQ uses that key as `jobId`; retries therefore cannot create another daily stage job. The queue applies three attempts and exponential backoff. The in-memory queue and idempotency store are deterministic test adapters.

## Scheduling

The worker is a process boundary and is intended to be triggered once per orchestration date by an external scheduler. It can be run locally with `QUEUE_MODE=mock`; production Compose configures Redis. Downstream workers remain independent so a failure in one stage does not duplicate or block unrelated channel/platform work.
