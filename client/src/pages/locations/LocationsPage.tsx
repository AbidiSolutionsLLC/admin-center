// src/pages/locations/LocationsPage.tsx
import { useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MapPin, Plus, Layers, Building2, Search, X,
  Calendar, Clock, ChevronDown, Pencil, Trash2,
} from 'lucide-react';
import { useLocations } from '@/features/locations/hooks/useLocations';
import { useLocationTree } from '@/features/locations/hooks/useLocationTree';
import { useCreateLocation } from '@/features/locations/hooks/useCreateLocation';
import { useUpdateLocation } from '@/features/locations/hooks/useUpdateLocation';
import { LocationTable } from '@/features/locations/components/LocationTable';
import { LocationHierarchy } from '@/features/locations/components/LocationHierarchy';
import { LocationForm } from '@/features/locations/components/LocationForm';
import { useHolidayCalendars } from '@/features/holidays/hooks/useHolidayCalendars';
import { useHolidays } from '@/features/holidays/hooks/useHolidays';
import { useHolidayAssignments } from '@/features/holidays/hooks/useHolidayAssignments';
import { HolidayCalendarTable } from '@/features/holidays/components/HolidayCalendarTable';
import { HolidayCalendarForm } from '@/features/holidays/components/HolidayCalendarForm';
import { LocationCalendarAssignment } from '@/features/holidays/components/LocationCalendarAssignment';
import { HolidayForm } from '@/features/holidays/components/HolidayForm';
import { useWorkSchedules } from '@/features/work-schedules/hooks/useWorkSchedules';
import { WorkScheduleTable } from '@/features/work-schedules/components/WorkScheduleTable';
import { WorkScheduleForm } from '@/features/work-schedules/components/WorkScheduleForm';
import { WorkScheduleLocationAssignment } from '@/features/work-schedules/components/WorkScheduleLocationAssignment';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/utils/cn';
import { ROUTES } from '@/constants/routes';
import type { Location, HolidayCalendar, Holiday, WorkSchedule } from '@/types';
import type { HolidayCalendarFormData } from '@/types/holidays';
import type { HolidayFormData } from '@/types/holidays';
import type { WorkScheduleFormData } from '@/features/work-schedules/components/WorkScheduleForm';

const TABS = [
  { key: 'locations', label: 'Locations', icon: Layers },
  { key: 'holidays', label: 'Holiday Calendars', icon: Calendar },
  { key: 'work-schedules', label: 'Work Schedules', icon: Clock },
] as const;

export default function LocationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'locations';

  const setActiveTab = useCallback((tab: string) => {
    if (tab === 'locations') {
      setSearchParams({});
    } else {
      setSearchParams({ tab });
    }
  }, [setSearchParams]);

  return (
    <div className="space-y-6 page-enter">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>Locations</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Manage your company's location hierarchy, holiday calendars, and work schedules
          </p>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex p-1 rounded-xl gap-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', width: 'fit-content' }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-lg transition-all',
            )}
            style={
              activeTab === tab.key
                ? { background: 'rgba(245,176,42,0.12)', color: '#f5b02a' }
                : { color: '#94a3b8' }
            }
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'locations' && <LocationsTab />}
      {activeTab === 'holidays' && <HolidaysTab />}
      {activeTab === 'work-schedules' && <WorkSchedulesTab />}
    </div>
  );
}

function LocationsTab() {
  const navigate = useNavigate();
  const { data: locations, isLoading, isError, refetch } = useLocations();
  const { data: treeData, isLoading: isTreeLoading } = useLocationTree();
  const createMutation = useCreateLocation();
  const updateMutation = useUpdateLocation();

  const [viewMode, setViewMode] = useState<'table' | 'tree'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);

  const filteredLocations = useMemo(() => {
    if (!locations) return [];
    return locations.filter((loc) => {
      const nameMatch = loc.name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'all' || loc.type === typeFilter;
      return nameMatch && matchesType;
    });
  }, [locations, searchQuery, typeFilter]);

  const openCreateModal = () => { setEditingLocation(null); setIsFormModalOpen(true); };
  const openEditModal = (loc: Location) => { setEditingLocation(loc); setIsFormModalOpen(true); };
  const handleCloseModal = () => { setIsFormModalOpen(false); setEditingLocation(null); };

  const handleSubmit = async (data: any) => {
    if (editingLocation) {
      await updateMutation.mutateAsync({ id: editingLocation._id, input: data });
    } else {
      await createMutation.mutateAsync(data);
    }
    handleCloseModal();
  };

  const handleModalSubmit = () => {
    const btn = document.getElementById('location-form-submit') as HTMLButtonElement;
    btn?.click();
  };

  if (isLoading) {
    return (
      <div className="space-y-6 page-enter">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-7 w-40 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <div className="h-4 w-64 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
          </div>
          <div className="h-9 w-36 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
        </div>
        <TableSkeleton rows={8} columns={6} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <ErrorState title="Failed to load locations" description="Something went wrong fetching location data. Please try again." onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Locations toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex p-1 rounded-xl gap-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={() => setViewMode('table')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-all',
            )}
            style={viewMode === 'table' ? { background: 'rgba(245,176,42,0.12)', color: '#f5b02a' } : { color: '#94a3b8' }}
          >
            <Layers className="w-3.5 h-3.5" />
            List
          </button>
          <button
            onClick={() => setViewMode('tree')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-all')}
            style={viewMode === 'tree' ? { background: 'rgba(245,176,42,0.12)', color: '#f5b02a' } : { color: '#94a3b8' }}
          >
            <Building2 className="w-3.5 h-3.5" />
            Hierarchy
          </button>
        </div>

        <div className="flex items-center gap-3">
          {viewMode === 'table' && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Search locations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-9 pr-8 text-sm w-56"
                  style={{ borderRadius: '12px' }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: '#94a3b8' }}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-9 text-sm px-3"
                style={{ borderRadius: '12px', minWidth: '120px' }}
              >
                <option value="all">All Types</option>
                <option value="region">Region</option>
                <option value="country">Country</option>
                <option value="city">City</option>
                <option value="office">Office</option>
              </select>
            </>
          )}
          <button
            onClick={openCreateModal}
            className="btn-primary-glow flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold"
          >
            <Plus className="w-4 h-4" />
            Add Location
          </button>
        </div>
      </div>

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
          locations={filteredLocations}
          isLoading={isLoading}
          isError={isError}
          onEdit={openEditModal}
          onSelect={(loc) => navigate(ROUTES.LOCATION_DETAIL(loc._id))}
          refetch={refetch}
        />
      ) : (
        isTreeLoading ? (
          <TableSkeleton rows={8} columns={3} />
        ) : treeData?.length ? (
          <LocationHierarchy data={treeData} />
        ) : (
          <EmptyState
            title="No location hierarchy"
            description="Add locations with parent relationships to build the tree."
            icon={Building2}
          />
        )
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
            <button
              onClick={handleCloseModal}
              className="px-4 py-2 text-sm font-semibold rounded-xl transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#f8fafc' }}
            >
              Cancel
            </button>
            <button
              onClick={handleModalSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="btn-primary-glow px-4 py-2 text-sm font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : (editingLocation ? 'Update Location' : 'Create Location')}
            </button>
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

function HolidaysTab() {
  const [activeHolidayTab, setActiveHolidayTab] = useState<'calendars' | 'holidays'>('calendars');
  const [isCalendarFormModalOpen, setIsCalendarFormModalOpen] = useState(false);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [isHolidayFormModalOpen, setIsHolidayFormModalOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<HolidayCalendar | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [selectedCalendar, setSelectedCalendar] = useState<HolidayCalendar | null>(null);
  const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null);

  const {
    data: calendars,
    isLoading: isCalendarsLoading,
    isError: isCalendarsError,
    refetch: refetchCalendars,
    create: createCalendar,
    update: updateCalendar,
    isCreating: isCreatingCalendar,
    isUpdating: isUpdatingCalendar,
  } = useHolidayCalendars();

  const { data: locations } = useLocations();

  const {
    data: holidaysData,
    isLoading: isHolidaysLoading,
    isError: isHolidaysError,
    create: createHoliday,
    delete: deleteHoliday,
    isCreating: isCreatingHoliday,
  } = useHolidays({ calendarId: selectedCalendar?._id });

  const { create: createAssignment } = useHolidayAssignments();

  const handleCreateCalendar = () => {
    setEditingCalendar(null);
    setIsCalendarFormModalOpen(true);
  };

  const handleEditCalendar = (calendar: HolidayCalendar) => {
    setEditingCalendar(calendar);
    setIsCalendarFormModalOpen(true);
  };

  const handleCreateAssignment = (calendar: HolidayCalendar) => {
    setSelectedCalendar(calendar);
    setIsAssignmentModalOpen(true);
  };

  const handleCreateHoliday = () => {
    setSelectedHoliday(null);
    setIsHolidayFormModalOpen(true);
  };

  const handleEditHoliday = (holiday: Holiday) => {
    setSelectedHoliday(holiday);
    setIsHolidayFormModalOpen(true);
  };

  const handleDeleteHoliday = async (holiday: Holiday) => {
    if (!selectedCalendar) return;
    await deleteHoliday(holiday._id);
  };

  const closeCalendarFormModal = () => {
    setIsCalendarFormModalOpen(false);
    setEditingCalendar(null);
  };

  const closeAssignmentModal = () => {
    setIsAssignmentModalOpen(false);
    setSelectedLocation(null);
    setSelectedCalendar(null);
  };

  const closeHolidayFormModal = () => {
    setIsHolidayFormModalOpen(false);
    setSelectedHoliday(null);
  };

  const handleCalendarFormSubmit = async (data: HolidayCalendarFormData) => {
    if (editingCalendar) {
      await updateCalendar({ id: editingCalendar._id, input: { description: data.description, is_active: data.is_active } });
    } else {
      await createCalendar(data);
    }
    closeCalendarFormModal();
  };

  const handleAssignmentSubmit = async (data: { calendar_id: string; is_primary: boolean; effective_date: Date; expiry_date?: Date }) => {
    if (!selectedLocation) return;
    await createAssignment({
      location_id: selectedLocation._id,
      calendar_id: data.calendar_id,
      is_primary: data.is_primary,
      effective_date: data.effective_date.toISOString(),
      expiry_date: data.expiry_date?.toISOString(),
    });
    closeAssignmentModal();
  };

  const handleHolidayFormSubmit = async (data: HolidayFormData) => {
    if (!selectedCalendar) return;
    if (!selectedHoliday) {
      await createHoliday({ calendarId: selectedCalendar._id, data });
    }
    closeHolidayFormModal();
  };

  const formatRecurringType = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const formatHolidayDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Manage holiday calendars, holidays, and location assignments
          </p>
        </div>
        <button
          onClick={handleCreateCalendar}
          className="btn-primary-glow flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold"
        >
          <Plus className="w-4 h-4" />
          New Calendar
        </button>
      </div>

      {/* Internal tab navigation */}
      <div className="flex p-1 rounded-xl gap-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', width: 'fit-content' }}>
        <button
          onClick={() => setActiveHolidayTab('calendars')}
          className={cn('flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-all')}
          style={activeHolidayTab === 'calendars' ? { background: 'rgba(245,176,42,0.12)', color: '#f5b02a' } : { color: '#94a3b8' }}
        >
          <Calendar className="w-3.5 h-3.5" />
          Holiday Calendars
        </button>
        <button
          onClick={() => setActiveHolidayTab('holidays')}
          className={cn('flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-all')}
          style={activeHolidayTab === 'holidays' ? { background: 'rgba(245,176,42,0.12)', color: '#f5b02a' } : { color: '#94a3b8' }}
        >
          <Clock className="w-3.5 h-3.5" />
          Holidays
        </button>
      </div>

      {/* Content */}
      {activeHolidayTab === 'calendars' ? (
        <HolidayCalendarTable
          calendars={calendars ?? []}
          isLoading={isCalendarsLoading}
          isError={isCalendarsError}
          onEdit={handleEditCalendar}
          onCreateAssignment={handleCreateAssignment}
          refetch={refetchCalendars}
        />
      ) : (
        <div className="space-y-4">
          {/* Calendar Selector */}
          <div className="p-5 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-main)' }}>Select Calendar</h2>
            {isCalendarsLoading ? (
              <div className="h-9 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
            ) : calendars && calendars.length > 0 ? (
              <div className="relative">
                <select
                  value={selectedCalendar?._id ?? ''}
                  onChange={(e) => {
                    const cal = calendars.find(c => c._id === e.target.value);
                    setSelectedCalendar(cal ?? null);
                    setSelectedHoliday(null);
                  }}
                  className="w-full h-9 px-3 pr-10 text-sm appearance-none focus:outline-none transition-all duration-150"
                  style={{
                    borderRadius: '12px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#f8fafc',
                  }}
                >
                  <option value="" style={{ background: '#1e293b' }}>Choose a holiday calendar...</option>
                  {calendars.map((cal) => (
                    <option key={cal._id} value={cal._id} style={{ background: '#1e293b' }}>
                      {cal.name} {!cal.is_active ? '(Inactive)' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94a3b8' }} />
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No holiday calendars found. Create one first.
              </p>
            )}
          </div>

          {/* Holidays Table */}
          {selectedCalendar && (
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>{selectedCalendar.name}</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {holidaysData?.length ?? 0} holiday{(holidaysData?.length ?? 0) !== 1 ? 's' : ''} configured
                  </p>
                </div>
                <button
                  onClick={handleCreateHoliday}
                  className="btn-primary-glow flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold"
                >
                  <Plus className="w-4 h-4" />
                  Add Holiday
                </button>
              </div>

              {isHolidaysLoading ? (
                <TableSkeleton rows={5} columns={5} />
              ) : isHolidaysError ? (
                <ErrorState onRetry={refetchCalendars} />
              ) : !holidaysData?.length ? (
                <EmptyState
                  title="No holidays yet"
                  description="Add holidays to this calendar to get started."
                  icon={Calendar}
                  action={
                    <button onClick={handleCreateHoliday} className="btn-primary-glow px-4 py-2 rounded-xl text-sm font-bold">
                      Add Holiday
                    </button>
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <th className="h-10 px-5 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Name</th>
                        <th className="h-10 px-5 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Date</th>
                        <th className="h-10 px-5 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Recurrence</th>
                        <th className="h-10 px-5 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Code</th>
                        <th className="h-10 px-5 text-right text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holidaysData.map((holiday) => (
                        <tr
                          key={holiday._id}
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                        >
                          <td className="h-14 px-5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,176,42,0.12)' }}>
                                <Calendar className="w-4 h-4" style={{ color: '#f5b02a' }} />
                              </div>
                              <div>
                                <p className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>{holiday.name}</p>
                                {holiday.is_observed && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold mt-0.5"
                                    style={{ background: 'rgba(245,176,42,0.12)', color: '#f5b02a', border: '1px solid rgba(245,176,42,0.25)' }}>
                                    Observed
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="h-14 px-5">
                            <span className="text-sm" style={{ color: 'var(--text-main)' }}>{formatHolidayDate(holiday.date)}</span>
                          </td>
                          <td className="h-14 px-5">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                              style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
                              {formatRecurringType(holiday.recurring_type)}
                            </span>
                          </td>
                          <td className="h-14 px-5">
                            <span className="text-sm font-mono" style={{ color: '#94a3b8' }}>
                              {holiday.holiday_code || '—'}
                            </span>
                          </td>
                          <td className="h-14 px-5">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleEditHoliday(holiday)}
                                className="h-8 w-8 flex items-center justify-center rounded-lg transition-all"
                                style={{ color: '#94a3b8' }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLElement).style.background = 'rgba(245,176,42,0.1)';
                                  (e.currentTarget as HTMLElement).style.color = '#f5b02a';
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                                  (e.currentTarget as HTMLElement).style.color = '#94a3b8';
                                }}
                                title="Edit holiday"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteHoliday(holiday)}
                                className="h-8 w-8 flex items-center justify-center rounded-lg transition-all"
                                style={{ color: '#94a3b8' }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)';
                                  (e.currentTarget as HTMLElement).style.color = '#ef4444';
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                                  (e.currentTarget as HTMLElement).style.color = '#94a3b8';
                                }}
                                title="Delete holiday"
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
              )}
            </div>
          )}
        </div>
      )}

      {/* Calendar Form Modal */}
      <Modal
        isOpen={isCalendarFormModalOpen}
        onClose={closeCalendarFormModal}
        title={editingCalendar ? 'Edit Holiday Calendar' : 'Create Holiday Calendar'}
        description={editingCalendar ? 'Update the holiday calendar details.' : 'Add a new holiday calendar.'}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={closeCalendarFormModal}
              className="px-4 py-2 text-sm font-semibold rounded-xl transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#f8fafc' }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const btn = document.getElementById('holiday-calendar-form-submit') as HTMLButtonElement;
                btn?.click();
              }}
              disabled={isCreatingCalendar || isUpdatingCalendar}
              className="btn-primary-glow px-4 py-2 text-sm font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {(isCreatingCalendar || isUpdatingCalendar) && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {editingCalendar ? 'Update Calendar' : 'Create Calendar'}
            </button>
          </div>
        }
      >
        <HolidayCalendarForm
          initialData={editingCalendar ?? undefined}
          onSubmit={handleCalendarFormSubmit}
          isSubmitting={isCreatingCalendar || isUpdatingCalendar}
          isEdit={!!editingCalendar}
        />
      </Modal>

      {/* Assignment Modal */}
      {selectedCalendar && (
        <LocationCalendarAssignment
          isOpen={isAssignmentModalOpen}
          onClose={closeAssignmentModal}
          onSuccess={closeAssignmentModal}
          locations={locations ?? []}
          calendars={[selectedCalendar]}
        />
      )}

      {/* Holiday Form Modal */}
      <Modal
        isOpen={isHolidayFormModalOpen}
        onClose={closeHolidayFormModal}
        title={selectedHoliday ? 'Edit Holiday' : 'Create Holiday'}
        description={selectedHoliday ? 'Update the holiday details.' : `Add a new holiday to ${selectedCalendar?.name ?? 'the calendar'}.`}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={closeHolidayFormModal}
              className="px-4 py-2 text-sm font-semibold rounded-xl transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#f8fafc' }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const btn = document.getElementById('holiday-form-submit') as HTMLButtonElement;
                btn?.click();
              }}
              disabled={isCreatingHoliday}
              className="btn-primary-glow px-4 py-2 text-sm font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isCreatingHoliday && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {selectedHoliday ? 'Update Holiday' : 'Create Holiday'}
            </button>
          </div>
        }
      >
        <HolidayForm
          initialData={selectedHoliday ?? undefined}
          onSubmit={handleHolidayFormSubmit}
          calendars={calendars ?? []}
          isSubmitting={isCreatingHoliday}
          isEdit={!!selectedHoliday}
        />
      </Modal>
    </div>
  );
}

function WorkSchedulesTab() {
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<WorkSchedule | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<WorkSchedule | null>(null);

  const {
    data: schedules,
    isLoading,
    isError,
    refetch,
    create: createSchedule,
    update: updateSchedule,
    isCreating,
    isUpdating,
  } = useWorkSchedules();

  const { data: locations } = useLocations();

  const handleCreate = () => {
    setEditingSchedule(null);
    setIsFormModalOpen(true);
  };

  const handleEdit = (schedule: WorkSchedule) => {
    setEditingSchedule(schedule);
    setIsFormModalOpen(true);
  };

  const handleCreateAssignment = (schedule: WorkSchedule) => {
    setSelectedSchedule(schedule);
    setIsAssignmentModalOpen(true);
  };

  const closeFormModal = () => {
    setIsFormModalOpen(false);
    setEditingSchedule(null);
  };

  const closeAssignmentModal = () => {
    setIsAssignmentModalOpen(false);
    setSelectedSchedule(null);
  };

  const handleFormSubmit = async (data: WorkScheduleFormData) => {
    if (editingSchedule) {
      await updateSchedule({ id: editingSchedule._id, input: data });
    } else {
      await createSchedule(data);
    }
    closeFormModal();
  };

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Define working hours per location for scheduling and SLA management
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="btn-primary-glow flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold"
        >
          <Plus className="w-4 h-4" />
          New Schedule
        </button>
      </div>

      {/* Table */}
      <WorkScheduleTable
        schedules={schedules ?? []}
        isLoading={isLoading}
        isError={isError}
        onEdit={handleEdit}
        onCreateAssignment={handleCreateAssignment}
        refetch={refetch}
      />

      {/* Form Modal */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={closeFormModal}
        title={editingSchedule ? 'Edit Work Schedule' : 'Create Work Schedule'}
        description={editingSchedule ? 'Update the work schedule details.' : 'Define a new work schedule with working days and hours.'}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={closeFormModal}
              className="px-4 py-2 text-sm font-semibold rounded-xl transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#f8fafc' }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const btn = document.getElementById('work-schedule-form-submit') as HTMLButtonElement;
                btn?.click();
              }}
              disabled={isCreating || isUpdating}
              className="btn-primary-glow px-4 py-2 text-sm font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {(isCreating || isUpdating) && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {editingSchedule ? 'Update Schedule' : 'Create Schedule'}
            </button>
          </div>
        }
      >
        <WorkScheduleForm
          initialData={editingSchedule ?? undefined}
          onSubmit={handleFormSubmit}
          isSubmitting={isCreating || isUpdating}
          isEdit={!!editingSchedule}
        />
      </Modal>

      {/* Assignment Modal */}
      {selectedSchedule && (
        <WorkScheduleLocationAssignment
          isOpen={isAssignmentModalOpen}
          onClose={closeAssignmentModal}
          onSuccess={closeAssignmentModal}
          locations={locations ?? []}
          schedules={[selectedSchedule]}
        />
      )}
    </div>
  );
}
