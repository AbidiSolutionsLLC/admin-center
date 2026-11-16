// server/src/lib/productRegistry.ts — product keys are data: the registry is the set of App rows with app_type 'karbexa_product'.
import { App } from '../models/App.model';
import { AppError } from '../utils/AppError';

export const RESERVED_PRODUCT_KEY = 'admin';
const TTL_MS = 60_000;

export interface RegisteredProduct { product_key: string; name: string; app_id: string }

let cache: { at: number; rows: RegisteredProduct[] } | undefined;

/** Drop the in-process cache (after a seed or a manifest publish on this process). */
export function invalidateProductRegistry(): void { cache = undefined; }

/** Registered Karbexa products (system apps), cached 60 seconds in-process. 'admin' is never listed. */
export async function listProducts(): Promise<RegisteredProduct[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const apps = await App.find({
    app_type: 'karbexa_product', product_key: { $exists: true, $ne: RESERVED_PRODUCT_KEY }, company_id: { $exists: false },
  }).select('name product_key').sort({ product_key: 1 }).lean();
  const rows = apps.map(a => ({ product_key: a.product_key as string, name: a.name, app_id: String(a._id) }));
  cache = { at: Date.now(), rows };
  return rows;
}

export async function getProduct(key: string): Promise<RegisteredProduct | undefined> {
  return (await listProducts()).find(p => p.product_key === key);
}

/** Throws AppError 400 UNKNOWN_PRODUCT unless key is a registered product ('admin' is never assignable). */
export async function assertProductKey(key: string): Promise<string> {
  if (typeof key !== 'string' || !(await getProduct(key))) throw new AppError(`Unknown product: ${String(key)}`, 400, 'UNKNOWN_PRODUCT');
  return key;
}

export async function assertProductKeys(keys: string[]): Promise<string[]> {
  for (const k of keys) await assertProductKey(k);
  return keys;
}
