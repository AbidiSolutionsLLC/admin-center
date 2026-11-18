# Platform API: what the user sees

The Platform API has no user interface of its own: its callers are machines. Where people see its effects:

| Surface | Where | What |
|---|---|---|
| Products catalogue (read-only) | Command Center, `/operator/products` (`client/src/pages/operator/OperatorProductsPage.tsx`, `GET /operator/v1/products`) | Registered products: status, category, manifest version, roles, tenants active, suspended and restricted. Products register by manifest publish, not through this page |
| Platform health | Command Center, `/operator/health` (`OperatorHealthPage.tsx`, `GET /operator/v1/health` and `/health/sync`) | `event_dispatcher` (lease age, organisations not acknowledged), `products_api`, `products_worker`, and a per-organisation sync table (lag, parked events, last error) |
| Launcher | Admin Center top bar (`client/src/components/layout/AppLauncher.tsx`, `GET /api/v1/me/apps`) | Products the signed-in member may open |
| Announcement banner | Admin Center (`components/layout/AnnouncementBanner.tsx`) | Not carried to the products app: the Platform API proxy of the announcement is not built |

Planned (WS-C C-7): a "Register standalone portal" form on the Command Center Products page; see `../command-center/PRD.md` CMD-027. Pages, states and components: `../command-center/UI.md` and `../admin-center/UI.md`; design language `../../DESIGN.md`.
