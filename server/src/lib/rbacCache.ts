// server/src/lib/rbacCache.ts

class RBACCache {
  // Cache of user roles: userId -> roleName
  private userRoles = new Map<string, string>();

  // Cache of user permissions: userId -> UserEffectivePermissions (stored as generic to avoid circular imports)
  private userPermissions = new Map<string, any>();

  getUserRole(userId: string): string | undefined {
    return this.userRoles.get(userId);
  }

  setUserRole(userId: string, roleName: string): void {
    this.userRoles.set(userId, roleName);
  }

  getUserPermissions(userId: string): any | undefined {
    return this.userPermissions.get(userId);
  }

  setUserPermissions(userId: string, permissions: any): void {
    this.userPermissions.set(userId, permissions);
  }

  invalidateUser(userId: string): void {
    this.userRoles.delete(userId);
    this.userPermissions.delete(userId);
  }

  invalidateAll(): void {
    this.userRoles.clear();
    this.userPermissions.clear();
  }
}

export const rbacCache = new RBACCache();
