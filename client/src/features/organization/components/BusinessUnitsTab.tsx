// src/features/organization/components/BusinessUnitsTab.tsx
import React, { useState, useMemo } from 'react';
import { Building2, Plus, Search, X, AlertTriangle, Users, Layers, Pencil } from 'lucide-react';
import { useBusinessUnits } from '../hooks/useBusinessUnits';
import { useBUTree } from '../hooks/useBUTree';
import { useCreateBU } from '../hooks/useCreateBU';
import { useUpdateDepartment } from '../hooks/useUpdateDepartment';
import { useDeleteBU } from '../hooks/useDeleteBU';
import { BUForm } from './BUForm';
import type { BUFormData } from './BUForm';
import { BUTreeView } from './BUTreeView';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import type { Department } from '@/types';

interface BusinessUnitWithCounts extends Department {
  dept_count: number;
  team_count: number;
}

interface BusinessUnitsTabProps {
  allDepartments: Department[];
}

/**
 * BusinessUnitsTab Component
 * Tab for managing Business Units with two views:
 * 1. List view: Shows all BUs with dept + team counts
 * 2. Tree view: Shows full hierarchy BU → Departments → Teams
 *
 * Features:
 * - Create BU with type locked to 'business_unit'
 * - Delete BU blocked if has child departments (409)
 * - All 4 states: loading, error, empty, data
 */
export const BusinessUnitsTab: React.FC<BusinessUnitsTabProps> = ({ allDepartments }) => {
  const { data: bus, isLoading, isError, refetch } = useBusinessUnits();
  const { data: buTree, isLoading: isTreeLoading } = useBUTree();

  const createMutation = useCreateBU();
  const updateMutation = useUpdateDepartment();
  const deleteMutation = useDeleteBU();

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingBU, setEditingBU] = useState<BusinessUnitWithCounts | null>(null);
  const [buToArchive, setBUToArchive] = useState<BusinessUnitWithCounts | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredBUs = useMemo(() => {
    if (!bus) return [];
    if (!searchQuery) return bus;
    const query = searchQuery.toLowerCase();
    return bus.filter(
      (bu) =>
        bu.name.toLowerCase().includes(query) ||
        bu.slug.toLowerCase().includes(query)
    );
  }, [bus, searchQuery]);

  const handleOpenCreate = () => {
    setEditingBU(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (bu: BusinessUnitWithCounts) => {
    setEditingBU(bu);
    setIsFormModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsFormModalOpen(false);
    setEditingBU(null);
  };

  const handleSubmit = (formData: BUFormData) => {
    const normalized = {
      name: formData.name,
      parent_id: formData.parent_id || null,
      primary_manager_id: formData.primary_manager_id || null,
      secondary_manager_id: formData.secondary_manager_id || null,
    };

    if (editingBU) {
      updateMutation.mutate(
        { id: editingBU._id, data: normalized },
        { onSuccess: handleCloseModal }
      );
    } else {
      createMutation.mutate(normalized, {
        onSuccess: handleCloseModal,
      });
    }
  };

  const handleRequestDelete = (bu: BusinessUnitWithCounts) => {
    setBUToArchive(bu);
  };

  const handleConfirmArchive = () => {
    if (!buToArchive) return;
    deleteMutation.mutate(buToArchive._id, {
      onSuccess: () => setBUToArchive(null),
      onError: () => setBUToArchive(null),
    });
  };

  if (isLoading) {
    return <TableSkeleton rows={6} columns={5} />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Failed to load Business Units"
        description="Something went wrong. Please try again."
        onRetry={refetch}
      />
    );
  }

  const hasData = bus && bus.length > 0;

  return (
    <div className="space-y-4">
      {/* Header with search and view toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <div className="relative w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search business units..."
              className="w-full h-9 pl-9 pr-8 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {searchQuery && (
            <span className="text-xs text-ink-muted">
              {filteredBUs.length} of {bus?.length ?? 0} results
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-surface-alt p-1 rounded-lg gap-1">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                viewMode === 'list'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-ink-secondary hover:text-ink'
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              List
            </button>
            <button
              onClick={() => setViewMode('tree')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                viewMode === 'tree'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-ink-secondary hover:text-ink'
              )}
            >
              <Building2 className="w-3.5 h-3.5" />
              Tree
            </button>
          </div>

          <Button
            onClick={handleOpenCreate}
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Business Unit
          </Button>
        </div>
      </div>

      {/* Content */}
      {!hasData ? (
        <EmptyState
          icon={Building2}
          title="No Business Units yet"
          description="Create your first Business Unit to organize your company hierarchy."
          action={{ label: 'Create First Business Unit', onClick: handleOpenCreate }}
        />
      ) : viewMode === 'tree' ? (
        isTreeLoading ? (
          <TableSkeleton rows={8} columns={5} />
        ) : buTree && buTree.length > 0 ? (
          <BUTreeView treeData={buTree} />
        ) : (
          <EmptyState
            icon={Building2}
            title="No hierarchy data available"
            description="Business Units exist but hierarchy data is unavailable."
          />
        )
      ) : (
        <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-base border-b border-line">
              <tr>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                  Business Unit
                </th>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                  Primary Manager
                </th>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-left">
                  Secondary Manager
                </th>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-center">
                  Departments
                </th>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-center">
                  Teams
                </th>
                <th className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredBUs.map((bu) => (
                <tr
                  key={bu._id}
                  className="border-b border-line last:border-0 hover:bg-surface-base cursor-pointer transition-colors duration-100"
                  onClick={() => handleOpenEdit(bu)}
                >
                  <td className="h-14 px-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-ink">{bu.name}</span>
                      <span className="text-xs text-ink-muted font-mono">{bu.slug}</span>
                    </div>
                  </td>
                  <td className="h-14 px-4">
                    {bu.primary_manager ? (
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {bu.primary_manager.avatar_url ? (
                            <img
                              src={bu.primary_manager.avatar_url}
                              className="w-full h-full rounded-full object-cover"
                              alt=""
                              width={28}
                              height={28}
                            />
                          ) : (
                            <span className="text-[10px] font-bold text-primary">
                              {typeof bu.primary_manager.full_name === 'string' 
                                ? bu.primary_manager.full_name.split(' ').map((n) => n[0]).join('')
                                : '?'}
                            </span>
                          )}
                        </div>
                        <span className="text-sm text-ink line-clamp-1">{bu.primary_manager.full_name}</span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
                        <AlertTriangle className="w-3 h-3" />
                        None
                      </span>
                    )}
                  </td>
                  <td className="h-14 px-4">
                    {bu.secondary_manager ? (
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {bu.secondary_manager.avatar_url ? (
                            <img
                              src={bu.secondary_manager.avatar_url}
                              className="w-full h-full rounded-full object-cover"
                              alt=""
                              width={28}
                              height={28}
                            />
                          ) : (
                            <span className="text-[10px] font-bold text-slate-500">
                              {typeof bu.secondary_manager.full_name === 'string'
                                ? bu.secondary_manager.full_name.split(' ').map((n) => n[0]).join('')
                                : '?'}
                            </span>
                          )}
                        </div>
                        <span className="text-sm text-ink-secondary line-clamp-1">{bu.secondary_manager.full_name}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-ink-muted italic">
                        Not assigned
                      </span>
                    )}
                  </td>
                  <td className="h-14 px-4 text-center">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary-light text-primary">
                      <Layers className="w-3 h-3" />
                      {bu.dept_count}
                    </span>
                  </td>
                  <td className="h-14 px-4 text-center">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-accent-light text-accent">
                      <Users className="w-3 h-3" />
                      {bu.team_count}
                    </span>
                  </td>
                  <td className="h-14 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(bu);
                        }}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-secondary hover:text-primary hover:bg-primary-light/50 transition-colors"
                        aria-label={`Edit ${bu.name}`}
                        title="Edit Business Unit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRequestDelete(bu);
                        }}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-secondary hover:text-red-600 hover:bg-red-50 transition-colors"
                        aria-label={`Archive ${bu.name}`}
                        title="Archive Business Unit"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={handleCloseModal}
        title={editingBU ? 'Edit Business Unit' : 'Create Business Unit'}
        description={
          editingBU
            ? 'Modify Business Unit settings.'
            : 'Add a new Business Unit to your organization structure.'
        }
        footer={
          <>
            <button
              type="button"
              onClick={handleCloseModal}
              disabled={createMutation.isPending}
              className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <Button
              form="bu-form"
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className={cn(
                'h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : editingBU
                ? 'Save Changes'
                : 'Create Business Unit'}
            </Button>
          </>
        }
      >
        <BUForm
          key={editingBU?._id ?? 'create'}
          initialData={editingBU ?? undefined}
          onSubmit={handleSubmit}
          departments={allDepartments}
          isSubmitting={createMutation.isPending}
        />
      </Modal>

      {/* Archive Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!buToArchive}
        onClose={() => setBUToArchive(null)}
        onConfirm={handleConfirmArchive}
        title={`Archive "${buToArchive?.name}"?`}
        description="This Business Unit will be soft-deleted (archived). It will fail if there are child departments. This action can be reversed by your system administrator."
        confirmLabel="Archive Business Unit"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};
