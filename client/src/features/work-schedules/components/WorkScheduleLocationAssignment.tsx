// client/src/features/work-schedules/components/WorkScheduleLocationAssignment.tsx
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useWorkScheduleAssignments } from '../hooks/useWorkScheduleAssignments';
import type { Location, WorkSchedule } from '@/types';

interface WorkScheduleLocationAssignmentProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  locations: Location[];
  schedules: WorkSchedule[];
}

export const WorkScheduleLocationAssignment: React.FC<WorkScheduleLocationAssignmentProps> = ({
  isOpen,
  onClose,
  onSuccess,
  locations = [],
  schedules = [],
}) => {
  const { create: createAssignment, isCreating } = useWorkScheduleAssignments();

  const [locationId, setLocationId] = useState('');
  const [scheduleId, setScheduleId] = useState(schedules[0]?._id ?? '');
  const [isPrimary, setIsPrimary] = useState(true);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDate, setExpiryDate] = useState('');

  const handleClose = () => {
    setLocationId('');
    setScheduleId(schedules[0]?._id ?? '');
    setIsPrimary(true);
    setEffectiveDate(new Date().toISOString().split('T')[0]);
    setExpiryDate('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleId || !locationId) return;

    await createAssignment({
      location_id: locationId,
      work_schedule_id: scheduleId,
      is_primary: isPrimary,
      effective_date: new Date(effectiveDate).toISOString(),
      expiry_date: expiryDate ? new Date(expiryDate).toISOString() : undefined,
    });
    onSuccess();
    handleClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Assign Work Schedule to Location"
      description="Link a work schedule to a location so users inherit working hours automatically."
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isCreating || !scheduleId || !locationId}
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isCreating && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Assign Schedule
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Location Selection */}
        <div className="space-y-1.5">
          <label htmlFor="ws-assignment-location" className="text-sm font-medium text-ink">
            Location <span className="text-error">*</span>
          </label>
          <div className="relative">
            <select
              id="ws-assignment-location"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              disabled={isCreating}
              className="w-full h-9 px-3 pr-10 text-sm rounded-md border border-line bg-white text-ink appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
            >
              <option value="">Select a location...</option>
              {locations.map((loc) => (
                <option key={loc._id} value={loc._id}>
                  {loc.name} ({loc.type})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
          </div>
        </div>

        {/* Schedule Selection */}
        <div className="space-y-1.5">
          <label htmlFor="ws-assignment-schedule" className="text-sm font-medium text-ink">
            Work Schedule <span className="text-error">*</span>
          </label>
          <div className="relative">
            <select
              id="ws-assignment-schedule"
              value={scheduleId}
              onChange={(e) => setScheduleId(e.target.value)}
              disabled={isCreating}
              className="w-full h-9 px-3 pr-10 text-sm rounded-md border border-line bg-white text-ink appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
            >
              <option value="">Select a work schedule...</option>
              {schedules.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} {!s.is_active ? '(Inactive)' : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
          </div>
        </div>

        {/* Primary Schedule */}
        <div
          className="flex items-start gap-3 p-3 rounded-lg border border-line cursor-pointer hover:bg-surface-alt transition-colors"
          onClick={() => !isCreating && setIsPrimary(!isPrimary)}
        >
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
            disabled={isCreating}
            className="mt-0.5 flex-shrink-0"
          />
          <div>
            <p className="text-sm font-medium text-ink">Primary Schedule</p>
            <p className="text-xs text-ink-secondary">
              This will be the main work schedule for this location. Users inherit the primary schedule automatically.
            </p>
          </div>
        </div>

        {/* Effective Date */}
        <div className="space-y-1.5">
          <label htmlFor="ws-assignment-effective-date" className="text-sm font-medium text-ink">
            Effective Date <span className="text-error">*</span>
          </label>
          <input
            id="ws-assignment-effective-date"
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            disabled={isCreating}
            className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          />
        </div>

        {/* Expiry Date */}
        <div className="space-y-1.5">
          <label htmlFor="ws-assignment-expiry-date" className="text-sm font-medium text-ink">
            Expiry Date <span className="text-ink-muted">(Optional)</span>
          </label>
          <input
            id="ws-assignment-expiry-date"
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            min={effectiveDate}
            disabled={isCreating}
            className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          />
          <p className="text-xs text-ink-muted">Leave empty for no expiry.</p>
        </div>
      </form>
    </Modal>
  );
};
