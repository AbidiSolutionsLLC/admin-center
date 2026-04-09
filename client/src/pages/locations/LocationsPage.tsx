// src/pages/locations/LocationsPage.tsx
import { useState } from 'react';
import { MapPin, Plus, List, FolderTree } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import { useLocations } from '@/features/locations/hooks/useLocations';
import { useLocationTree } from '@/features/locations/hooks/useLocationTree';
import { useCreateLocation } from '@/features/locations/hooks/useCreateLocation';
import { useUpdateLocation } from '@/features/locations/hooks/useUpdateLocation';
import { LocationTable } from '@/features/locations/components/LocationTable';
import { LocationHierarchy } from '@/features/locations/components/LocationHierarchy';
import { LocationForm, type LocationFormData } from '@/features/locations/components/LocationForm';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import type { Location } from '@/types';

/**
 * LocationsPage Component
 * Main page for managing the company's location hierarchy.
 *
 * Features:
 * - Full CRUD (create, read, update, delete) via REST hooks
 * - Table view / Hierarchy tree toggle
 * - IANA timezone with local time preview
 * - Headquarters flag (only one per company, validated at API)
 * - Delete blocked if users assigned (409 with count)
 * - All 4 states: loading, error, empty, data
 */
export default function LocationsPage() {
  // ── Server data ──────────────────────────────────────────────────────
  const { data: locations, isLoading, isError, refetch } = useLocations();
  const { data: treeData, isLoading: isTreeLoading } = useLocationTree();

  const createMutation = useCreateLocation();
  const updateMutation = useUpdateLocation();

  // ── View mode ────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'table' | 'tree'>('table');

  // ── Modal state ──────────────────────────────────────────────────────
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);

  // ── Handlers ─────────────────────────────────────────────────────────
  const openCreateModal = () => {
    setEditingLocation(null);
    setIsFormModalOpen(true);
  };

  const openEditModal = (loc: Location) => {
    setEditingLocation(loc);
    setIsFormModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsFormModalOpen(false);
    setEditingLocation(null);
  };

  const handleSubmit = async (data: LocationFormData) => {
    if (editingLocation) {
      await updateMutation.mutateAsync({ id: editingLocation._id, input: data });
    } else {
      await createMutation.mutateAsync(data);
    }
    handleCloseModal();
  };

  // Trigger form submit from modal footer button
  const handleModalSubmit = () => {
    const submitBtn = document.getElementById('location-form-submit') as HTMLButtonElement;
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
        <TableSkeleton rows={8} columns={6} />
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-ink">Locations</h1>
            <p className="mt-0.5 text-sm text-ink-secondary">Manage your company's location hierarchy</p>
          </div>
        </div>
        <ErrorState
          title="Failed to load locations"
          description="Something went wrong fetching location data. Please try again."
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
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Locations</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            Manage your company's location hierarchy (Region → Country → City → Office)
          </p>
        </div>
        <Button onClick={openCreateModal} className="bg-primary hover:bg-primary-hover text-white">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Location
        </Button>
      </div>

      {/* View mode tabs */}
      <Tabs.Root value={viewMode} onValueChange={(v) => setViewMode(v as 'table' | 'tree')}>
        <Tabs.List className="inline-flex items-center gap-1 bg-white border border-line rounded-md p-0.5">
          <Tabs.Trigger
            value="table"
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded transition-colors',
              'data-[state=active]:bg-primary data-[state=active]:text-white',
              'data-[state=inactive]:text-ink-secondary hover:text-ink'
            )}
          >
            <List className="w-3.5 h-3.5" />
            Table
          </Tabs.Trigger>
          <Tabs.Trigger
            value="tree"
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded transition-colors',
              'data-[state=active]:bg-primary data-[state=active]:text-white',
              'data-[state=inactive]:text-ink-secondary hover:text-ink'
            )}
          >
            <FolderTree className="w-3.5 h-3.5" />
            Hierarchy
          </Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>

      {/* Content */}
      {!locations?.length ? (
        <EmptyState
          title="No locations yet"
          description="Add your first region, country, city, or office to get started."
          icon={MapPin}
          action={{ label: 'Add Location', onClick: openCreateModal }}
        />
      ) : viewMode === 'table' ? (
        <LocationTable
          locations={locations}
          isLoading={isLoading}
          isError={isError}
          onEdit={openEditModal}
          refetch={refetch}
        />
      ) : (
        <div className="bg-white rounded-lg border border-line shadow-card p-5">
          {isTreeLoading ? (
            <TableSkeleton rows={8} columns={3} />
          ) : treeData?.length ? (
            <LocationHierarchy data={treeData} />
          ) : (
            <EmptyState
              title="No location hierarchy"
              description="Add locations with parent relationships to build the tree."
              icon={FolderTree}
            />
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={handleCloseModal}
        title={editingLocation ? 'Edit Location' : 'Create Location'}
        description={editingLocation ? 'Update the location details.' : 'Add a new location to your hierarchy.'}
        size="lg"
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
              {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : (editingLocation ? 'Update Location' : 'Create Location')}
            </Button>
          </div>
        }
      >
        <LocationForm
          initialData={editingLocation ?? undefined}
          onSubmit={handleSubmit}
          locations={locations ?? []}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />
      </Modal>
    </div>
  );
}
