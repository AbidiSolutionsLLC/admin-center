// Plan 0.7f: ProfileLayout.target_object accepts `location` (the API already did).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { ProfileLayout } from '../ProfileLayout.model';

const doc = (target_object: string) => new ProfileLayout({ company_id: new Types.ObjectId(), target_object, name: 'Layout', fields: [] });

test('target_object accepts user, department, policy and location', () => {
  for (const t of ['user', 'department', 'policy', 'location']) assert.equal(doc(t).validateSync()?.errors?.target_object, undefined, t);
});

test('an unknown target_object is still rejected', () => {
  assert.ok(doc('nonsense').validateSync()?.errors?.target_object);
});
