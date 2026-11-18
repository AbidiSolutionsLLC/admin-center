// Standalone portal registration hooks (DRD §8.2). Same axios instance and conventions as ../operatorApi.ts.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errMsg, operatorApi } from '../operatorApi';
import type { StandalonePortal } from './standaloneForm';

/** What `PUT /products/:key` returns: the registration, plus `client_secret` exactly once when one was just issued. */
export type RegisterResult = StandalonePortal & { client_secret?: string };
export interface RotateResult { client_id: string; client_secret: string; previous_secret_expires_at: string | null }

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['operator', 'standalone'] });
  qc.invalidateQueries({ queryKey: ['operator', 'catalogue'] });
};

export const useStandalonePortals = () =>
  useQuery({
    queryKey: ['operator', 'standalone'],
    queryFn: async () => ((await operatorApi.get('/products/standalone')).data.data ?? []) as StandalonePortal[],
  });

export const useRegisterStandalone = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, body }: { key: string; body: unknown }) => (await operatorApi.put(`/products/${encodeURIComponent(key)}`, body)).data.data as RegisterResult,
    onSuccess: (r) => { invalidate(qc); toast.success(`${r.name} saved`); },
    // The form shows field-level problems itself; the toast covers the rest (ROLE_IN_USE, MANIFEST_STALE, HOSTING_MODE_CONFLICT...).
    onError: (e) => toast.error(errMsg(e, 'Failed to save the portal')),
  });
};

export const useRotateSecret = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => (await operatorApi.post(`/products/${encodeURIComponent(key)}/rotate-secret`)).data.data as RotateResult,
    onSuccess: () => invalidate(qc),
    onError: (e) => toast.error(errMsg(e, 'Failed to rotate the secret')),
  });
};
