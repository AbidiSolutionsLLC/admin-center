# Platform API: data model

Collections the event feed and the product registry use. All are owned by Admin; the products backend never writes them directly (it publishes manifests and role catalogs through the API). Tenant key: `org_id` on events and cursors (the organisation's `_id`); `ProductRole`, `App` (system rows) and leases are global.

## Collections

| Model / collection | Key fields | File |
|---|---|---|
| `PlatformEvent` (`platformevents`) | `id` (`evt_<uuid>`), `type`, `version` (1), `occurred_at`, `org_id`, `seq`, `subject {type, id}`, `actor {type: member/operator/system, id}`, `correlation_id`, `data` | `server/src/models/PlatformEvent.model.ts`; unique (`org_id`, `seq`); **TTL 30 days** on `occurred_at` |
| `OrgEventCounter` | `_id` = org id, `seq` | `OrgEventCounter.model.ts` |
| `PlatformEventSubscription` | `name` (unique), `url`, `secret_ref` (env var name), `status` (`active`/`paused`) | `PlatformEventSubscription.model.ts` |
| `SubscriptionCursor` | `subscription_id`, `org_id`, `last_nudged_seq`, `last_acknowledged_seq`, `last_error`, `last_nudged_at`, `attempts`, `next_attempt_at` | `SubscriptionCursor.model.ts` |
| `PlatformLease` | `_id` = lease name, `holder`, `until` | `PlatformLease.model.ts` |
| `ProductRole`, `App` | catalog rows; `App.role_catalog_version`, `App.default_role_key` | `../admin-center/DATA-MODEL.md` |
| `Session` | revocation feed source | `../identity/DATA-MODEL.md` |

## Rules

| Rule | Detail |
|---|---|
| Sequence | `seq` per organisation comes from `OrgEventCounter` (`$inc` in the caller's transaction); unique index (`org_id`, `seq`); no gap on rollback |
| Retention | `PlatformEvent` TTL 30 days on `occurred_at`. A subscriber further behind gets 410 `CURSOR_EXPIRED` and must resync through the read endpoints |
| Ownership | Events, counters, subscriptions, cursors and leases: Admin only. Products keep their own projections (`MemberAccess` and others) in their database |
| Soft delete | Not applicable; events are immutable |
