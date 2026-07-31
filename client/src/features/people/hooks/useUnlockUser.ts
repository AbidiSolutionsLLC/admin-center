import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

interface UnlockUserResponse {
  success: boolean;
  message: string;
}

export const useUnlockUser = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<UnlockUserResponse>(`/people/${userId}/unlock`);
      return data;
    },
    onSuccess: () => {
      // Invalidate the user detail query so it refreshes the locked status
      queryClient.invalidateQueries({ queryKey: ['user', userId] });
    },
  });
};
