// Store-aware session helpers: token storage, profile load, refresh and proactive renewal.
import axios from 'axios';
import { useAuthStore } from '@/store/useAuthStore';
import { refreshTokens, type TokenSet } from '@/lib/oidc';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5000/api/v1`;
const RENEW_BEFORE_MS = 60_000;

let renewTimer: ReturnType<typeof setTimeout> | null = null;

export function storeTokens(t: TokenSet): void {
  const prev = useAuthStore.getState().refreshToken;
  useAuthStore.getState().setAuth({
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? prev,
    expiresAt: Date.now() + t.expires_in * 1000,
  });
  scheduleRenew();
}

export function clearSession(): void {
  if (renewTimer) clearTimeout(renewTimer);
  renewTimer = null;
  useAuthStore.getState().clearAuth();
}

// Shares one in-flight promise (via refreshTokens) and resolves to the new access token.
export async function refreshSession(): Promise<string> {
  const rt = useAuthStore.getState().refreshToken;
  if (!rt) throw new Error('No refresh token');
  const t = await refreshTokens(rt);
  storeTokens(t);
  return t.access_token;
}

export function scheduleRenew(): void {
  if (renewTimer) clearTimeout(renewTimer);
  const { expiresAt } = useAuthStore.getState();
  if (!expiresAt) return;
  const delay = Math.max(expiresAt - Date.now() - RENEW_BEFORE_MS, 0);
  renewTimer = setTimeout(() => {
    refreshSession().catch(() => {
      // The next API call will 401 and take the normal re-login path.
    });
  }, delay);
}

export async function loadProfile(accessToken: string): Promise<void> {
  const { data } = await axios.get(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const u = data.data.user;
  useAuthStore.getState().setAuth({
    companyId: u.company_id,
    userRole: u.role,
    userId: u._id,
    userEmail: u.email,
    userName: u.full_name,
  });
}
