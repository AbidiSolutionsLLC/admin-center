// server/src/platform/openItems.ts — Proxy open items across monolith products (07 §6, contract §2.1)
import { PlatformEventSubscription } from '../models/PlatformEventSubscription.model';
import { getProductsInternalToken } from './productsInternalToken';

export function getProductsBackendBaseUrl(): string | undefined {
  if (process.env.PRODUCTS_INTERNAL_URL) {
    return process.env.PRODUCTS_INTERNAL_URL.replace(/\/+$/, '');
  }
  const raw = process.env.PLATFORM_SUBSCRIPTIONS;
  if (raw) {
    try {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const sub = list.find((s: any) => s?.name === 'karbexa-products-backend') || list[0];
        if (sub?.url) {
          return new URL(sub.url).origin;
        }
      }
    } catch {
      // ignore JSON parse error
    }
  }
  return undefined;
}

export async function resolveProductsBaseUrl(): Promise<string | undefined> {
  const envBase = getProductsBackendBaseUrl();
  if (envBase) return envBase;
  try {
    const sub = await PlatformEventSubscription.findOne({ name: 'karbexa-products-backend', status: 'active' }).select('url').lean();
    if (sub?.url) {
      return new URL(sub.url).origin;
    }
  } catch {
    // ignore DB error
  }
  return undefined;
}

export interface ProductOpenItemsCounts {
  people: { pending_leave_requests: number; pending_approvals_as_manager: number };
  projects: { open_assigned_tasks: number; owned_projects: number };
  sign: { agreements_as_sender_pending: number; agreements_awaiting_signature: number };
  desk: { assigned_open_tickets: number };
}

export interface FetchOpenItemsOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  token?: string;
  timeoutMs?: number;
}

export async function fetchMemberOpenItems(
  orgId: string,
  memberId: string,
  opts: FetchOpenItemsOptions = {}
): Promise<{ ok: true; products: ProductOpenItemsCounts } | { ok: false; status: number; code: string; error: string }> {
  try {
    const baseUrl = opts.baseUrl ?? (await resolveProductsBaseUrl());
    if (!baseUrl) {
      return {
        ok: false,
        status: 503,
        code: 'PRODUCTS_UNAVAILABLE',
        error: 'Product open items temporarily unavailable',
      };
    }

    let token = opts.token;
    if (!token) {
      try {
        token = await getProductsInternalToken({ fetchImpl: opts.fetchImpl });
      } catch {
        return {
          ok: false,
          status: 503,
          code: 'PRODUCTS_UNAVAILABLE',
          error: 'Product open items temporarily unavailable',
        };
      }
    }

    const doFetch = opts.fetchImpl ?? fetch;
    const targetUrl = `${baseUrl}/api/v1/internal/members/${encodeURIComponent(memberId)}/open-items?org_id=${encodeURIComponent(orgId)}`;
    const timeoutMs = opts.timeoutMs ?? 5000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await doFetch(targetUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      return {
        ok: false,
        status: 503,
        code: 'PRODUCTS_UNAVAILABLE',
        error: 'Product open items temporarily unavailable',
      };
    }

    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { products?: ProductOpenItemsCounts } | ProductOpenItemsCounts;
    };

    const products = (body?.data && typeof body.data === 'object' && 'products' in body.data && body.data.products)
      ? (body.data.products as ProductOpenItemsCounts)
      : (body?.data as ProductOpenItemsCounts) || {
          people: { pending_leave_requests: 0, pending_approvals_as_manager: 0 },
          projects: { open_assigned_tasks: 0, owned_projects: 0 },
          sign: { agreements_as_sender_pending: 0, agreements_awaiting_signature: 0 },
          desk: { assigned_open_tickets: 0 },
        };

    return { ok: true, products };
  } catch {
    return {
      ok: false,
      status: 503,
      code: 'PRODUCTS_UNAVAILABLE',
      error: 'Product open items temporarily unavailable',
    };
  }
}
