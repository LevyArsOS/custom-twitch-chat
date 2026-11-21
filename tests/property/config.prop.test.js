import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { SCHEMA_FIELDS } from '../../src/shared/schema.js';
import {
  normalizeConfig,
  encodeConfigHash,
  decodeConfigHash,
} from '../../src/shared/config.js';

const fieldArbitraries = Object.fromEntries(
  SCHEMA_FIELDS.map((field) => {
    if (field.type === 'number') {
      return [field.key, fc.integer({ min: field.min - 10, max: field.max + 10 })];
    }
    if (field.type === 'select') {
      return [field.key, fc.constantFrom(...field.options, 'invalid-choice')];
    }
    return [field.key, fc.string({ maxLength: 40 })];
  })
);

describe('config hash codec properties', () => {
  it('round-trips arbitrary normalized configurations across 1000 runs', () => {
    fc.assert(
      fc.property(fc.record(fieldArbitraries), (raw) => {
        const expected = normalizeConfig(raw);
        const decoded = decodeConfigHash(encodeConfigHash(raw));
        expect(decoded).toEqual(expected);
      }),
      { numRuns: 1000 }
    );
  });
});
