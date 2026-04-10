// src/pages/organization/OrganizationPage.tsx
import { useState, useMemo } from 'react';
import { Building2, Plus, LayoutGrid, List, Search, ChevronDown, X, FolderTree, Activity, History } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import { useDepartments } from '@/features/organization/hooks/useDepartments';
import { useOrgTree } from '@/features/organization/hooks/useOrgTree';
import { useCreateDepartment } from '@/features/organization/hooks/useCreateDepartment';
import { useUpdateDepartment } from '@/features/organization/hooks/useUpdateDepartment';
import { useDeleteDepartment } from '@/features/organization/hooks/useDeleteDepartment';
import { DepartmentTable } from '@/features/organization/components/DepartmentTable';
import { OrgChartView } from '@/features/organization/components/OrgChartView';
import { DepartmentForm } from '@/features/organization/components/DepartmentForm';
import type { DepartmentFormData } from '@/features/organization/components/DepartmentForm';
import { BusinessUnitsTab } from '@/features/organization/components/BusinessUnitsTab';
import { OrgHealthTab } from '@/features/organization/components/OrgHealthTab';
import { OrgHistoryTab } from '@/features/organization/components/OrgHistoryTab';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IntelligenceBanner } from '@/components/ui/IntelligenceBanner';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import type { Department, DepartmentFilters, Insight } from '@/types';
import { useNavigate } from 'react-router-dom';

const DEPT_TYPE_OPTIONS: { value: Department['type'] | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'business_unit', label: 'Business Unit' },
  { value: 'division', label: 'Division' },
  { value: 'department', label: 'Department' },
  { value: 'team', label: 'Team' },
  { value: 'cost_center', label: 'Cost Center' },
];

/**
 * OrganizationPage Component
 * Main page for managing the organization's department hierarchy.
 *
 * Features:
 * - Full CRUD (create, read, update, archive) via REST hooks
 * - Table view / Org Chart toggle
 * - Search by name + filter by type + filter by status
 * - ConfirmDialog before archive
 * - Intelligence warning badges on flagged department rows
 * - All 4 states: loading, error, empty, data
 */
export default function OrganizationPage() {
  const navigate = useNavigate();

  // ── Server data ──────────────────────────────────────────────────────
  const { data: departments, isLoading, isError, refetch } = useDepartments();
  const { data: treeData, isLoading: isTreeLoading } = useOrgTree();

  const createMutation = useCreateDepartment();
  const updateMutation = useUpdateDepartment();
  const deleteMutation = useDeleteDepartment();

  // ── Modal state ────────────────────────────────────────────────────────
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);

  // ── Confirm-archive dialog state ───────────────────────────────────────
  const [departmentToArchive, setDepartmentToArchive] = useState<Department | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleNavigateToHealthRecord = (insight: Insight) => {
    if (insight.remediation_url) {
      navigate(insight.remediation_url);
    }
  };

  // ── Filters ────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<DepartmentFilters>({
    search: '',
    type: '',
    status: 'active',
  });

  // ── Derived: apply client-side filtering ──────────────────────────────
  const filteredDepartments = useMemo(() => {
    if (!departments) return [];
    return departments.filter((dept) => {
      const matchesSearch =
        !filters.search ||
        dept.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        dept.slug.toLowerCase().includes(filters.search.toLowerCase());

      const matchesType = !filters.type || dept.type === filters.type;

      // status is always 'active' from the API (is_active: true), but support 'inactive' for archived
      const matchesStatus =
        !filters.status ||
        (filters.status === 'active' ? dept.is_active : !dept.is_active);

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [departments, filters]);

  const activeFilterCount = [
    filters.search,
    filters.type,
    filters.status && filters.status !== 'active' ? filters.status : '',
  ].filter(Boolean).length;

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleOpenCreate = () => {
    setEditingDept(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (dept: Department) => {
    setEditingDept(dept);
    setIsFormModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsFormModalOpen(false);
    setEditingDept(null);
  };

  const handleSubmit = (formData: DepartmentFormData & { custom_fields?: Record<string, unknown> }) => {
    // Normalize empty strings → null for optional IDs
    const normalized = {
      ...formData,
      parent_id: formData.parent_id || null,
      primary_manager_id: formData.primary_manager_id || null,
      custom_fields: formData.custom_fields || {},
    };

    if (editingDept) {
      updateMutation.mutate(
        { id: editingDept._id, data: normalized },
        { onSuccess: handleCloseModal }
      );
    } else {
      createMutation.mutate(normalized, {
        onSuccess: handleCloseModal,
      });
    }
  };

  /** Opens the ConfirmDialog rather than window.confirm */
  const handleRequestDelete = (id: string) => {
    const dept = departments?.find((d) => d._id === id) ?? null;
    setDepartmentToArchive(dept);
  };

  const handleConfirmArchive = () => {
    if (!departmentToArchive) return;
    deleteMutation.mutate(departmentToArchive._id, {
      onSuccess: () => setDepartmentToArchive(null),
      onError: () => setDepartmentToArchive(null),
    });
  };

  // ── Render: Loading ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader onCreateClick={handleOpenCreate} />
        <TableSkeleton rows={8} columns={6} />
      </div>
    );
  }

  // ── Render: Error ──────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="space-y-5">
        <PageHeader onCreateClick={handleOpenCreate} />
        <ErrorState
          title="Failed to load departments"
          description="Something went wrong fetching your organization data. Please try again."
          onRetry={refetch}
        />
      </div>
    );
  }

  const hasData = departments && departments.length > 0;

  return (
    <div className="space-y-5">
      {/* ── Page Header ── */}
      <PageHeader
        onCreateClick={handleOpenCreate}
        departmentCount={departments?.length}
        warningCount={departments?.filter((d) => d.has_intelligence_flag).length}
      />

      {/* ── Intelligence Banner ── */}
      <IntelligenceBanner module="organization" />

      {/* ── Main Tabs: Departments | Business Units | Health | History ── */}
      <Tabs.Root defaultValue="departments" className="space-y-4">
        <Tabs.List className="flex bg-surface-alt p-1 rounded-lg gap-1 w-fit">
          <Tabs.Trigger
            value="departments"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md text-ink-secondary data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-sm transition-all"
          >
            <List className="w-4 h-4" />
            Departments
          </Tabs.Trigger>
          <Tabs.Trigger
            value="business-units"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md text-ink-secondary data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-sm transition-all"
          >
            <FolderTree className="w-4 h-4" />
            Business Units
          </Tabs.Trigger>
          <Tabs.Trigger
            value="health"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md text-ink-secondary data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-sm transition-all"
          >
            <Activity className="w-4 h-4" />
            Health
          </Tabs.Trigger>
          <Tabs.Trigger
            value="history"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md text-ink-secondary data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-sm transition-all"
          >
            <History className="w-4 h-4" />
            History
          </Tabs.Trigger>
        </Tabs.List>

        {/* Departments Tab */}
        <Tabs.Content value="departments" className="focus:outline-none">
          {!hasData ? (
            <EmptyState
              icon={Building2}
              title="No departments yet"
              description="Build your organization by creating the first business unit or department."
              action={{ label: 'Create First Department', onClick: handleOpenCreate }}
            />
          ) : (
            <Tabs.Root defaultValue="list">
              {/* ── Filter Bar + View Toggle ── */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {/* Filter bar */}
                <div className="flex items-center gap-2 flex-wrap flex-1 mb-4">
                  {/* Search */}
                  <div className="relative w-60">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
                    <input
                      type="text"
                      value={filters.search}
                      onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                      placeholder="Search departments..."
                      className="w-full h-9 pl-9 pr-8 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
                    />
                    {filters.search && (
                      <button
                        onClick={() => setFilters((f) => ({ ...f, search: '' }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                        aria-label="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Type filter */}
                  <div className="relative">
                    <select
                      value={filters.type}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          type: e.target.value as DepartmentFilters['type'],
                        }))
                      }
                      className="h-9 pl-3 pr-8 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 appearance-none cursor-pointer"
                    >
                      {DEPT_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
                  </div>

                  {/* Status filter */}
                  <div className="relative">
                    <select
                      value={filters.status}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          status: e.target.value as DepartmentFilters['status'],
                        }))
                      }
                      className="h-9 pl-3 pr-8 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 appearance-none cursor-pointer"
                    >
                      <option value="">All Status</option>
                      <option value="active">Active</option>
                      <option value="inactive">Archived</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
                  </div>

                  {/* Clear filters */}
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() =>
                        setFilters({ search: '', type: '', status: 'active' })
                      }
                      className="text-xs font-medium text-accent hover:text-accent-hover transition-colors"
                    >
                      Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
                    </button>
                  )}

                  {/* Result count */}
                  {filters.search || filters.type ? (
                    <span className="text-xs text-ink-muted">
                      {filteredDepartments.length} of {departments.length} results
                    </span>
                  ) : null}
                </div>

                {/* View toggle (right-aligned) */}
                <Tabs.List className="flex bg-surface-alt p-1 rounded-lg gap-1 flex-shrink-0">
                  <Tabs.Trigger
                    value="list"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md text-ink-secondary data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-sm transition-all"
                  >
                    <List className="w-3.5 h-3.5" />
                    Table
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="chart"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md text-ink-secondary data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-sm transition-all"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    Org Chart
                  </Tabs.Trigger>
                </Tabs.List>
              </div>

              {/* ── Table View ── */}
              <Tabs.Content value="list" className="focus:outline-none">
                {filteredDepartments.length === 0 ? (
                  <div className="bg-white rounded-lg border border-line shadow-card p-16 text-center">
                    <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center mx-auto mb-3">
                      <Search className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-sm font-semibold text-ink mb-1">No results found</h3>
                    <p className="text-sm text-ink-secondary">
                      Try adjusting your search or filter criteria.
                    </p>
                  </div>
                ) : (
                  <DepartmentTable
                    departments={filteredDepartments}
                    onEdit={handleOpenEdit}
                    onDelete={handleRequestDelete}
                  />
                )}
              </Tabs.Content>

              {/* ── Org Chart View ── */}
              <Tabs.Content
                value="chart"
                className="focus:outline-none bg-white rounded-lg border border-line shadow-card min-h-[600px] overflow-hidden"
              >
                {isTreeLoading ? (
                  <div className="flex items-center justify-center h-[600px]">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-ink-muted">Generating org tree…</p>
                    </div>
                  </div>
                ) : treeData && treeData.length > 0 ? (
                  <OrgChartView treeData={treeData} onNodeClick={handleOpenEdit} />
                ) : (
                  <div className="flex items-center justify-center h-[600px]">
                    <p className="text-sm text-ink-muted">No hierarchy data available.</p>
                  </div>
                )}
              </Tabs.Content>
            </Tabs.Root>
          )}
        </Tabs.Content>

        {/* Business Units Tab */}
        <Tabs.Content value="business-units" className="focus:outline-none">
          <BusinessUnitsTab allDepartments={departments ?? []} />
        </Tabs.Content>

        {/* Health Tab */}
        <Tabs.Content value="health" className="focus:outline-none">
          <OrgHealthTab onNavigateToRecord={handleNavigateToHealthRecord} />
        </Tabs.Content>

        {/* History Tab */}
        <Tabs.Content value="history" className="focus:outline-none">
          <OrgHistoryTab />
        </Tabs.Content>
      </Tabs.Root>

      {/* ── Create / Edit Modal ── */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={handleCloseModal}
        title={editingDept ? 'Edit Department' : 'Create Department'}
        description={
          editingDept
            ? 'Modify department settings and reporting lines.'
            : 'Add a new unit to the organization structure.'
        }
        footer={
          <>
            <button
              type="button"
              onClick={handleCloseModal}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <Button
              form="department-form"
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className={cn(
                'h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving…'
                : editingDept
                ? 'Save Changes'
                : 'Create Department'}
            </Button>
          </>
        }
      >
        <DepartmentForm
          key={editingDept?._id ?? 'create'}
          initialData={editingDept ?? undefined}
          onSubmit={handleSubmit}
          departments={departments ?? []}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />
      </Modal>

      {/* ── Archive (Delete) Confirm Dialog ── */}
      <ConfirmDialog
        isOpen={!!departmentToArchive}
        onClose={() => setDepartmentToArchive(null)}
        onConfirm={handleConfirmArchive}
        title={`Archive "${departmentToArchive?.name}"?`}
        description="This department will be soft-deleted (archived). It will no longer appear in the organization structure. This action can be reversed by your system administrator."
        confirmLabel="Archive Department"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface PageHeaderProps {
  onCreateClick: () => void;
  departmentCount?: number;
  warningCount?: number;
}

function PageHeader({ onCreateClick, departmentCount, warningCount }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">
          Organization Structure
        </h1>
        <div className="flex items-center gap-3 mt-0.5">
          <p className="text-sm text-ink-secondary">
            Manage your company hierarchy, departments, and teams.
          </p>
          {departmentCount !== undefined && (
            <span className="text-xs text-ink-muted">
              {departmentCount} {departmentCount === 1 ? 'department' : 'departments'}
            </span>
          )}
          {warningCount !== undefined && warningCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {warningCount} warning{warningCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
      <Button
        onClick={onCreateClick}
        className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors flex items-center gap-2 flex-shrink-0"
      >
        <Plus className="w-4 h-4" />
        Create Department
      </Button>
    </div>
  );
}
