// client/src/features/holidays/components/LocationCalendarAssignment.tsx
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useHolidayAssignments } from '../hooks/useHolidayAssignments';
import type { Location, HolidayCalendar } from '@/types';

interface LocationCalendarAssignmentProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  locations: Location[];
  calendars: HolidayCalendar[];
}

export const LocationCalendarAssignment: React.FC<LocationCalendarAssignmentProps> = ({
  isOpen,
  onClose,
  onSuccess,
  locations = [],
  calendars = [],
}) => {
  const { create: createAssignment, isCreating } = useHolidayAssignments();

  const [locationId, setLocationId] = useState('');
  const [calendarId, setCalendarId] = useState(calendars[0]?._id ?? '');
  const [isPrimary, setIsPrimary] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDate, setExpiryDate] = useState('');

  const handleClose = () => {
    setLocationId('');
    setCalendarId(calendars[0]?._id ?? '');
    setIsPrimary(false);
    setEffectiveDate(new Date().toISOString().split('T')[0]);
    setExpiryDate('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calendarId) return;
    if (!locationId) return;

    await createAssignment({
      location_id: locationId,
      calendar_id: calendarId,
      is_primary: isPrimary,
      effective_date: new Date(effectiveDate).toISOString(),
      expiry_date: expiryDate ? new Date(expiryDate).toISOString() : undefined,
    });
    onSuccess();
    handleClose();
  };

  const fieldStyle = (hasError?: boolean): React.CSSProperties => ({
    borderColor: hasError ? 'rgba(239,68,68,0.5)' : undefined,
    boxShadow: hasError ? '0 0 0 3px rgba(239,68,68,0.08)' : undefined,
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Assign Holiday Calendar to Location"
      description="Link a holiday calendar to a location so users inherit holidays automatically."
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
            disabled={isCreating || !calendarId || !locationId}
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isCreating && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Assign Calendar
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Location Selection */}
        <div className="space-y-1.5">
          <label htmlFor="assignment-location" className="text-sm font-medium text-ink">
            Location <span className="text-error">*</span>
          </label>
          <div className="relative">
            <select
              id="assignment-location"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              disabled={isCreating}
              className="w-full h-9 px-3 pr-10 text-sm rounded-md border border-line bg-white text-ink appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              style={fieldStyle(!locationId && false)}
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

        {/* Calendar Selection */}
        <div className="space-y-1.5">
          <label htmlFor="assignment-calendar" className="text-sm font-medium text-ink">
            Holiday Calendar <span className="text-error">*</span>
          </label>
          <div className="relative">
            <select
              id="assignment-calendar"
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              disabled={isCreating}
              className="w-full h-9 px-3 pr-10 text-sm rounded-md border border-line bg-white text-ink appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
            >
              <option value="">Select a holiday calendar...</option>
              {calendars.map((cal) => (
                <option key={cal._id} value={cal._id}>
                  {cal.name} {!cal.is_active ? '(Inactive)' : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
          </div>
        </div>

        {/* Primary Assignment */}
        <div
          className="flex items-start gap-3 p-3 rounded-lg cursor-pointer border border-line hover:bg-surface-alt transition-colors"
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
            <p className="text-sm font-medium text-ink">Primary Calendar</p>
            <p className="text-xs text-ink-secondary">
              This will be the main holiday calendar for this location. Users inherit holidays from the primary calendar.
            </p>
          </div>
        </div>

        {/* Effective Date */}
        <div className="space-y-1.5">
          <label htmlFor="assignment-effective-date" className="text-sm font-medium text-ink">
            Effective Date <span className="text-error">*</span>
          </label>
          <input
            id="assignment-effective-date"
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            disabled={isCreating}
            className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
          />
        </div>

        {/* Expiry Date */}
        <div className="space-y-1.5">
          <label htmlFor="assignment-expiry-date" className="text-sm font-medium text-ink">
            Expiry Date <span className="text-ink-muted">(Optional)</span>
          </label>
          <input
            id="assignment-expiry-date"
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