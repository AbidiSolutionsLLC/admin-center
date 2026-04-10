// src/pages/data-fields/DataFieldsPage.tsx
import { useState } from 'react';
import { Database, Plus } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import { useCustomFields } from '@/features/data-fields/hooks/useCustomFields';
import { useCreateCustomField } from '@/features/data-fields/hooks/useCreateCustomField';
import { useUpdateCustomField } from '@/features/data-fields/hooks/useUpdateCustomField';
import { CustomFieldTable } from '@/features/data-fields/components/CustomFieldTable';
import { CustomFieldForm, type CustomFieldFormData } from '@/features/data-fields/components/CustomFieldForm';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import type { CustomField, TargetObject } from '@/types';
import { cn } from '@/utils/cn';

const TARGET_OBJECTS: { value: TargetObject; label: string; description: string }[] = [
  { value: 'user', label: 'People', description: 'Add custom fields to user profiles and forms' },
  { value: 'department', label: 'Departments', description: 'Add custom fields to department records' },
  { value: 'policy', label: 'Policies', description: 'Add custom fields to policy documents' },
];

/**
 * DataFieldsPage Component
 * Main page for managing custom field definitions across different object types.
 *
 * Features:
 * - Field builder creates fields that immediately appear in forms
 * - Tabbed interface for People, Departments, Policies
 * - Full CRUD operations
 * - Drag-to-reorder support (UI ready, backend persists display_order)
 * - Field visibility enforcement
 * - All 4 states: loading, error, empty, data
 */
export default function DataFieldsPage() {
  // ── Target object tab state ──────────────────────────────────────────
  const [targetObject, setTargetObject] = useState<TargetObject>('user');

  // ── Server data ──────────────────────────────────────────────────────
  const { data: fields, isLoading, isError, refetch } = useCustomFields(targetObject);

  const createMutation = useCreateCustomField(targetObject);
  const updateMutation = useUpdateCustomField(targetObject);

  // ── Modal state ──────────────────────────────────────────────────────
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);

  // ── Handlers ─────────────────────────────────────────────────────────
  const openCreateModal = () => {
    setEditingField(null);
    setIsFormModalOpen(true);
  };

  const openEditModal = (field: CustomField) => {
    setEditingField(field);
    setIsFormModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsFormModalOpen(false);
    setEditingField(null);
  };

  const handleSubmit = async (data: CustomFieldFormData) => {
    if (editingField) {
      await updateMutation.mutateAsync({ id: editingField._id, input: data });
    } else {
      await createMutation.mutateAsync(data);
    }
    handleCloseModal();
  };

  // Trigger form submit from modal footer button
  const handleModalSubmit = () => {
    const submitBtn = document.getElementById('custom-field-form-submit') as HTMLButtonElement;
    submitBtn?.click();
  };

  // ── Loading state ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="h-7 w-40 bg-skeleton rounded animate-pulse" />
            <div className="h-4 w-64 bg-skeleton rounded animate-pulse mt-2" />
          </div>
          <div className="h-9 w-32 bg-skeleton rounded animate-pulse" />
        </div>
        <TableSkeleton rows={6} columns={6} />
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-ink">Data & Fields</h1>
            <p className="mt-0.5 text-sm text-ink-secondary">Manage custom fields for your organization</p>
          </div>
        </div>
        <ErrorState
          title="Failed to load custom fields"
          description="Something went wrong. Please try again."
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Data & Fields</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            Create and manage custom fields across your organization
          </p>
        </div>
        <Button onClick={openCreateModal} className="bg-primary hover:bg-primary-hover text-white">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Field
        </Button>
      </div>

      {/* Target object tabs */}
      <Tabs.Root value={targetObject} onValueChange={(v) => setTargetObject(v as TargetObject)}>
        <Tabs.List className="inline-flex items-center gap-1 bg-white border border-line rounded-md p-0.5">
          {TARGET_OBJECTS.map((obj) => (
            <Tabs.Trigger
              key={obj.value}
              value={obj.value}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded transition-colors',
                'data-[state=active]:bg-primary data-[state=active]:text-white',
                'data-[state=inactive]:text-ink-secondary hover:text-ink'
              )}
            >
              <Database className="w-3.5 h-3.5" />
              {obj.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>

      {/* Description for selected target */}
      <div className="text-sm text-ink-secondary">
        {TARGET_OBJECTS.find((o) => o.value === targetObject)?.description}
      </div>

      {/* Content */}
      {!fields?.length ? (
        <EmptyState
          title={`No custom fields for ${targetObject}s yet`}
          description={`Create your first custom field to extend ${targetObject} forms and records.`}
          icon={Database}
          action={{ label: 'Add Field', onClick: openCreateModal }}
        />
      ) : (
        <CustomFieldTable
          fields={fields}
          isLoading={isLoading}
          isError={isError}
          targetObject={targetObject}
          onEdit={openEditModal}
          refetch={refetch}
        />
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={handleCloseModal}
        title={editingField ? 'Edit Custom Field' : 'Create Custom Field'}
        description={editingField ? 'Update the field configuration.' : 'Add a new custom field to your forms.'}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button
              className="bg-primary hover:bg-primary-hover text-white"
              disabled={createMutation.isPending || updateMutation.isPending}
              onClick={handleModalSubmit}
            >
              {(createMutation.isPending || updateMutation.isPending)
                ? 'Saving...'
                : editingField
                ? 'Update Field'
                : 'Create Field'}
            </Button>
          </div>
        }
      >
        <CustomFieldForm
          initialData={editingField ?? undefined}
          onSubmit={handleSubmit}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
          fixedTargetObject={targetObject}
        />
      </Modal>
    </div>
  );
}
