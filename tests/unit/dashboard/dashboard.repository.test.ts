import { describe, expect, it } from 'vitest';

import { registrationDisplayName } from '../../../src/modules/dashboard/dashboard.repository.js';

describe('registrationDisplayName', () => {
  const email = 'contact@pixel-labs.example';

  it('uses the company name when there is one', () => {
    expect(registrationDisplayName('Pixel Labs', email)).toBe('Pixel Labs');
    expect(registrationDisplayName('  Pixel Labs  ', email)).toBe('Pixel Labs');
  });

  it('falls back to the corporate email when the name is missing', () => {
    expect(registrationDisplayName(undefined, email)).toBe(email);
    expect(registrationDisplayName(null, email)).toBe(email);
  });

  it('falls back to the corporate email when the name is empty or blank', () => {
    expect(registrationDisplayName('', email)).toBe(email);
    expect(registrationDisplayName('   ', email)).toBe(email);
  });
});
