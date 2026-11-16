// HTTP only: each route declares who may call it, its schemas and audit tag.
import { defineRoutes } from '../../core/routes.ts';
import { rolesWith } from '../../lib/permissions.ts';
import {
  BankAccountListSchema,
  BankAccountSchema,
  BankIdParam,
  CreateBankAccountBody,
  EmployeeIdParam,
  IfscParam,
  IfscSchema,
  ReasonBody,
} from './bank-accounts.schemas.ts';
import type { BankAccountsService } from './bank-accounts.service.ts';

const READERS = rolesWith('bank.read');
const WRITERS = rolesWith('bank.write');
const APPROVERS = rolesWith('bank.approve');

export class BankAccountsController {
  readonly service: BankAccountsService;

  constructor({ bankAccountsService }: { bankAccountsService: BankAccountsService }) {
    this.service = bankAccountsService;
  }

  static readonly routes = defineRoutes<BankAccountsController>([
    {
      method: 'get',
      path: '/ifsc/{ifsc}',
      summary: 'Look up a bank and branch from an IFSC (M3-BNK-01)',
      roles: WRITERS,
      params: IfscParam,
      response: IfscSchema,
      handler: (c, ctx) => c.service.lookupIfsc(ctx.param('ifsc')),
    },
    {
      method: 'get',
      path: '/employees/{id}/bank-accounts',
      summary: 'Bank accounts of an employee, newest first, number masked (M3-BNK-01)',
      roles: READERS,
      params: EmployeeIdParam,
      response: BankAccountListSchema,
      handler: (c, ctx) => c.service.list(ctx.param('id')),
    },
    {
      method: 'post',
      path: '/employees/{id}/bank-accounts',
      summary: 'Enter a bank account; it grants nothing until verified and approved (M3-BNK-01)',
      roles: WRITERS,
      params: EmployeeIdParam,
      body: CreateBankAccountBody,
      response: BankAccountSchema,
      status: 201,
      audit: 'bank_account.create',
      handler: (c, ctx) => c.service.create(ctx.param('id'), ctx.body()),
    },
    {
      method: 'post',
      path: '/bank-accounts/{id}/verify',
      summary: 'Penny-drop verification and name match (M3-BNK-02)',
      roles: WRITERS,
      params: BankIdParam,
      response: BankAccountSchema,
      status: 200,
      audit: 'bank_account.verify',
      handler: (c, ctx) => c.service.verify(ctx.param('id')),
    },
    {
      method: 'post',
      path: '/bank-accounts/{id}/approve-mismatch',
      summary: 'Admin accepts a name mismatch with a reason (M3-BNK-02)',
      roles: APPROVERS,
      params: BankIdParam,
      body: ReasonBody,
      response: BankAccountSchema,
      status: 200,
      audit: 'bank_account.mismatch_approve',
      makerChecker: true,
      handler: (c, ctx) => c.service.approveMismatch(ctx.param('id'), ctx.body()),
    },
    {
      method: 'post',
      path: '/bank-accounts/{id}/approve',
      summary: 'Checker approves the account; the previous one is closed (M3-BNK-03)',
      roles: APPROVERS,
      params: BankIdParam,
      response: BankAccountSchema,
      status: 200,
      audit: 'bank_account.approve',
      makerChecker: true,
      handler: (c, ctx) => c.service.approve(ctx.param('id')),
    },
  ]);
}
