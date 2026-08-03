// src/pages/data-fields/DataFieldsPage.tsx
import { useState, useEffect, useCallback, useDeferredValue, useMemo, useRef } from 'react';
import { Database, Plus, Search } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import { useCustomFields } from '@/features/data-fields/hooks/useCustomFields';
import { useCreateCustomField } from '@/features/data-fields/hooks/useCreateCustomField';
import { useUpdateCustomField } from '@/features/data-fields/hooks/useUpdateCustomField';
import { useSeedDefaultFields } from '@/features/data-fields/hooks/useSeedDefaultFields';
import { CustomFieldTable } from '@/features/data-fields/components/CustomFieldTable';
import { FieldHistoryDialog } from '@/features/data-fields/components/FieldHistoryDialog';
import { CustomFieldForm, type CustomFieldFormData } from '@/features/data-fields/components/CustomFieldForm';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import type { CustomField, TargetObject, CreateCustomFieldInput } from '@/types';
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

  const createMutation = useCreateCustomField();
  const updateMutation = useUpdateCustomField();
  const seedDefaultsMutation = useSeedDefaultFields();

  // ── Auto-seed default fields when page loads with no fields ──────────
  // Use a ref to prevent duplicate seed calls for the same target object
  const seededTargetsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isLoading && !isError && fields && fields.length === 0 && !seededTargetsRef.current.has(targetObject)) {
      seededTargetsRef.current.add(targetObject);
      seedDefaultsMutation.mutate(targetObject);
    }
  }, [isLoading, isError, fields, targetObject, seedDefaultsMutation]);

  // ── Search state with deferred value for non-blocking UI ─────────────
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);

  const filteredFields = useMemo(() => {
    if (!fields) return [];
    if (!deferredSearch.trim()) return fields;
    const q = deferredSearch.toLowerCase();
    return fields.filter(
      (f) =>
        f.label.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        f.field_type.toLowerCase().includes(q)
    );
  }, [fields, deferredSearch]);

   // ── Modal state ──────────────────────────────────────────────────────
   const [isFormModalOpen, setIsFormModalOpen] = useState(false);
   const [editingField, setEditingField] = useState<CustomField | null>(null);
   const [historyField, setHistoryField] = useState<{ field: CustomField; fieldId: string } | null>(null);

  // ── Handlers (memoized to prevent child re-renders) ──────────────────
  const openCreateModal = useCallback(() => {
    setEditingField(null);
    setIsFormModalOpen(true);
  }, []);

  const openEditModal = useCallback((field: CustomField) => {
    setEditingField(field);
    setIsFormModalOpen(true);
  }, []);

  const openHistoryDialog = useCallback((field: CustomField) => {
    setHistoryField({ field, fieldId: field._id });
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsFormModalOpen(false);
    setEditingField(null);
  }, []);

  const handleSubmit = useCallback(async (data: CustomFieldFormData) => {
    const normalized: CreateCustomFieldInput = {
      name: data.name,
      field_type: data.field_type,
      target_object: data.target_object,
      label: data.label,
      placeholder: data.placeholder ?? null,
      description: data.description ?? null,
      required: data.required ?? false,
      default_value: data.default_value ?? null,
      select_options: data.select_options ?? null,
      validation_rules: data.validation_rules ?? null,
      visibility: data.visibility ?? 'all',
      visible_roles: Array.isArray(data.visible_roles) ? data.visible_roles : null,
      edit_visibility: data.edit_visibility ?? 'all',
      edit_visible_roles: Array.isArray(data.edit_visible_roles) ? data.edit_visible_roles : null,
      conditional_logic: data.conditional_logic ?? null,
      field_dependencies: data.field_dependencies ?? null,
      display_order: data.display_order ?? 0,
    };

    if (editingField) {
      await updateMutation.mutateAsync({ id: editingField._id, input: normalized });
    } else {
      await createMutation.mutateAsync(normalized);
    }
    handleCloseModal();
  }, [editingField, updateMutation, createMutation, handleCloseModal]);

  // Trigger form submit from modal footer button
  const handleModalSubmit = useCallback(() => {
    const submitBtn = document.getElementById('custom-field-form-submit') as HTMLButtonElement;
    submitBtn?.click();
  }, []);

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

      {/* Filter bar — search */}
      {fields && fields.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" />
            <input
              type="text"
              placeholder="Search fields..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-8 pr-4 text-sm rounded-md border border-line bg-white text-ink
                         placeholder:text-ink-muted
                         focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                         transition-all duration-150"
            />
          </div>
          {deferredSearch && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
            >
              Clear search
            </button>
          )}
        </div>
      )}

      {/* Content state handling */}
      {(isLoading || seedDefaultsMutation.isPending) ? (
        <TableSkeleton rows={6} columns={6} />
      ) : isError ? (
        <ErrorState
          title="Failed to load custom fields"
          description="Something went wrong. Please try again."
          onRetry={refetch}
        />
      ) : (
         <CustomFieldTable
           fields={filteredFields}
           allFieldsCount={fields?.length ?? 0}
           isLoading={isLoading}
           isError={isError}
           onEdit={openEditModal}
           onAddField={openCreateModal}
           onViewHistory={openHistoryDialog}
           refetch={refetch}
           targetObject={targetObject}
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
          availableFields={fields ?? []}
        />
     </Modal>

      <FieldHistoryDialog
        isOpen={!!historyField}
        onClose={() => setHistoryField(null)}
        fieldId={historyField?.fieldId ?? null}
        field={historyField?.field ?? null}
      />
    </div>
  );
}
