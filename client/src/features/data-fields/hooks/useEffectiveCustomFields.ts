// src/features/data-fields/hooks/useEffectiveCustomFields.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { CustomField, TargetObject } from '@/types';

/**
 * A custom field as the requesting user is allowed to see it.
 * can_view / can_edit are resolved server-side from the user's roles
 * (story 108) and the applicable profile layout (story 111).
 */
export type EffectiveCustomField = CustomField & { can_view: boolean; can_edit: boolean };

export interface EffectiveCustomFieldsResult {
  fields: EffectiveCustomField[];
  layout_name: string | null;
  layout_id: string | null;
}

/**
 * Fetches the custom fields the current user may view/edit for a target object.
 * - targetObject: which object the fields are attached to (user/department/policy).
 * - recordRoleIds: role IDs of the record owner (used to pick the profile layout).
 * Used on: UserForm, DepartmentForm (dynamic form builders).
 */
export const useEffectiveCustomFields = (targetObject: TargetObject, recordRoleIds: string[] = []) => {
  return useQuery<EffectiveCustomFieldsResult>({
    queryKey: QUERY_KEYS.EFFECTIVE_CUSTOM_FIELDS(targetObject, recordRoleIds),
    queryFn: async () => {
      const params: Record<string, string> = { target_object: targetObject };
      if (recordRoleIds.length > 0) {
        params.role_ids = recordRoleIds.join(',');
      }
      const { data } = await apiClient.get('/data-fields/effective', { params });
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};
