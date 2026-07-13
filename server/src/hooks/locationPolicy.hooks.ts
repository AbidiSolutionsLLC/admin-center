// server/src/hooks/locationPolicy.hooks.ts
import { z } from 'zod';
import { PolicyAssignment } from '../models/PolicyAssignment.model';
import { Location } from '../models/Location.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';
import { Types } from 'mongoose';

export interface LocationAssignmentRule {
  target_type: 'location';
  target_id: string;
}

export interface AssignmentRulesForm {
  rules: LocationAssignmentRule[];
}

export const LocationAssignmentSchema = z.object({
  rules: z.array(
    z.object({
      target_type: z.enum(['location']),
      target_id: z.string().min(1, 'Location ID is required'),
    })
  ),
});

export const useLocationAssignments = () => {
  const assignPolicyToLocations = async (
    policyVersionId: string,
    locationIds: string[],
    req: any
  ): Promise<number> => {
    if (!locationIds || locationIds.length === 0) {
      return 0;
    }

    const createdAssignments: typeof PolicyAssignment.prototype[] = [];

    for (const locationId of locationIds) {
      const location = await Location.findOne({
        _id: locationId,
        company_id: new Types.ObjectId(req.user.company_id),
      });

      if (!location) {
        throw new AppError(
          `Location with ID ${locationId} not found`,
          404,
          'LOCATION_NOT_FOUND'
        );
      }

      const existingAssignment = await PolicyAssignment.findOne({
        company_id: new Types.ObjectId(req.user.company_id),
        policy_version_id: new Types.ObjectId(policyVersionId),
        target_type: 'location',
        target_id: locationId,
      });

      if (existingAssignment) {
        throw new AppError(
          `Policy is already assigned to location "${location.name}"`,
          400,
          'POLICY_ALREADY_ASSIGNED'
        );
      }

      const assignment = await PolicyAssignment.create({
        company_id: new Types.ObjectId(req.user.company_id),
        policy_version_id: new Types.ObjectId(policyVersionId),
        target_type: 'location',
        target_id: locationId,
        target_label: location.name,
      });

      createdAssignments.push(assignment);

      // Audit log
      await auditLogger.log({
        req,
        action: 'policy.location_assigned',
        module: 'policies',
        object_type: 'PolicyAssignment',
        object_id: assignment._id.toString(),
        object_label: `${policyVersionId} - ${location.name}`,
        before_state: null,
        after_state: {
          policy_version_id: policyVersionId,
          location_id: locationId,
          location_name: location.name,
        },
      });
    }

    return createdAssignments.length;
  };

  const removeLocationAssignment = async (
    policyVersionId: string,
    locationId: string,
    req: any
  ): Promise<void> => {
    const assignment = await PolicyAssignment.findOne({
      company_id: new Types.ObjectId(req.user.company_id),
      policy_version_id: new Types.ObjectId(policyVersionId),
      target_type: 'location',
      target_id: locationId,
    });

    if (!assignment) {
      throw new AppError(
        `Assignment not found for location ${locationId}`,
        404,
        'ASSIGNMENT_NOT_FOUND'
      );
    }

    const beforeState = assignment.toObject();
    await PolicyAssignment.findByIdAndDelete(assignment._id);

    // Audit log
    await auditLogger.log({
      req,
      action: 'policy.location_assignment_removed',
      module: 'policies',
      object_type: 'PolicyAssignment',
      object_id: assignment._id.toString(),
      object_label: `${policyVersionId} - ${assignment.target_label}`,
      before_state: beforeState,
      after_state: null,
    });
  };

  const getLocationAssignments = async (
    policyVersionId: string,
    companyId: string
  ): Promise<Array<{ _id: string; target_label: string; created_at: Date }>> => {
    const assignments = await PolicyAssignment.find({
      company_id: new Types.ObjectId(companyId),
      policy_version_id: new Types.ObjectId(policyVersionId),
      target_type: 'location',
    }).sort({ created_at: 1 });

    return assignments.map((a) => ({
      _id: a._id.toString(),
      target_label: a.target_label,
      created_at: a.created_at,
    }));
  };

  return {
    assignPolicyToLocations,
    removeLocationAssignment,
    getLocationAssignments,
    schema: LocationAssignmentSchema,
  };
};