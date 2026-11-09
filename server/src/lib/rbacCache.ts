// server/src/lib/rbacCache.ts
// WI-17: in-process RBAC cache with a bounded TTL. Entries expire after RBAC_CACHE_TTL_MS (default 30s), so
// role/group/department changes made by another instance (or a missed invalidation) apply within the TTL.

const DEFAULT_TTL_MS = 30_000;

class TtlMap<V> {
  private store = new Map<string, { value: V; expiresAt: number }>();
  constructor(private readonly ttlMs: () => number) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** True if a non-expired entry exists (a stored `null` counts as present). */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  set(key: string, value: V): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs() });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

export class RBACCache {
  private readonly ttl = () => {
    const configured = Number(process.env.RBAC_CACHE_TTL_MS);
    return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_TTL_MS;
  };

  // userId -> roleName
  private userRoles = new TtlMap<string>(this.ttl);
  // userId -> roleId
  private userRoleIds = new TtlMap<string>(this.ttl);
  // userId -> UserEffectivePermissions (generic to avoid circular imports)
  private userPermissions = new TtlMap<any>(this.ttl);
  // userId -> group ids
  private userGroups = new TtlMap<string[]>(this.ttl);
  // userId -> department id (null is a valid cached value)
  private userDepartments = new TtlMap<string | null>(this.ttl);

  getUserRole(userId: string): string | undefined {
    return this.userRoles.get(userId);
  }

  setUserRole(userId: string, roleName: string): void {
    this.userRoles.set(userId, roleName);
  }

  getUserRoleId(userId: string): string | undefined {
    return this.userRoleIds.get(userId);
  }

  setUserRoleId(userId: string, roleId: string): void {
    this.userRoleIds.set(userId, roleId);
  }

  getUserPermissions(userId: string): any | undefined {
    return this.userPermissions.get(userId);
  }

  setUserPermissions(userId: string, permissions: any): void {
    this.userPermissions.set(userId, permissions);
  }

  getUserGroups(userId: string): string[] | undefined {
    return this.userGroups.get(userId);
  }

  setUserGroups(userId: string, groupIds: string[]): void {
    this.userGroups.set(userId, groupIds);
  }

  getUserDepartment(userId: string): string | null | undefined {
    return this.userDepartments.has(userId) ? (this.userDepartments.get(userId) ?? null) : undefined;
  }

  setUserDepartment(userId: string, departmentId: string | null): void {
    this.userDepartments.set(userId, departmentId);
  }

  invalidateUser(userId: string): void {
    this.userRoles.delete(userId);
    this.userRoleIds.delete(userId);
    this.userPermissions.delete(userId);
    this.userGroups.delete(userId);
    this.userDepartments.delete(userId);
  }

  invalidateAll(): void {
    this.userRoles.clear();
    this.userRoleIds.clear();
    this.userPermissions.clear();
    this.userGroups.clear();
    this.userDepartments.clear();
  }
}

export const rbacCache = new RBACCache();
