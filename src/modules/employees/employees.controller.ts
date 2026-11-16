// HTTP only: each route declares who may call it, its schemas and audit tag,
// and calls one service method.
import { z } from '@hono/zod-openapi';
import { defineRoutes } from '../../core/routes.ts';
import { rolesWith } from '../../lib/permissions.ts';
import {
  AadhaarBody,
  AadhaarSavedSchema,
  CreateEmployeeBody,
  CreatedEmployeeSchema,
  DuplicateCheckBody,
  DuplicateCheckSchema,
  EmployeeViewSchema,
  IdParam,
  PhotoBody,
  PhotoSavedSchema,
  ProfileSchema,
  SupervisorViewSchema,
  UpdateEmployeeBody,
} from './employees.schemas.ts';
import type { EmployeesService } from './employees.service.ts';

const READERS = rolesWith('employees.read');
const WRITERS = rolesWith('employees.write');

export class EmployeesController {
  readonly service: EmployeesService;

  constructor({ employeesService }: { employeesService: EmployeesService }) {
    this.service = employeesService;
  }

  static readonly routes = defineRoutes<EmployeesController>([
    {
      method: 'post',
      path: '/employees',
      summary: 'Create an employee profile and their OTP login (M3-PRF-01)',
      roles: WRITERS,
      body: CreateEmployeeBody,
      response: CreatedEmployeeSchema,
      status: 201,
      audit: 'employee.create',
      handler: (c, ctx) => c.service.create(ctx.body()),
    },
    {
      method: 'post',
      path: '/employees/duplicate-check',
      summary: 'Check whether this person already exists (M3-PRF-06)',
      roles: WRITERS,
      body: DuplicateCheckBody,
      response: DuplicateCheckSchema,
      status: 200,
      // A POST so an Aadhaar number never sits in a URL (and its logs). It changes nothing, so it writes no audit row.
      audit: 'employee.duplicate_check',
      auditOnChange: true,
      handler: (c, ctx) => c.service.checkDuplicates(ctx.body()),
    },
    {
      method: 'get',
      path: '/employees/{id}',
      summary: 'One page with everything about a person; supervisors get a reduced view (M3-PRF-07)',
      roles: READERS,
      params: IdParam,
      response: z.union([EmployeeViewSchema, SupervisorViewSchema]),
      handler: (c, ctx) => c.service.get(ctx.param('id')),
    },
    {
      method: 'patch',
      path: '/employees/{id}',
      summary: 'Correct profile details; code, mobile and Aadhaar are not editable (M3-PRF-08)',
      roles: WRITERS,
      params: IdParam,
      body: UpdateEmployeeBody,
      response: ProfileSchema,
      audit: 'employee.update',
      handler: (c, ctx) => c.service.update(ctx.param('id'), ctx.body()),
    },
    {
      method: 'put',
      path: '/employees/{id}/photo',
      summary: 'Set the passport-style photo (M3-PRF-03)',
      roles: WRITERS,
      params: IdParam,
      body: PhotoBody,
      response: PhotoSavedSchema,
      audit: 'employee.photo',
      handler: (c, ctx) => c.service.setPhoto(ctx.param('id'), ctx.body<z.infer<typeof PhotoBody>>().imageBase64),
    },
    {
      method: 'put',
      path: '/employees/{id}/aadhaar',
      summary: 'Save Aadhaar (HR once; Admin with a reason to correct) (M3-PRF-05)',
      roles: WRITERS,
      params: IdParam,
      body: AadhaarBody,
      response: AadhaarSavedSchema,
      audit: 'employee.aadhaar',
      handler: (c, ctx) => c.service.setAadhaar(ctx.param('id'), ctx.body()),
    },
  ]);
}
