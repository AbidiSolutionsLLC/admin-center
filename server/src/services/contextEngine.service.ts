// server/src/services/contextEngine.service.ts
import { Types } from 'mongoose';
import { User } from '../models/User.model';
import { Location } from '../models/Location.model';
import { locationSettingsService } from './locationSettings.service';
import { runIntelligenceRules } from '../lib/intelligence';

export interface ContextChangeEvent {
  userId: string;
  companyId: string;
  previousLocationId: string | null;
  newLocationId: string | null;
  changedBy: string;
}

export interface ContextEngineResult {
  applied: boolean;
  settings: {
    timezone: string;
    holiday_calendar: { _id: string; name: string } | null;
    work_schedule: { _id: string; name: string; working_days: number[]; working_hours: { start: string; end: string } } | null;
    policies_count: number;
  };
  intelligenceTriggered: boolean;
}

export const contextEngine = {

  onLocationChanged: async (event: ContextChangeEvent): Promise<ContextEngineResult> => {
    const { userId, companyId } = event;

    const user = await User.findOne({ _id: userId, company_id: companyId });
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const effectiveSettings = await locationSettingsService.getEffectiveSettingsForUser(
      userId,
      companyId
    );

    runIntelligenceRules(companyId).catch((err) => {
      console.error(`[ContextEngine] Intelligence rules failed for company ${companyId}:`, err);
    });

    return {
      applied: true,
      settings: {
        timezone: effectiveSettings.timezone,
        holiday_calendar: effectiveSettings.holiday_calendar,
        work_schedule: effectiveSettings.work_schedule,
        policies_count: effectiveSettings.policies.length,
      },
      intelligenceTriggered: true,
    };
  },

  onUserBulkLocationChanged: async (
    userIds: string[],
    companyId: string,
    locationId: string
  ): Promise<ContextEngineResult[]> => {
    const location = await Location.findOne({
      _id: locationId,
      company_id: companyId,
      is_deleted: { $ne: true },
    });

    if (!location) {
      throw new Error(`Location ${locationId} not found`);
    }

    const results: ContextEngineResult[] = [];

    for (const userId of userIds) {
      const result = await contextEngine.onLocationChanged({
        userId,
        companyId,
        previousLocationId: null,
        newLocationId: locationId,
        changedBy: 'system',
      });
      results.push(result);
    }

    return results;
  },
};
