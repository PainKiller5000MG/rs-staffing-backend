import { z } from '@hono/zod-openapi';

/**
 * One MSG91 SMS "Report Received" event (one per recipient). MSG91 lets the
 * webhook choose its fields; we need requestId, telNum and status, and read
 * failureReason when present. Unknown fields are ignored.
 */
export const Msg91DlrEvent = z
  .object({
    requestId: z.string().min(1),
    telNum: z.string().min(10),
    status: z.union([z.string(), z.number()]).transform(String),
    failureReason: z.string().optional(),
    eventName: z.string().optional(),
  })
  .loose();

export const Msg91DlrBody = z.union([Msg91DlrEvent, z.array(Msg91DlrEvent)]).openapi('Msg91DlrBody');
export type Msg91DlrBody = z.infer<typeof Msg91DlrBody>;

export const DlrResult = z
  .object({ received: z.number().int(), updated: z.number().int(), unmatched: z.number().int() })
  .openapi('DlrResult');
