# Platform API: decisions

Append-only, newest last. Product-level decisions only; platform-wide decisions are in the meta repo `docs/DECISIONS.md`. Older reasoning: the git tag `docs-before-standard` of this repo and the meta repo `docs/architecture/05`, `06`.

| Date | ID | Context | Decision | Consequence | Decided by |
|---|---|---|---|---|---|
| 2026-11 | ARCH | Products must follow Admin without calling it per request | Pull-based feed: transactional outbox with a per-organisation sequence, signed nudges, read endpoints for resync | One products backend, no broker | Owner (meta `docs/architecture/01-TARGET-ARCHITECTURE.md`) |
| 2026-11-11 | DEP | Security advisories on the mail library | nodemailer 10 (semver-major) approved | | Owner |
| 2026-11-16 | S-1 | Product list was hard-coded | Products are data: `ProductKey` is a validated string; a manifest is published through `PUT /platform/v1/apps/:key/manifest` (additive; the role-catalog endpoint stays); Admin keeps seeding the four built-in products | `productRegistry.ts`, `productKeyGuard.test.ts` | Owner |
| 2026-11-16 | 1.3 | Manifest details not in the plan | `App` gained `launch_path` so a stale publish returns the stored manifest; no operator audit entry for a publish (no operator exists); `capabilities` validated and not stored; a new product key is accepted only from a client whose allow-list names it; manifest `category` is `core`, `work`, `it` or `talent` (built-ins: people talent, projects work, sign core, desk it) | | Plan |
| 2026-11-16 | 1.4, 1.5 | Literal product lists in code | Two literals stay on the gate's keep-list with reasons (products `routes/webRoutesMount.js`, `services/offboarding/playbookService.js`); Admin keeps `identity/config.ts` (default client allow-list). The products backend is plain JavaScript, so its check is `node --check` and a registry load | | Plan |
| 2026-11-17 | 7.1b | The Mongo-backed rate-limit store failed on every hit against a real database | `MongoRateLimitStore.increment` uses `updatePipeline: true` | `middleware/mongoRateLimitStore.ts` | Plan |
| 2026-11-18 | G2, G3, G7 (platform) | Standalone portals | Platform contracts win over the Assets PRD; product keys are the platform's (`people`, `projects`, `sign`, `desk`, `kb`, `assets`, `zyntrus`); portals sign in through Karbexa with a product role (WS-C). Role-in-token for standalone portals only is to be recorded as S-12 by WS-C | See meta `docs/DECISIONS.md` | Owner |
