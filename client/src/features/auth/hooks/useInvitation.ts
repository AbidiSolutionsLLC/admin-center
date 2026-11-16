// Plan 2.2/2.3: verify an invitation link on page load and ask for a new one.
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export type InviteProblemCode = 'INVITE_EXPIRED' | 'INVITE_SUPERSEDED' | 'INVITE_ALREADY_USED' | 'INVITE_REVOKED' | 'INVITE_NOT_FOUND';

export type InviteVerifyResult =
  | { ok: true; email: string; full_name: string; company_name: string | null; kind: string }
  | { ok: false; code: InviteProblemCode; at?: string };

const PROBLEM_CODES: readonly string[] = ['INVITE_EXPIRED', 'INVITE_SUPERSEDED', 'INVITE_ALREADY_USED', 'INVITE_REVOKED', 'INVITE_NOT_FOUND'];
export const isInviteProblemCode = (code: unknown): code is InviteProblemCode => typeof code === 'string' && PROBLEM_CODES.includes(code);

// The page shows its own message for these answers, so the global error toast is switched off.
const quiet = { _skipErrorNotify: true } as Record<string, unknown>;

export const useVerifyInvite = (token: string) =>
  useQuery<InviteVerifyResult>({
    queryKey: ['invite-verify', token],
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      try {
        const { data } = await apiClient.post('/people/verify-invite', { token }, quiet);
        return { ok: true as const, ...data.data };
      } catch (err: any) {
        const code = err.response?.data?.code;
        if (isInviteProblemCode(code)) return { ok: false as const, code, at: err.response?.data?.data?.at };
        throw err; // network or server error: the page offers a retry
      }
    },
  });

/** Always resolves (the server answers 202 whatever happened). */
export const useRenewInvite = () =>
  useMutation({
    mutationFn: async (token: string) => {
      await apiClient.post('/people/renew-invite', { token }, quiet);
    },
  });
