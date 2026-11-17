// Plan 04 C2: the invited operator's accept page. Public endpoints: no operator token is sent or needed.
import { useMutation, useQuery } from '@tanstack/react-query';
import { operatorApi } from './operatorApi';
import { isInviteProblemCode, type InviteProblemCode } from '@/features/auth/hooks/useInvitation';

export type OperatorInviteVerify =
  | { ok: true; email: string; full_name: string; roles: string[]; expires_at: string }
  | { ok: false; code: InviteProblemCode; at?: string };

export const useVerifyOperatorInvite = (token: string) =>
  useQuery<OperatorInviteVerify>({
    queryKey: ['operator-invite-verify', token],
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      try {
        const { data } = await operatorApi.post('/invite/verify', { token });
        return { ok: true as const, ...data.data };
      } catch (err: any) {
        const code = err.response?.data?.code;
        if (isInviteProblemCode(code)) return { ok: false as const, code, at: err.response?.data?.data?.at };
        throw err; // network or server error: the page offers a retry
      }
    },
  });

export const useAcceptOperatorInvite = () =>
  useMutation({
    mutationFn: async (p: { token: string; password: string }) => {
      const { data } = await operatorApi.post('/invite/accept', p);
      return data.data as { email: string; mfa_enrolment_required: boolean };
    },
  });
