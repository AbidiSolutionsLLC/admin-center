import React, { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { useAssignUserLocation } from '../hooks/useAssignUserLocation';
import { useLocations } from '@/features/locations/hooks/useLocations';
import { cn } from '@/utils/cn';
import { Clock, CalendarDays, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { User, Location } from '@/types';

interface UserLocationAssignmentModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  requiredFields?: string[];
}

const inputClass = cn(
  'w-full h-10 px-3 text-sm rounded-md border bg-white/5 text-slate-200 border-white/10',
  'placeholder:text-slate-500 transition-all duration-150',
  'focus:outline-none focus:ring-1 focus:border-primary/50 focus:ring-primary/50',
  'disabled:bg-black/20 disabled:text-slate-500 disabled:cursor-not-allowed hover:border-white/20'
);

const selectClass = cn(
  inputClass,
  'appearance-none pr-8 mb-2'
);

export const UserLocationAssignmentModal: React.FC<UserLocationAssignmentModalProps> = ({
  user,
  isOpen,
  onClose,
  requiredFields = [],
}) => {
  const { data: locations } = useLocations();
  const assignMutation = useAssignUserLocation();

  const currentLocationId = useMemo(() => {
    if (!user) return '';
    const locId = typeof user.location === 'object' && user.location
      ? user.location._id
      : user.location_id;
    return locId ?? '';
  }, [user]);

  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const hasUnsavedChanges = selectedLocationId !== currentLocationId && isOpen;

  React.useEffect(() => {
    if (isOpen && user) {
      setSelectedLocationId(currentLocationId);
    }
  }, [user, isOpen, currentLocationId]);

  React.useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  const selectedLocation = useMemo(() => {
    if (!selectedLocationId || !locations) return null;
    return locations.find((l: Location) => l._id === selectedLocationId) ?? null;
  }, [selectedLocationId, locations]);

  const handleSubmit = () => {
    if (!user) return;

    if (selectedLocationId === currentLocationId) {
      return;
    }

    if (!navigator.onLine) {
      toast.error('Network connection lost. Please check your internet and try again.');
      return;
    }

    assignMutation.mutate(
      {
        userId: user._id,
        data: {
          location_id: selectedLocationId || null,
        },
      },
      {
        onSuccess: () => {
          toast.success('Policies are being re-evaluated for the new region.');
          onClose();
        },
        onError: (error: any) => {
          const status = error?.response?.status;
          if (status === 409) {
            toast.error('User data has changed, please refresh and try again.');
          } else if (error?.message?.includes('NetworkError') || !navigator.onLine) {
            toast.error('Network connection lost. Please check your internet and try again.');
          } else {
            toast.error(error?.response?.data?.message || 'Failed to assign location');
          }
        },
      }
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Update User Location"
      description={`Update ${user?.full_name}'s primary location.`}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={assignMutation.isPending}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed cancel-btn-centered"
          >
            Cancel
          </button>
          <Button
            onClick={handleSubmit}
            disabled={assignMutation.isPending || selectedLocationId === currentLocationId}
            className={cn(
              'h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            style={assignMutation.isPending || selectedLocationId === currentLocationId ? { cursor: 'not-allowed', opacity: 0.5 } : {}}
          >
            {assignMutation.isPending ? 'Saving...' : 'Save Assignment'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Location */}
        <div className="space-y-1.5">
          <label htmlFor="user-location" className="text-sm font-medium text-ink">
            Primary Location {requiredFields.includes('location_id') && <span className="text-red-500">*</span>}
          </label>
          <select
            id="user-location"
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            className={selectClass}
            style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}
          >
            <option value="" className="no-results-text">No location</option>
            {(locations ?? []).map((loc: Location) => (
              <option key={loc._id} value={loc._id} className="truncate-option">
                {loc.name} {loc.type ? `(${loc.type})` : ''}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-ink-muted">
            Primary location determines timezone, holiday calendar, work schedule, and policy inheritance.
          </p>
        </div>

        {/* Preview effective settings */}
        {selectedLocation && (
          <div className="rounded-lg border border-line bg-surface-alt p-4 space-y-2">
            <p className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">Location Preview</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <div>
                  <p className="text-[10px] text-ink-muted">Timezone</p>
                  <p className="text-xs font-medium text-ink">{selectedLocation.timezone || 'UTC'}</p>
                </div>
              </div>
              {selectedLocation.working_hours && (
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-3.5 h-3.5 text-emerald-400" />
                  <div>
                    <p className="text-[10px] text-ink-muted">Work Hours</p>
                    <p className="text-xs font-medium text-ink">
                      {selectedLocation.working_hours.start} – {selectedLocation.working_hours.end}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
