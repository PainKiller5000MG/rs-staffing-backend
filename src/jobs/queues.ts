// Background job names and payloads. The API sends, the worker consumes; both
// import from here. Payloads are JSON: ids are strings, months "YYYY-MM".

export const Queues = {
  payrollCompute: 'payroll-compute',
  payslipPdf: 'payslip-pdf',
  importExcel: 'import-excel',
  smsOutbox: 'sms-outbox',
} as const;

export type QueueName = (typeof Queues)[keyof typeof Queues];

export type JobPayloads = {
  'payroll-compute': { runId: string };
  'payslip-pdf': { runId: string; employeeId?: string };
  'import-excel': { importId: string };
  'sms-outbox': { messageId: string };
};
