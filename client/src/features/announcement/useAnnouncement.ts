import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export interface TenantAnnouncement { message: string; severity: 'info' | 'warning' | 'critical'; ends_at: string }

/** The platform announcement (Plan 4.12). The server caches it 60 s, so polling once a minute is enough. */
export const useTenantAnnouncement = () =>
  useQuery({
    queryKey: ['announcement'],
    refetchInterval: 60_000,
    retry: false,
    queryFn: async () => ((await apiClient.get('/announcement')).data.data ?? null) as TenantAnnouncement | null,
  });
