// server/src/lib/intelligence.ts
import { Types } from 'mongoose';
import { User } from '../models/User.model';
import { Department } from '../models/Department.model';
import { Insight } from '../models/Insight.model';

/**
 * Runs all intelligence rules for a given company.
 * Detects health issues, misconfigurations, and data inconsistencies.
 * Upserts insights to avoid duplicates.
 * 
 * Rules implemented:
 * - RULE-02: Department with headcount > 0 and no primary_manager_id
 * - RULE-05: Team (type='team') with no parent department (orphan)
 */
export const runIntelligenceRules = async (companyId: string | Types.ObjectId): Promise<void> => {
  const companyObjectId = typeof companyId === 'string' ? new Types.ObjectId(companyId) : companyId;
  
  const insightsToUpsert: Partial<IInsight>[] = [];

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-02: Department with headcount > 0 and no manager
  // ────────────────────────────────────────────────────────────────────────────
  
  const deptsNoManager = await Department.find({
    company_id: companyObjectId,
    is_active: true,
    $or: [
      { primary_manager_id: { $exists: false } },
      { primary_manager_id: null }
    ]
  }).lean();

  for (const dept of deptsNoManager) {
    // Count active users in this department
    const headcount = await User.countDocuments({
      department_id: dept._id,
      is_active: true
    });

    if (headcount > 0) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'health',
        severity: 'critical',
        title: `${dept.name} has no manager assigned`,
        description: 'Departments with active members must have a primary manager to ensure proper oversight and accountability.',
        reasoning: `Department "${dept.name}" has ${headcount} active member(s) but no primary_manager_id is set.`,
        affected_object_type: 'Department',
        affected_object_id: dept._id.toString(),
        affected_object_label: dept.name,
        remediation_url: `/organization/${dept._id}`,
        remediation_action: 'Assign a primary manager to this department',
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-05: Orphan team (type='team' with no parent)
  // ────────────────────────────────────────────────────────────────────────────
  
  const orphanTeams = await Department.find({
    company_id: companyObjectId,
    is_active: true,
    type: 'team',
    $or: [
      { parent_id: { $exists: false } },
      { parent_id: null }
    ]
  }).lean();

  for (const team of orphanTeams) {
    insightsToUpsert.push({
      company_id: companyObjectId,
      category: 'health',
      severity: 'warning',
      title: `${team.name} is an orphan team`,
      description: 'Teams should be nested under a parent department or division for proper organizational structure.',
      reasoning: `Team "${team.name}" has no parent_id set, making it disconnected from the organizational hierarchy.`,
      affected_object_type: 'Department',
      affected_object_id: team._id.toString(),
      affected_object_label: team.name,
      remediation_url: `/organization/${team._id}`,
      remediation_action: 'Assign this team to a parent department',
      is_resolved: false,
      detected_at: new Date(),
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Upsert insights (avoid duplicates)
  // ────────────────────────────────────────────────────────────────────────────
  
  for (const insight of insightsToUpsert) {
    // Match on company + affected object + title + unresolved status
    // This ensures we don't create duplicate insights for the same issue
    await Insight.updateOne(
      {
        company_id: companyObjectId,
        affected_object_id: insight.affected_object_id,
        title: insight.title,
        is_resolved: false,
      },
      {
        $setOnInsert: insight,
      },
      { upsert: true }
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-resolve insights that no longer apply
  // ────────────────────────────────────────────────────────────────────────────
  
  // Resolve RULE-02 insights where the department now has a manager
  const resolvedManagerInsights = await Department.find({
    company_id: companyObjectId,
    is_active: true,
    primary_manager_id: { $exists: true, $ne: null }
  }).lean();

  for (const dept of resolvedManagerInsights) {
    await Insight.updateMany(
      {
        company_id: companyObjectId,
        affected_object_id: dept._id.toString(),
        title: `${dept.name} has no manager assigned`,
        is_resolved: false,
      },
      {
        $set: {
          is_resolved: true,
          resolved_at: new Date(),
        }
      }
    );
  }

  // Resolve RULE-05 insights where the team now has a parent
  const resolvedParentInsights = await Department.find({
    company_id: companyObjectId,
    is_active: true,
    type: 'team',
    parent_id: { $exists: true, $ne: null }
  }).lean();

  for (const team of resolvedParentInsights) {
    await Insight.updateMany(
      {
        company_id: companyObjectId,
        affected_object_id: team._id.toString(),
        title: `${team.name} is an orphan team`,
        is_resolved: false,
      },
      {
        $set: {
          is_resolved: true,
          resolved_at: new Date(),
        }
      }
    );
  }
};

// Type alias for external imports
type IInsight = import('../models/Insight.model').IInsight;
