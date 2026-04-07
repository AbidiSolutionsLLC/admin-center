export interface Department {
  _id: string; // MongoDB ObjectId as string
  company_id: string;
  name: string;
  slug: string;
  type: 'business_unit' | 'division' | 'department' | 'team' | 'cost_center';
  parent_id: string | null;
  primary_manager_id: string | null;
  secondary_manager_id?: string | null;
  primary_manager?: { _id: string; full_name: string; avatar_url?: string };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateDepartmentInput {
  name: string;
  type: 'business_unit' | 'division' | 'department' | 'team' | 'cost_center';
  parent_id?: string | null;
  primary_manager_id?: string | null;
  secondary_manager_id?: string | null;
}

export interface UpdateDepartmentInput extends Partial<CreateDepartmentInput> {}

export interface OrgTreeNode extends Department {
  children?: OrgTreeNode[];
}
