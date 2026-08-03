// Self-contained unit tests for the pure functions in the custom field validation service.
// Run with: npm run test-datafield
// These functions do not touch the database, so they are safe to run anywhere.

import { validateFieldValue, evaluateCondition } from '../services/customFieldValidation.service';

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${name}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

// ── evaluateCondition ────────────────────────────────────────────────
check('equals matches', evaluateCondition('a', 'equals', 'a'), true);
check('equals mismatch', evaluateCondition('a', 'equals', 'b'), false);
check('not_equals', evaluateCondition('a', 'not_equals', 'b'), true);
check('contains', evaluateCondition('hello world', 'contains', 'world'), true);
check('greater_than', evaluateCondition('10', 'greater_than', '5'), true);
check('greater_than false', evaluateCondition('4', 'greater_than', '5'), false);
check('is_empty empty string', evaluateCondition('', 'is_empty', null), true);
check('is_empty null', evaluateCondition(null, 'is_empty', null), true);
check('is_not_empty', evaluateCondition('x', 'is_not_empty', null), true);
check('unknown operator returns false', evaluateCondition('x', 'bogus', 'y'), false);

// ── validateFieldValue: required, null handling ──────────────────────
check('required field empty -> required msg', validateFieldValue({ label: 'Lbl', required: true }, ''), 'Lbl is required');
check('optional field empty -> null', validateFieldValue({ label: 'Lbl', required: false }, ''), null);
check('null optional -> null', validateFieldValue({ label: 'Lbl' }, null), null);

// ── number ───────────────────────────────────────────────────────────
const numField = { label: 'Age', field_type: 'number', validation_rules: { min: 0, max: 120 } };
check('number valid', validateFieldValue(numField, 30), null);
check('number below min', validateFieldValue(numField, -5), 'Age must be at least 0');
check('number above max', validateFieldValue(numField, 200), 'Age must be at most 120');
check('number NaN', validateFieldValue(numField, 'abc'), 'Age must be a valid number');

// ── date ─────────────────────────────────────────────────────────────
const dateField = { label: 'Date', field_type: 'date' };
check('date valid', validateFieldValue(dateField, '2026-01-01'), null);
check('date invalid', validateFieldValue(dateField, 'not-a-date'), 'Date must be a valid date');

// ── boolean ──────────────────────────────────────────────────────────
check('boolean true', validateFieldValue({ label: 'B', field_type: 'boolean' }, true), null);
check('boolean string false ok', validateFieldValue({ label: 'B', field_type: 'boolean' }, 'false'), null);
check('boolean garbage', validateFieldValue({ label: 'B', field_type: 'boolean' }, 'maybe'), 'B must be true or false');

// ── select / multi_select ────────────────────────────────────────────
const sel = { label: 'Level', field_type: 'select', select_options: ['A', 'B'] };
check('select valid', validateFieldValue(sel, 'A'), null);
check('select invalid', validateFieldValue(sel, 'C'), 'Level must be one of: A, B');
const ms = { label: 'Tags', field_type: 'multi_select', select_options: ['A', 'B'] };
check('multi valid', validateFieldValue(ms, ['A']), null);
check('multi invalid item', validateFieldValue(ms, ['Z']), 'Tags contains an invalid option: Z');
check('multi non-array', validateFieldValue(ms, 'A'), 'Tags must be an array of selected options');

// ── email / url / phone ──────────────────────────────────────────────
check('email valid', validateFieldValue({ label: 'E', field_type: 'email' }, 'a@b.com'), null);
check('email invalid', validateFieldValue({ label: 'E', field_type: 'email' }, 'nope'), 'E must be a valid email address');
check('url valid', validateFieldValue({ label: 'U', field_type: 'url' }, 'https://x.com'), null);
check('url invalid', validateFieldValue({ label: 'U', field_type: 'url' }, '///x'), 'U must be a valid URL');
check('phone valid', validateFieldValue({ label: 'P', field_type: 'phone' }, '+1 (555) 123-4567'), null);
check('phone invalid', validateFieldValue({ label: 'P', field_type: 'phone' }, 'x'), 'P must be a valid phone number');

// ── string length rules ──────────────────────────────────────────────
const strField = { label: 'S', field_type: 'text', validation_rules: { min_length: 3, max_length: 5 } };
check('text length ok', validateFieldValue(strField, 'abcd'), null);
check('text too short', validateFieldValue(strField, 'ab'), 'S must be at least 3 characters');
check('text too long', validateFieldValue(strField, 'abcdef'), 'S must be at most 5 characters');

// ── regex pattern ────────────────────────────────────────────────────
const pat = { label: 'Code', field_type: 'text', validation_rules: { pattern: '^[A-Z]{3}\\d{4}$', pattern_message: 'Must match format' } };
check('pattern ok', validateFieldValue(pat, 'ABC1234'), null);
check('pattern fails with custom msg', validateFieldValue(pat, 'nope'), 'Must match format');
const badPattern = { label: 'Code', field_type: 'text', validation_rules: { pattern: '([a-z)+' } };
check('broken pattern returns error', validateFieldValue(badPattern, 'x'), 'Code has an invalid validation pattern');

// ── XSS / injection strings are length/pattern-validated, not executed ──
check('xss string passes text', validateFieldValue(strField, '<script>alert(1)</script>'.slice(0, 5)), null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);