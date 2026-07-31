import { WorkScheduleAssignment } from '../models/WorkScheduleAssignment.model';
import { WorkSchedule } from '../models/WorkSchedule.model';
import { Location } from '../models/Location.model';
import { HolidayAssignment } from '../models/HolidayAssignment.model';
import { Holiday } from '../models/Holiday.model';

interface SlaInput {
  startDate: Date;
  locationId: string;
  companyId: string;
  slaHours: number;
}

interface SlaResult {
  dueDate: Date;
  workingDaysSkipped: number;
  holidaysSkipped: number;
}

function addBusinessDays(start: Date, daysToAdd: number, workingDays: number[]): Date {
  const result = new Date(start);
  let added = 0;
  while (added < daysToAdd) {
    result.setDate(result.getDate() + 1);
    if (workingDays.includes(result.getDay())) {
      added++;
    }
  }
  return result;
}

function getWorkingDayRange(
  schedule: { working_days: number[]; working_hours: { start: string; end: string } },
  date: Date
): { start: Date; end: Date } {
  const dateStr = date.toISOString().split('T')[0];
  const dayStart = new Date(`${dateStr}T${schedule.working_hours.start}:00`);
  const dayEnd = new Date(`${dateStr}T${schedule.working_hours.end}:00`);
  return { start: dayStart, end: dayEnd };
}

function getBusinessHoursInDay(date: Date, schedule: { working_days: number[]; working_hours: { start: string; end: string } }): number {
  if (!schedule.working_days.includes(date.getDay())) return 0;
  const range = getWorkingDayRange(schedule, date);
  return (range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60);
}

export const slaCalculator = {

  calculateDueDate: async (input: SlaInput): Promise<SlaResult> => {
    const { startDate, locationId, companyId, slaHours } = input;

    const assignment = await WorkScheduleAssignment.findOne({
      location_id: locationId,
      company_id: companyId,
      is_primary: true,
      effective_date: { $lte: startDate },
      $or: [
        { expiry_date: { $exists: false } },
        { expiry_date: null },
        { expiry_date: { $gte: startDate } },
      ],
    })
      .sort({ effective_date: -1 })
      .populate<{ work_schedule_id: any }>('work_schedule_id')
      .lean();

    if (!assignment || !assignment.work_schedule_id) {
      return {
        dueDate: new Date(startDate.getTime() + slaHours * 60 * 60 * 1000),
        workingDaysSkipped: 0,
        holidaysSkipped: 0,
      };
    }

    const schedule = assignment.work_schedule_id;
    const workingDays = schedule.working_days || [1, 2, 3, 4, 5];
    const workingHoursStart = schedule.working_hours?.start || '09:00';
    const workingHoursEnd = schedule.working_hours?.end || '17:00';

    const fullSchedule = {
      working_days: workingDays,
      working_hours: { start: workingHoursStart, end: workingHoursEnd },
    };

    const holidayAssign = await HolidayAssignment.findOne({
      company_id: companyId,
      location_id: locationId,
      $or: [
        { expiry_date: { $exists: false } },
        { expiry_date: null },
        { expiry_date: { $gte: startDate } },
      ],
    })
      .sort({ is_primary: -1, created_at: -1 })
      .lean();

    let holidayDates: string[] = [];
    if (holidayAssign) {
      const holidays = await Holiday.find({
        calendar_id: holidayAssign.calendar_id,
      }).lean();
      holidayDates = holidays.map((h) => new Date(h.date).toISOString().split('T')[0]);
    }

    let remainingHours = slaHours;
    let currentDate = new Date(startDate);
    let workingDaysSkipped = 0;
    let holidaysSkipped = 0;

    const dayInMs = 24 * 60 * 60 * 1000;

    while (remainingHours > 0) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const isHoliday = holidayDates.includes(dateStr);

      if (isHoliday) {
        holidaysSkipped++;
        currentDate = new Date(currentDate.getTime() + dayInMs);
        continue;
      }

      const hoursToday = getBusinessHoursInDay(currentDate, fullSchedule);
      if (hoursToday <= 0) {
        workingDaysSkipped++;
        currentDate = new Date(currentDate.getTime() + dayInMs);
        continue;
      }

      if (remainingHours <= hoursToday) {
        const range = getWorkingDayRange(fullSchedule, currentDate);
        currentDate = new Date(range.start.getTime() + remainingHours * 60 * 60 * 1000);
        remainingHours = 0;
      } else {
        remainingHours -= hoursToday;
        workingDaysSkipped++;
        currentDate = new Date(currentDate.getTime() + dayInMs);
      }
    }

    return {
      dueDate: currentDate,
      workingDaysSkipped,
      holidaysSkipped,
    };
  },

  recalculateForLocation: async (locationId: string, companyId: string): Promise<void> => {
    const { ApprovalRequest } = await import('../models/ApprovalRequest.model');
    const { WorkflowRun } = await import('../models/WorkflowRun.model');
    const { User } = await import('../models/User.model');

    const usersAtLocation = await User.find({
      location_id: locationId,
      company_id: companyId,
    }).select('_id');

    const userIds = usersAtLocation.map((u) => u._id.toString());

    const pendingRuns = await WorkflowRun.find({
      company_id: companyId,
      sla_status: { $in: ['pending', 'ok'] },
      status: { $ne: 'failure' },
    }).lean();

    for (const run of pendingRuns) {
      const payload = run.event_payload as any;
      if (!payload || !payload.userId) continue;
      if (!userIds.includes(payload.userId)) continue;

      const newSla = await slaCalculator.calculateDueDate({
        startDate: run.created_at,
        locationId,
        companyId,
        slaHours: 24,
      });

      const now = new Date();
      const isBreached = newSla.dueDate < now;

      await WorkflowRun.updateOne(
        { _id: run._id },
        { $set: { sla_status: isBreached ? 'breached' : 'ok' } }
      );
    }

    const pendingApprovals = await ApprovalRequest.find({
      company_id: companyId,
      status: 'pending',
    }).lean();

    for (const approval of pendingApprovals) {
      const workflowRun = pendingRuns.find(
        (r) => r._id.toString() === (approval as any).workflow_run_id?.toString()
      );
      if (!workflowRun) continue;
    }
  },
};
