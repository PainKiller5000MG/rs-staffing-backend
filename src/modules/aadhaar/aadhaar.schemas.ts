import { z } from '@hono/zod-openapi';

export const AadhaarRefParam = z.object({ ref: z.uuid().openapi({ param: { name: 'ref', in: 'path' } }) });

export const REVEAL_REASONS = ['PF_KYC', 'ESIC_REGISTRATION', 'VERIFICATION', 'OTHER'] as const;

export const RevealBody = z
  .object({
    reason: z.enum(REVEAL_REASONS),
    reasonText: z.string().trim().min(1).max(300).optional(),
  })
  .strict()
  .openapi('AadhaarRevealBody');
export type RevealBody = z.infer<typeof RevealBody>;

export const RevealedSchema = z
  .object({
    number: z.string(),
    last4: z.string(),
    /** The UI shows it this long and never caches it. */
    displaySeconds: z.number().int(),
  })
  .openapi('AadhaarRevealed');
