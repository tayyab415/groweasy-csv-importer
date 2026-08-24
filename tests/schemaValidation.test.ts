import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const crmContactSchema = z.object({
  fullName: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
  phone: z.string().optional(),
  company: z.string().optional(),
});

describe('CRM Contact Schema Validation', () => {
  it('validates correct contact data', () => {
    const validContact = {
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+15550199',
      company: 'Tech Corp',
    };
    const result = crmContactSchema.safeParse(validContact);
    expect(result.success).toBe(true);
  });

  it('rejects invalid email formats', () => {
    const invalidContact = {
      fullName: 'John Smith',
      email: 'not-an-email',
    };
    const result = crmContactSchema.safeParse(invalidContact);
    expect(result.success).toBe(false);
  });
});
