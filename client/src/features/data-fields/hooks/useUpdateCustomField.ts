// src/features/data-fields/hooks/useUpdateCustomField.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import type { CustomField, UpdateCustomFieldInput } from '@/types';

interface UpdateCustomFieldResponse {
  data: CustomField;
  rename_migration?: {
    old_slug: string;
    new_slug: string;
    records_migrated: number;
  };
  type_change?: {
    old_type: string;
    new_type: string;
    values_coerced: number;
    records_migrated: number;
  };
}

/**
 * Updates an existing custom field.
 * Used on: DataFieldsPage (field builder edit mode).
 * Invalidates custom field queries and shows toast on success.
 * When a rename or type change involves data migration, the toast will
 * report how many records were migrated.
 */
export const useUpdateCustomField = () => {
  const queryClient = useQueryClient();

  return useMutation<CustomField, Error, { id: string; input: UpdateCustomFieldInput }>({
    mutationFn: async ({ id, input }) => {
      const { data } = await apiClient.put<UpdateCustomFieldResponse>(`/data-fields/${id}`, input);
      // Store migration info on the returned object for the caller to use
      const field = data.data as CustomField & {
        _rename_migration?: UpdateCustomFieldResponse['rename_migration'];
        _type_change?: UpdateCustomFieldResponse['type_change'];
      };
      if (data.rename_migration) field._rename_migration = data.rename_migration;
      if (data.type_change) field._type_change = data.type_change;
      return field;
    },
    onSuccess: (field, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOM_FIELDS() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOM_FIELD_DETAIL(id) });

      const migrationMessages: string[] = [];
      if (field._rename_migration) {
        migrationMessages.push(
          `Migrated ${field._rename_migration.records_migrated} record(s) from "${field._rename_migration.old_slug}" to "${field._rename_migration.new_slug}"`,
        );
      }
      if (field._type_change) {
        migrationMessages.push(
          `Converted ${field._type_change.values_coerced} value(s) from ${field._type_change.old_type} to ${field._type_change.new_type} across ${field._type_change.records_migrated} record(s)`,
        );
      }

      if (migrationMessages.length > 0) {
        toast.success('Custom field updated with data migration', {
          description: migrationMessages.join('; '),
          duration: 8000,
        });
      } else {
        toast.success('Custom field updated successfully');
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update custom field. Please try again.');
    },
  });
};
