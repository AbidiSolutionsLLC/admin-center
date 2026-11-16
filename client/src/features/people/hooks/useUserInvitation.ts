// Plan 2.4: invitation panel data for one member (state, sent, expiry, delivery) and its admin actions.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from 'sonner';

export type InvitationPanelState = 'pending' | 'expired' | 'accepted' | 'revoked' | 'superseded';

export interface UserInvitationInfo {
  invitation: null | {
    id: string;
    kind: string;
    state: InvitationPanelState;
    created_at: string;
    last_sent_at: string | null;
    sent_count: number;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
  };
  delivery: null | {
    status: 'queued' | 'sending' | 'sent' | 'failed';
    attempts: number;
    last_error: string | null;
    sent_at: string | null;
    queued_at: string;
  };
}

export const USER_INVITATION_KEY = (userId: string) => ['user-invitation', userId] as const;

// The panel shows its own states; a refused read (not a People manager) just hides the panel.
const quiet = { _skipErrorNotify: true } as Record<string, unknown>;

export const useUserInvitation = (userId: string, enabled = true) =>
  useQuery<UserInvitationInfo>({
    queryKey: USER_INVITATION_KEY(userId),
    enabled: enabled && !!userId,
    retry: false,
    queryFn: async () => {
      const { data } = await apiClient.get(`/people/${userId}/invitation`, quiet);
      return data.data;
    },
  });

export const useRevokeInvitation = (userId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiClient.post(`/people/${userId}/invitation/revoke`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USER_INVITATION_KEY(userId) });
      toast.success('Invitation revoked');
    },
  });
};

/** Issues a new invitation without e-mail and returns its link once (the previous link stops working). */
export const useCopyInviteLink = (userId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post(`/people/${userId}/resend-invite?copy=true`);
      return data.data.invite_link as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USER_INVITATION_KEY(userId) });
    },
  });
};
