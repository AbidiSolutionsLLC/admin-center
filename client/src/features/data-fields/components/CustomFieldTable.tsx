// src/features/data-fields/components/CustomFieldTable.tsx
import React, { useState, useMemo, useCallback } from 'react';
import { GripVertical, Edit2, Trash2, Lock, Plus, History, ShieldCheck, Link2, ArrowRightLeft } from 'lucide-react';
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  DragOverlay,
  closestCenter,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { useDeleteCustomField } from '../hooks/useDeleteCustomField';
import { useClearFieldData } from '../hooks/useClearFieldData';
import { useReorderCustomFields } from '../hooks/useReorderCustomFields';
import { useFieldUsage } from '../hooks/useFieldUsage';
import { useDependencyMap } from '../hooks/useDependencyMap';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { cn } from '@/utils/cn';
import type { CustomField, TargetObject, ValidationRules } from '@/types';

interface CustomFieldTableProps {
  fields: CustomField[];
  allFieldsCount: number;
  isLoading: boolean;
  isError: boolean;
  onEdit: (field: CustomField) => void;
  onAddField: () => void;
  onViewHistory: (field: CustomField) => void;
  refetch: () => void;
  targetObject: TargetObject;
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  boolean: 'Boolean',
  select: 'Select',
  multi_select: 'Multi Select',
  url: 'URL',
  email: 'Email',
  phone: 'Phone',
};

const VISIBILITY_LABELS: Record<string, string> = {
  all: 'Everyone',
  admin_only: 'Admins Only',
  role_specific: 'Specific Roles',
};

/**
 * Returns an array of validation rule summary labels for a field.
 * Used to show a compact summary in the table's Validation Rules column.
 * Memoized per-field to avoid recomputation on every render.
 */
function getValidationRuleBadges(field: CustomField): string[] {
  const badges: string[] = [];
  const rules = field.validation_rules as ValidationRules | undefined;

  if (field.required || rules?.required) {
    badges.push('Required');
  }
  if (rules?.pattern) {
    badges.push('Regex');
  }
  if (rules?.min !== undefined || rules?.max !== undefined) {
    const parts: string[] = [];
    if (rules.min !== undefined) parts.push(`≥${rules.min}`);
    if (rules.max !== undefined) parts.push(`≤${rules.max}`);
    badges.push(parts.join(' '));
  }
  if (rules?.min_length !== undefined || rules?.max_length !== undefined) {
    const parts: string[] = [];
    if (rules.min_length !== undefined) parts.push(`${rules.min_length}+ chars`);
    if (rules.max_length !== undefined) parts.push(`≤${rules.max_length} chars`);
    badges.push(parts.join(' '));
  }
  return badges;
}

/**
 * Returns the total dependency count for a field from the dependency map.
 * Used to show a compact dependency badge in the table.
 */
function getDependencyInfo(
  fieldId: string,
  dependencyMap?: Array<{ fieldId: string; outgoingDeps: number; incomingDeps: number; conditionalDeps: number; workflowDeps: number }>
): { total: number; incoming: number; outgoing: number; hasAny: boolean } {
  if (!dependencyMap) return { total: 0, incoming: 0, outgoing: 0, hasAny: false };
  const entry = dependencyMap.find((e) => e.fieldId === fieldId);
  if (!entry) return { total: 0, incoming: 0, outgoing: 0, hasAny: false };
  const total = entry.incomingDeps + entry.conditionalDeps + entry.workflowDeps;
  return {
    total,
    incoming: entry.incomingDeps,
    outgoing: entry.outgoingDeps,
    hasAny: total > 0 || entry.outgoingDeps > 0,
  };
}

/**
 * Threshold at which the table switches to a condensed layout
 * to maintain rendering performance with large field sets.
 */
const LARGE_LIST_THRESHOLD = 50;

/**
 * DragHandle Component
 * Provides the drag handle for a single table row using dnd-kit.
 */
const DragHandle: React.FC<{ id: string; disabled?: boolean }> = ({ id, disabled }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
  });

  const style: React.CSSProperties | undefined = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        position: 'relative' as const,
        zIndex: isDragging ? 999 : undefined,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <button
        type="button"
        className={cn(
          'h-6 w-6 flex items-center justify-center rounded cursor-grab hover:bg-surface-alt text-ink-muted',
          'active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
          isDragging && 'opacity-50',
        )}
        title="Drag to reorder"
        disabled={disabled}
      >
        <GripVertical className="w-4 h-4" />
      </button>
    </div>
  );
};

interface FieldRowProps {
  field: CustomField;
  dependencyMap?: Array<{ fieldId: string; outgoingDeps: number; incomingDeps: number; conditionalDeps: number; workflowDeps: number }>;
  isCondensed: boolean;
  onEdit: (field: CustomField) => void;
  onViewHistory: (field: CustomField) => void;
  onDelete: (fieldId: string) => void;
  isDeletePending: boolean;
  isReorderPending: boolean;
}

/**
 * Memoized table row component for a single custom field.
 * Prevents re-rendering the entire table when only one field changes.
 */
const FieldRow = React.memo<FieldRowProps>(({
  field,
  dependencyMap,
  isCondensed,
  onEdit,
  onViewHistory,
  onDelete,
  isDeletePending,
  isReorderPending,
}) => {
  const depInfo = useMemo(() => getDependencyInfo(field._id, dependencyMap), [field._id, dependencyMap]);
  const validationBadges = useMemo(() => getValidationRuleBadges(field), [field]);

  return (
    <tr
      className={cn(
        'border-b border-line last:border-0 hover:bg-surface-base transition-colors duration-100',
        isCondensed && 'h-10'
      )}
    >
      <td className={cn('px-4', isCondensed ? 'py-2' : 'py-3')}>
        {!field.is_system_field && (
          <DragHandle
            id={field._id}
            disabled={isReorderPending}
          />
        )}
      </td>
      <td className={cn('px-4 text-sm font-mono text-ink', isCondensed ? 'py-2' : 'py-3')}>
        <div className="flex items-center gap-1.5">
          {field.name}
          {field.is_system_field && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
              <Lock className="w-2.5 h-2.5" />
              System
            </span>
          )}
        </div>
      </td>
      <td className={cn('px-4 text-sm text-ink', isCondensed ? 'py-2' : 'py-3')}>{field.label}</td>
      <td className={cn('px-4', isCondensed ? 'py-2' : 'py-3')}>
        <span className="inline-flex items-center text-[11px] font-semibold border rounded-full px-2.5 py-0.5 bg-accent-light text-accent border-accent/20">
          {FIELD_TYPE_LABELS[field.field_type]}
        </span>
      </td>
      {!isCondensed && (
        <td className="px-4 py-3 text-sm text-ink-secondary">
          {VISIBILITY_LABELS[field.visibility]}
        </td>
      )}
      {!isCondensed && (
        <td className="px-4 py-3">
          {validationBadges.length === 0 ? (
            <span className="text-sm text-ink-muted">None</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {validationBadges.map((badge, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200"
                >
                  <ShieldCheck className="w-2.5 h-2.5" />
                  {badge}
                </span>
              ))}
            </div>
          )}
        </td>
      )}
      {!isCondensed && (
        <td className="px-4 py-3">
          {!depInfo.hasAny ? (
            <span className="text-sm text-ink-muted">None</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {depInfo.incoming > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 border-amber-200">
                  <ArrowRightLeft className="w-2.5 h-2.5" />
                  {depInfo.incoming} dependenc{depInfo.incoming === 1 ? 'y' : 'ies'}
                </span>
              )}
              {depInfo.outgoing > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-2 py-0.5 bg-sky-50 text-sky-700 border-sky-200">
                  <Link2 className="w-2.5 h-2.5" />
                  {depInfo.outgoing} dependenc{depInfo.outgoing === 1 ? 'y' : 'ies'}
                </span>
              )}
            </div>
          )}
        </td>
      )}
      <td className={cn('px-4 text-sm text-right', isCondensed ? 'py-2' : 'py-3')}>
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => onViewHistory(field)}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-surface-alt text-ink-secondary transition-colors"
            title="View version history"
          >
            <History className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onEdit(field)}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-surface-alt text-ink-secondary transition-colors"
            title="Edit field"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          {field.is_system_field ? (
            <span
              className="h-7 w-7 flex items-center justify-center text-ink-muted cursor-not-allowed"
              title="System fields cannot be deleted"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </span>
          ) : (
            <button
              onClick={() => onDelete(field._id)}
              disabled={isDeletePending}
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-red-50 text-error transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Delete field"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});
FieldRow.displayName = 'FieldRow';

/**
 * CustomFieldTable Component
 * Displays all custom fields in a tabular format with drag-to-reorder support,
 * dependency-aware delete confirmation, and inline edit/delete actions.
 * Used on: DataFieldsPage.
 *
 * Performance: Uses React.memo on FieldRow and condenses columns when
 * field count exceeds LARGE_LIST_THRESHOLD (50) to keep the UI responsive.
 */
export const CustomFieldTable: React.FC<CustomFieldTableProps> = ({
  fields,
  allFieldsCount,
  isLoading,
  isError,
  onEdit,
  onAddField,
  onViewHistory,
  refetch,
  targetObject,
}) => {
  const deleteField = useDeleteCustomField();
  const clearFieldData = useClearFieldData();
  const reorderMutation = useReorderCustomFields(targetObject);
  const [deleteFieldId, setDeleteFieldId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const fieldUsage = useFieldUsage(deleteFieldId);
  const { data: dependencyMap } = useDependencyMap(targetObject);

  const isCondensed = allFieldsCount > LARGE_LIST_THRESHOLD;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = fields.findIndex((f) => f._id === active.id);
    const newIndex = fields.findIndex((f) => f._id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedFields = Array.from(fields);
    const [removed] = reorderedFields.splice(oldIndex, 1);
    reorderedFields.splice(newIndex, 0, removed);

    const newOrder = reorderedFields.map((f) => f._id);
    reorderMutation.mutate(newOrder);
  }, [fields, reorderMutation]);

  const fieldUsageData = fieldUsage.data;
  const hasDependents =
    fieldUsageData?.fieldDependencies.hasDependents ||
    fieldUsageData?.conditionalDependents.hasDependents ||
    fieldUsageData?.workflowDependencies.hasDependents;
  const hasData = fieldUsageData?.hasData ?? false;
  const dataRecordCount = fieldUsageData?.recordCount ?? 0;
  const workflowDeps = fieldUsageData?.workflowDependencies;

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteFieldId) return;
    if (hasDependents) {
      setDeleteFieldId(null);
      return;
    }

    // If field has data, clear it first before deleting
    if (hasData) {
      try {
        await clearFieldData.mutateAsync(deleteFieldId);
        // After clearing data, proceed with deletion
        await deleteField.mutateAsync(deleteFieldId);
      } catch {
        // Error toasts are handled by the individual hooks
      }
    } else {
      await deleteField.mutateAsync(deleteFieldId);
    }
    setDeleteFieldId(null);
  }, [deleteFieldId, hasDependents, hasData, clearFieldData, deleteField]);

  const handleDeleteRow = useCallback((fieldId: string) => {
    setDeleteFieldId(fieldId);
  }, []);

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
        icon={GripVertical}
        action={{ label: 'Add Field', onClick: onAddField }}
      />
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface-base">
          <p className="text-xs text-ink-muted">
            {fields.length} field{fields.length !== 1 ? 's' : ''} configured
            {allFieldsCount > fields.length && (
              <span className="ml-1.5 text-accent font-medium">
                ({allFieldsCount - fields.length} hidden by search)
              </span>
            )}
            {isCondensed && (
              <span className="ml-1.5 text-amber-600 font-medium">
                Condensed view for performance
              </span>
            )}
          </p>
          <button
            onClick={onAddField}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Field
          </button>
        </div>

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          collisionDetection={closestCenter}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-base border-b border-line">
                  <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left w-10" />
                  <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">
                    Field Name
                  </th>
                  <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">
                    Label
                  </th>
                  <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">
                    Type
                  </th>
                  {!isCondensed && (
                    <>
                      <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">
                        Visibility
                      </th>
                      <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">
                        Validation Rules
                      </th>
                      <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-left">
                        Dependencies
                      </th>
                    </>
                  )}
                  <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider px-4 py-2.5 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <FieldRow
                    key={field._id}
                    field={field}
                    dependencyMap={dependencyMap}
                    isCondensed={isCondensed}
                    onEdit={onEdit}
                    onViewHistory={onViewHistory}
                    onDelete={handleDeleteRow}
                    isDeletePending={deleteField.isPending}
                    isReorderPending={reorderMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <DragOverlay>
            {activeId ? (
              <div className="flex items-center gap-2 p-3 bg-white border border-line rounded-md shadow-modal opacity-90">
                <GripVertical className="w-4 h-4 text-ink-muted" />
                <span className="text-sm font-medium text-ink">
                  {fields.find((f) => f._id === activeId)?.label || 'Reordering...'}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

       {/* Delete Confirmation Dialog with Dependency & Data Usage Info */}
       <ConfirmDialog
         isOpen={deleteFieldId !== null}
         onClose={() => {
           setDeleteFieldId(null);
           fieldUsage.refetch();
         }}
         onConfirm={handleDeleteConfirm}
         title={
           hasDependents
             ? 'Cannot Delete Field'
             : hasData
             ? 'Delete Field With Data?'
             : 'Delete Custom Field?'
         }
         description={
           hasDependents
             ? [
                 `This field is referenced by other fields, conditional rules, or workflows:`,
                 ...(fieldUsageData?.fieldDependencies.dependentFields || []).map(
                   (d) => `${d.label} (field dependency)`,
                 ),
                 ...(fieldUsageData?.conditionalDependents.dependentFields || []).map(
                   (d) => `${d.label} (conditional rule)`,
                 ),
                 ...(workflowDeps?.dependentWorkflows || []).map(
                   (w) => `${w.name} — step "${w.stepName}" (workflow)`,
                 ),
                 `You must remove these references before deleting "${
                   fields.find((f) => f._id === deleteFieldId)?.label
                 }".`,
               ].join(' ')
             : hasData
             ? `This field has data in ${dataRecordCount} record${dataRecordCount !== 1 ? 's' : ''}. The data will be cleared before the field is deleted.`
             : `Are you sure you want to delete "${
                 fields.find((f) => f._id === deleteFieldId)?.label
               }"? Existing data will be preserved but hidden.`
         }
         confirmLabel={
           hasDependents
             ? 'Remove Dependencies First'
             : hasData
             ? 'Clear Data & Delete'
             : 'Delete Field'
         }
         cancelLabel="Cancel"
         variant={hasDependents ? 'warning' : 'danger'}
         isLoading={deleteField.isPending || clearFieldData.isPending}
       />
    </>
  );
};
