// client/src/services/locationsApi.ts
import { apiClient } from '@/lib/apiClient';

export interface AssignmentRulesForm {
  rules: Array<{
    target_type: 'location';
    target_id: string;
  }>;
}

export const locationsApi = {
  // Get policy assignments for a specific policy version
  getLocationAssignments: async (
    policyVersionId: string,
    companyId: string
  ): Promise<Array<{ _id: string; target_label: string; created_at: string }>> => {
    const response = await apiClient.get(
      `/policies/${policyVersionId}/assignments`
    );
    return response.data.data;
  },

  // Assign policy to specific locations
  assignPolicyToLocations: async (
    policyVersionId: string,
    rules: AssignmentRulesForm
  ): Promise<void> => {
    await apiClient.post(`/policies/${policyVersionId}/assignments`, rules);
  },

  // Remove location assignment for a policy
  removeLocationAssignment: async (
    policyVersionId: string,
    locationId: string
  ): Promise<void> => {
    await apiClient.delete(`/policies/assignments/${policyVersionId}/location/${locationId}`);
  },

  // Get locations eligible for policy assignment
  getLocations: async (): Promise<Array<{
    _id: string;
    name: string;
    type: string;
    user_count?: number;
  }>> => {
    const response = await apiClient.get('/locations');
    return response.data.data;
  },

  // Get all locations tree for organization
  getLocationTree: async (): Promise<any[]> => {
    const response = await apiClient.get('/locations/tree');
    return response.data.data;
  },

  // Get users assigned to a location
  getLocationUsers: async (locationId: string): Promise<any[]> => {
    const response = await apiClient.get(`/locations/${locationId}/users`);
    return response.data.data;
  },

  // Get policies overview for a location (global + location-specific)
  getLocationPolicies: async (locationId: string): Promise<any> => {
    const response = await apiClient.get(`/locations/${locationId}/policies`);
    return response.data.data;
  },

  // Get effective settings for a location
  getLocationEffectiveSettings: async (locationId: string): Promise<any> => {
    const response = await apiClient.get(`/locations/${locationId}/effective-settings`);
    return response.data.data;
  },

  // Assign a published policy to a location
  assignPolicyToLocation: async (locationId: string, policyVersionId: string): Promise<void> => {
    await apiClient.post(`/locations/${locationId}/assign-policy`, { policy_version_id: policyVersionId });
  },

  // Remove a policy from a location
  removePolicyFromLocation: async (locationId: string, policyVersionId: string): Promise<void> => {
    await apiClient.delete(`/locations/${locationId}/policies/${policyVersionId}`);
  },

  // Get effective settings for a user (inherited from location)
  getUserEffectiveSettings: async (userId: string): Promise<any> => {
    const response = await apiClient.get(`/people/${userId}/effective-settings`);
    return response.data.data;
  },
};