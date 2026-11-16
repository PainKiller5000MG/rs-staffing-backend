// HTTP only: each route declares who may call it, its schemas and audit tag.
import { defineRoutes } from '../../core/routes.ts';
import { rolesWith } from '../../lib/permissions.ts';
import {
  AsOfQuery,
  DeployBody,
  DeploymentListSchema,
  DeploymentSchema,
  EmployeeIdParam,
  RedeploySchema,
  ReviseBody,
  StaffTypeBody,
  StaffTypeResultSchema,
} from './deployments.schemas.ts';
import type { DeploymentsService } from './deployments.service.ts';

// Pay is in every row, so reading follows payroll.read (HQ staff and auditors), not employees.read.
const READERS = rolesWith('payroll.read');
const WRITERS = rolesWith('employees.write');

export class DeploymentsController {
  readonly service: DeploymentsService;

  constructor({ deploymentsService }: { deploymentsService: DeploymentsService }) {
    this.service = deploymentsService;
  }

  static readonly routes = defineRoutes<DeploymentsController>([
    {
      method: 'get',
      path: '/employees/{id}/deployments',
      summary: 'Where an employee has worked, newest first; asOf returns the one running that day (M3-DEP-03)',
      roles: READERS,
      params: EmployeeIdParam,
      query: AsOfQuery,
      response: DeploymentListSchema,
      handler: (c, ctx) => c.service.list(ctx.param('id'), ctx.query<AsOfQuery>().asOf),
    },
    {
      method: 'post',
      path: '/employees/{id}/deployments',
      summary: 'Deploy an employee to a client site (M3-DEP-01)',
      roles: WRITERS,
      params: EmployeeIdParam,
      body: DeployBody,
      response: DeploymentSchema,
      status: 201,
      audit: 'deployment.create',
      handler: (c, ctx) => c.service.deploy(ctx.param('id'), ctx.body()),
    },
    {
      method: 'post',
      path: '/employees/{id}/redeploy',
      summary: 'Move an employee to another site in one step (M3-DEP-02)',
      roles: WRITERS,
      params: EmployeeIdParam,
      body: DeployBody,
      response: RedeploySchema,
      status: 201,
      audit: 'deployment.redeploy',
      handler: (c, ctx) => c.service.redeploy(ctx.param('id'), ctx.body()),
    },
    {
      method: 'post',
      path: '/employees/{id}/salary-revisions',
      summary: 'Change pay from a date; back-dating is allowed (M3-DEP-05)',
      roles: WRITERS,
      params: EmployeeIdParam,
      body: ReviseBody,
      response: DeploymentSchema,
      status: 201,
      audit: 'deployment.revise',
      handler: (c, ctx) => c.service.revise(ctx.param('id'), ctx.body()),
    },
    {
      method: 'put',
      path: '/employees/{id}/staff-type',
      summary: 'Mark an employee as deployed or internal staff (M3-DEP-04)',
      roles: WRITERS,
      params: EmployeeIdParam,
      body: StaffTypeBody,
      response: StaffTypeResultSchema,
      audit: 'employee.staff_type',
      handler: (c, ctx) => c.service.setStaffType(ctx.param('id'), ctx.body()),
    },
  ]);
}
