import { z } from 'zod';

const CreateTeamSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  department_id: z.string().min(1, 'Department is required'),
  team_lead_id: z.string().min(1, 'Team manager (lead) is required'),
});

const UpdateTeamSchema = CreateTeamSchema.partial().extend({
  team_lead_id: z.string().min(1, 'Team manager (lead) is required').optional(),
});

function test() {
  console.log('--- Testing CreateTeamSchema ---');
  try {
    CreateTeamSchema.parse({
      name: 'Test Team',
      department_id: 'dept123',
      // team_lead_id missing
    });
    console.log('FAIL: CreateTeamSchema should have failed without team_lead_id');
  } catch (err: any) {
    console.log('SUCCESS: CreateTeamSchema failed as expected');
  }

  try {
    CreateTeamSchema.parse({
      name: 'Test Team',
      department_id: 'dept123',
      team_lead_id: '', // empty string
    });
    console.log('FAIL: CreateTeamSchema should have failed with empty team_lead_id');
  } catch (err: any) {
    console.log('SUCCESS: CreateTeamSchema failed with empty team_lead_id');
  }

  console.log('\n--- Testing UpdateTeamSchema ---');
  try {
    UpdateTeamSchema.parse({
      team_lead_id: '', // empty string
    });
    console.log('FAIL: UpdateTeamSchema should have failed with empty team_lead_id');
  } catch (err: any) {
    console.log('SUCCESS: UpdateTeamSchema failed with empty team_lead_id');
  }

  try {
    UpdateTeamSchema.parse({
      name: 'New Name',
      // team_lead_id missing is OK in partial update
    });
    console.log('SUCCESS: UpdateTeamSchema passed without team_lead_id (partial update)');
  } catch (err: any) {
    console.log('FAIL: UpdateTeamSchema should have passed without team_lead_id');
  }
}

test();
