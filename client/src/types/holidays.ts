// client/src/types/holidays.ts
import type { LocationType } from './index';

// Holiday Calendar Types
export interface HolidayCalendar {
  _id: string;
  company_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  assignment_count?: number;
}

export interface HolidayCalendarTreeNode extends HolidayCalendar {
  type?: LocationType;
  locations?: HolidayCalendarTreeNode[];
  user_count?: number;
}

// Holiday Types
export interface Holiday {
  _id: string;
  name: string;
  date: Date;
  recurring_type: 'yearly' | 'monthly' | 'quarterly' | 'custom';
  recurring_details?: {
    year?: number;
    month?: number;
    day?: number;
    pattern?: string;
    end_date?: Date;
  };
  calendar_id: string;
  holiday_code?: string;
  is_observed?: boolean;
  created_at: Date;
  updated_at: Date;
  calendar_name?: string;
  source_location?: string;
}

// Holiday Assignment Types
export interface HolidayAssignment {
  _id: string;
  company_id: string;
  location_id: string | { _id: string; name: string; type: LocationType };
  calendar_id: string | { _id: string; name: string; description?: string; is_active?: boolean };
  is_primary: boolean;
  effective_date: Date;
  expiry_date?: Date;
  created_at: Date;
  updated_at: Date;
  holidays_count?: number;
}

// Integration Types
export interface AttendanceHoliday {
  holiday_id: string;
  name: string;
  date: Date;
  recurring_type: string;
  calendar_name: string;
  source_location: string;
  is_observed: boolean;
  holiday_code?: string;
}

export interface CompanyHolidayData {
  calendar_name: string;
  location_name: string;
  location_type: string;
  timezone: string;
  holidays: Holiday[];
}

// Form Types
export type HolidayCalendarFormData = {
  name: string;
  description?: string;
  is_active: boolean;
};

export type HolidayFormData = {
  name: string;
  date: string;
  recurring_type: 'yearly' | 'monthly' | 'quarterly' | 'custom';
  recurring_details?: {
    year?: number;
    month?: number;
    day?: number;
    pattern?: string;
    end_date?: string;
  };
  holiday_code?: string;
  is_observed: boolean;
};

export type HolidayAssignmentFormData = {
  location_id: string;
  calendar_id: string;
  is_primary: boolean;
  effective_date: string;
  expiry_date?: string;
};