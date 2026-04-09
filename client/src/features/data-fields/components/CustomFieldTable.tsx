// src/features/data-fields/components/CustomFieldTable.tsx
import React from 'react';
import { GripVertical, Edit2, Trash2 } from 'lucide-react';
import { useDeleteCustomField } from '../hooks/useDeleteCustomField';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import type { CustomField, TargetObject } from '@/types';
import { cn } from '@/utils/cn';

interface CustomFieldTableProps {
  fields: CustomField[];
  isLoading: boolean;
  isError: boolean;
  targetObject: TargetObject;
  onEdit: (field: CustomField) => void;
  refetch: () => void;
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  select: 'Select',
  multi_select: 'Multi Select',
  checkbox: 'Checkbox',
  textarea: 'Text Area',
};

const VISIBILITY_LABELS: Record<string, string> = {
  all: 'Everyone',
  admin_only: 'Admins Only',
  role_specific: 'Specific Roles',
};

/**
 * CustomFieldTable Component
 * Displays all custom fields in a tabular format with drag handles for reordering.
 * Used on: DataFieldsPage.
 */
export const CustomFieldTable: React.FC<CustomFieldTableProps> = ({
  fields,
  isLoading,
  isError,
  targetObject,
  onEdit,
  refetch,
}) => {
  const deleteField = useDeleteCustomField(targetObject);

  if (isLoading) {
    return <TableSkeleton rows={6} columns={6} />;
  }

  if (isError) {
    return <ErrorState onRetry={refetch} />;
  }

  if (!fields?.length) {
    return (
      <EmptyState
        title="No custom fields yet"
        description="Create your first custom field to extend your forms."
        icon={Edit2}
      />
    );
  }

  return (
    <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F7F8FA] border-b border-line">
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left w-10">
                {/* Drag handle column */}
              </th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">Field Name</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">Label</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">Type</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">Visibility</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">Required</th>
              <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr
                key={field._id}
                className="border-b border-line last:border-0 hover:bg-[#F7F8FA] transition-colors duration-100"
              >
                <td className="px-4 py-3">
                  <button
                    className="h-6 w-6 flex items-center justify-center rounded cursor-grab hover:bg-surface-alt text-ink-muted"
                    title="Drag to reorder"
                  >
                    <GripVertical className="w-4 h-4" />
                  </button>
                </td>
                <td className="px-4 py-3 text-sm font-mono text-ink">{field.name}</td>
                <td className="px-4 py-3 text-sm text-ink">{field.label}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center text-[11px] font-semibold border rounded-full px-2.5 py-0.5 bg-accent-light text-accent border-accent/20">
                    {FIELD_TYPE_LABELS[field.field_type]}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-ink-secondary">{VISIBILITY_LABELS[field.visibility]}</td>
                <td className="px-4 py-3 text-sm">
                  {field.required ? (
                    <span className="text-success font-medium">Yes</span>
                  ) : (
                    <span className="text-ink-muted">No</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit(field)}
                      className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-surface-alt text-ink-secondary transition-colors"
                      title="Edit field"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete "${field.label}"? Existing data will be preserved but hidden.`)) {
                          deleteField.mutate(field._id);
                        }
                      }}
                      disabled={deleteField.isPending}
                      className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-red-50 text-error transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Delete field"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
