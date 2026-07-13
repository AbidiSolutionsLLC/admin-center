import { Types } from 'mongoose';
import { Location } from '../models/Location.model';
import { User } from '../models/User.model';
import { Company } from '../models/Company.model';
import { PolicyVersion } from '../models/PolicyVersion.model';
import { PolicyAssignment } from '../models/PolicyAssignment.model';
import { HolidayAssignment } from '../models/HolidayAssignment.model';
import { HolidayCalendar } from '../models/HolidayCalendar.model';
import { WorkScheduleAssignment } from '../models/WorkScheduleAssignment.model';
import { WorkSchedule } from '../models/WorkSchedule.model';

export interface UserEffectiveSettings {
  timezone: string;
  holiday_calendar: { _id: string; name: string } | null;
  work_schedule: { _id: string; name: string; working_days: number[]; working_hours: { start: string; end: string } } | null;
  policies: Array<{
    policy_version_id: string;
    title: string;
    version_number: number;
    category: string;
    source: 'global' | 'location' | 'direct';
    effective_date: Date;
  }>;
}

export interface LocationPolicyView {
  global_policies: Array<{
    policy_version_id: string;
    title: string;
    version_number: number;
    category: string;
    effective_date: Date;
    is_overridden: boolean;
  }>;
  location_policies: Array<{
    policy_version_id: string;
    title: string;
    version_number: number;
    category: string;
    effective_date: Date;
    assigned_at: Date;
  }>;
  all_available_policies: Array<{
    policy_version_id: string;
    title: string;
    version_number: number;
    category: string;
    effective_date: Date;
    status: string;
  }>;
}

export const locationSettingsService = {

  getEffectivePoliciesForUser: async (
    userId: string,
    companyId: string
  ): Promise<UserEffectiveSettings['policies']> => {
    const user = await User.findOne({ _id: userId, company_id: companyId }).select('location_id');
    if (!user) return [];

    const companyObjId = new Types.ObjectId(companyId);

    const globalAssignments = await PolicyAssignment.find({
      company_id: companyObjId,
      target_type: 'all',
    }).lean();

    // Determine effective location: user's assigned location or company default
    let effectiveLocationId: string | null = user.location_id?.toString() ?? null;
    if (!effectiveLocationId) {
      const company = await Company.findById(companyId).select('settings.default_location_id').lean();
      if (company?.settings?.default_location_id) {
        effectiveLocationId = company.settings.default_location_id;
      }
    }

    let locationAssignments: Array<typeof PolicyAssignment.prototype> = [];
    if (effectiveLocationId) {
      const location = await Location.findOne({
        _id: effectiveLocationId,
        company_id: companyObjId,
        is_deleted: { $ne: true },
      }).lean();
      if (location) {
        locationAssignments = await PolicyAssignment.find({
          company_id: companyObjId,
          target_type: 'location',
          target_id: effectiveLocationId,
        }).lean();
      }
    }

    const directUserAssignments = await PolicyAssignment.find({
      company_id: companyObjId,
      target_type: 'user',
      target_id: userId,
    }).lean();

    const allAssignmentPolicyIds = new Set<string>();
    [...globalAssignments, ...locationAssignments, ...directUserAssignments].forEach(a =>
      allAssignmentPolicyIds.add(a.policy_version_id.toString())
    );

    if (allAssignmentPolicyIds.size === 0) return [];

    const policies = await PolicyVersion.find({
      _id: { $in: Array.from(allAssignmentPolicyIds).map(id => new Types.ObjectId(id)) },
      company_id: companyObjId,
      status: 'published',
      is_active: true,
    }).lean();

    const policyMap = new Map(policies.map(p => [p._id.toString(), p]));

    const getPolicySource = (assignmentId: string): 'global' | 'location' | 'direct' => {
      const a = [...globalAssignments, ...locationAssignments, ...directUserAssignments]
        .find(pa => pa._id.toString() === assignmentId);
      if (!a) return 'direct';
      if (a.target_type === 'all') return 'global';
      if (a.target_type === 'location') return 'location';
      return 'direct';
    };

    const resolvedPolicies: UserEffectiveSettings['policies'] = [];
    const addedPolicies = new Set<string>();

    const addPolicy = (assignment: typeof PolicyAssignment.prototype) => {
      const policy = policyMap.get(assignment.policy_version_id.toString());
      if (!policy || addedPolicies.has(assignment.policy_version_id.toString())) return;

      const source = getPolicySource(assignment._id.toString());
      const existingIdx = resolvedPolicies.findIndex(
        p => p.policy_version_id === assignment.policy_version_id.toString()
      );

      if (existingIdx >= 0) {
        const priority = { global: 0, location: 1, direct: 2 };
        const currentPriority = priority[resolvedPolicies[existingIdx].source];
        const newPriority = priority[source];
        if (newPriority > currentPriority) {
          resolvedPolicies[existingIdx].source = source;
        }
        return;
      }

      addedPolicies.add(assignment.policy_version_id.toString());
      resolvedPolicies.push({
        policy_version_id: policy._id.toString(),
        title: policy.title,
        version_number: policy.version_number,
        category: policy.category,
        source,
        effective_date: policy.effective_date,
      });
    };

    directUserAssignments.forEach(addPolicy);
    locationAssignments.forEach(addPolicy);
    globalAssignments.forEach(addPolicy);

    return resolvedPolicies;
  },

  getEffectiveSettingsForUser: async (
    userId: string,
    companyId: string
  ): Promise<UserEffectiveSettings> => {
    const user = await User.findOne({ _id: userId, company_id: companyId })
      .populate('location_id', 'name timezone');
    if (!user) {
      return {
        timezone: 'UTC',
        holiday_calendar: null,
        work_schedule: null,
        policies: [],
      };
    }

    let locationId = user.location_id;
    let isDefaultFallback = false;

    // Fallback to company default location if user has no location assigned
    if (!locationId) {
      const company = await Company.findById(companyId).select('settings.default_location_id').lean();
      if (company?.settings?.default_location_id) {
        locationId = company.settings.default_location_id as any;
        isDefaultFallback = true;
      }
    }

    let timezone = 'UTC';
    let holidayCalendar: UserEffectiveSettings['holiday_calendar'] = null;
    let workSchedule: UserEffectiveSettings['work_schedule'] = null;

    if (locationId) {
      const location = await Location.findOne({
        _id: locationId,
        company_id: companyId,
        is_deleted: { $ne: true },
      }).lean();
      if (location) {
        timezone = location.timezone || 'UTC';
      }

      const holidayAssign = await HolidayAssignment.findOne({
        company_id: companyId,
        location_id: locationId,
        $or: [
          { expiry_date: { $exists: false } },
          { expiry_date: null },
          { expiry_date: { $gte: new Date() } },
        ],
      })
        .sort({ is_primary: -1, created_at: -1 })
        .populate('calendar_id', 'name')
        .lean();

      if (holidayAssign && holidayAssign.calendar_id) {
        const cal = holidayAssign.calendar_id as unknown as { _id: string; name: string };
        holidayCalendar = { _id: cal._id.toString(), name: cal.name };
      }

      const workScheduleAssign = await WorkScheduleAssignment.findOne({
        company_id: companyId,
        location_id: locationId,
        $or: [
          { expiry_date: { $exists: false } },
          { expiry_date: null },
          { expiry_date: { $gte: new Date() } },
        ],
      })
        .sort({ is_primary: -1, created_at: -1 })
        .populate('work_schedule_id', 'name working_days working_hours')
        .lean();

      if (workScheduleAssign && workScheduleAssign.work_schedule_id) {
        const ws = workScheduleAssign.work_schedule_id as unknown as {
          _id: string; name: string; working_days: number[]; working_hours: { start: string; end: string };
        };
        workSchedule = {
          _id: ws._id.toString(),
          name: ws.name,
          working_days: ws.working_days,
          working_hours: ws.working_hours,
        };
      }
    }

    const policies = await locationSettingsService.getEffectivePoliciesForUser(userId, companyId);

    return { timezone, holiday_calendar: holidayCalendar, work_schedule: workSchedule, policies };
  },

  getLocationPolicyView: async (
    locationId: string,
    companyId: string
  ): Promise<LocationPolicyView> => {
    const companyObjId = new Types.ObjectId(companyId);

    const globalPolicies = await PolicyAssignment.find({
      company_id: companyObjId,
      target_type: 'all',
    }).lean();

    const locationPolicies = await PolicyAssignment.find({
      company_id: companyObjId,
      target_type: 'location',
      target_id: locationId,
    }).lean();

    const allPolicyVersionIds = new Set<string>();
    globalPolicies.forEach(a => allPolicyVersionIds.add(a.policy_version_id.toString()));
    locationPolicies.forEach(a => allPolicyVersionIds.add(a.policy_version_id.toString()));

    const policies = await PolicyVersion.find({
      _id: { $in: Array.from(allPolicyVersionIds).map(id => new Types.ObjectId(id)) },
      company_id: companyObjId,
      status: 'published',
    }).lean();

    const policyMap = new Map(policies.map(p => [p._id.toString(), p]));

    const locationPolicyIds = new Set(locationPolicies.map(a => a.policy_version_id.toString()));

    const globalPolicyView = globalPolicies.map(a => {
      const policy = policyMap.get(a.policy_version_id.toString());
      if (!policy) return null;
      const isOverridden = locationPolicyIds.has(a.policy_version_id.toString());
      return {
        policy_version_id: policy._id.toString(),
        title: policy.title,
        version_number: policy.version_number,
        category: policy.category,
        effective_date: policy.effective_date,
        is_overridden: isOverridden,
      };
    }).filter(Boolean) as LocationPolicyView['global_policies'];

    const locationPolicyView = locationPolicies.map(a => {
      const policy = policyMap.get(a.policy_version_id.toString());
      if (!policy) return null;
      return {
        policy_version_id: policy._id.toString(),
        title: policy.title,
        version_number: policy.version_number,
        category: policy.category,
        effective_date: policy.effective_date,
        assigned_at: a.created_at,
      };
    }).filter(Boolean) as LocationPolicyView['location_policies'];

    // All published policies available to be assigned to this location
    const allAvailablePolicies = await PolicyVersion.find({
      company_id: companyObjId,
      status: 'published',
      is_active: true,
    })
      .select('_id title version_number category effective_date status')
      .sort({ title: 1, version_number: -1 })
      .lean();

    const allAvailablePolicyView = allAvailablePolicies.map(p => ({
      policy_version_id: p._id.toString(),
      title: p.title,
      version_number: p.version_number,
      category: p.category,
      effective_date: p.effective_date,
      status: p.status,
    }));

    return {
      global_policies: globalPolicyView,
      location_policies: locationPolicyView,
      all_available_policies: allAvailablePolicyView,
    };
  },

  resolvePolicyConflicts: (
    policies: UserEffectiveSettings['policies']
  ): Array<{ policy_version_id: string; title: string; version_number: number; source: string; reason: string }> => {
    const conflicts: Array<{ policy_version_id: string; title: string; version_number: number; source: string; reason: string }> = [];

    const categoryMap = new Map<string, typeof policies>();
    for (const p of policies) {
      const existing = categoryMap.get(p.category) || [];
      existing.push(p);
      categoryMap.set(p.category, existing);
    }

    for (const [category, categoryPolicies] of categoryMap) {
      if (categoryPolicies.length > 1) {
        const sources = new Set(categoryPolicies.map(p => p.source));
        if (sources.size > 1) {
          for (const p of categoryPolicies) {
            if (p.source === 'global' && categoryPolicies.some(cp => cp.source === 'location' && cp.category === category)) {
              conflicts.push({
                policy_version_id: p.policy_version_id,
                title: p.title,
                version_number: p.version_number,
                source: p.source,
                reason: `Overridden by location-level ${category} policy`,
              });
            }
          }
        }
      }
    }

    return conflicts;
  },

};
