// HTTP only: each route declares who may call it, its schemas and audit tag,
// and calls one service method.
import { defineRoutes } from '../../core/routes.ts';
import { rolesWith } from '../../lib/permissions.ts';
import {
  AssignScopeBody,
  ChangeRoleBody,
  CreateUserBody,
  IdParam,
  ListUsersQuery,
  MeSchema,
  ScopeIdParam,
  SiteScopeSchema,
  UserDetailSchema,
  UserListSchema,
  UserSchema,
} from './users.schemas.ts';
import type { UsersService } from './users.service.ts';

const USER_READERS = rolesWith('users.read');
const USER_WRITERS = rolesWith('users.write');
/** M1-USR-07: assigning sites is site administration (Admin, Payroll/HR). */
const SCOPE_WRITERS = rolesWith('sites.write');

export class UsersController {
  readonly service: UsersService;

  constructor({ usersService }: { usersService: UsersService }) {
    this.service = usersService;
  }

  static readonly routes = defineRoutes<UsersController>([
    {
      method: 'get',
      path: '/me',
      summary: 'Who is signed in (M1-LOG-07)',
      roles: 'authenticated',
      response: MeSchema,
      handler: (c) => c.service.me(),
    },
    {
      method: 'get',
      path: '/users',
      summary: 'List and search users (M1-USR-04)',
      roles: USER_READERS,
      query: ListUsersQuery,
      response: UserListSchema,
      handler: (c, ctx) => c.service.list(ctx.query()),
    },
    {
      method: 'get',
      path: '/users/{id}',
      summary: 'Get a user with their site scopes',
      roles: USER_READERS,
      params: IdParam,
      response: UserDetailSchema,
      handler: (c, ctx) => c.service.get(ctx.param('id')),
    },
    {
      method: 'post',
      path: '/users',
      summary: 'Create a user (M1-USR-01)',
      roles: USER_WRITERS,
      body: CreateUserBody,
      response: UserSchema,
      status: 201,
      audit: 'user.create',
      handler: (c, ctx) => c.service.create(ctx.body()),
    },
    {
      method: 'patch',
      path: '/users/{id}/role',
      summary: 'Change a user role (M1-USR-05)',
      roles: USER_WRITERS,
      params: IdParam,
      body: ChangeRoleBody,
      response: UserSchema,
      audit: 'user.role_change',
      handler: (c, ctx) => c.service.changeRole(ctx.param('id'), ctx.body()),
    },
    {
      method: 'post',
      path: '/users/{id}/disable',
      summary: 'Disable a user and end their sessions (M1-USR-06)',
      roles: USER_WRITERS,
      params: IdParam,
      response: UserSchema,
      audit: 'user.disable',
      handler: (c, ctx) => c.service.disable(ctx.param('id')),
    },
    {
      method: 'post',
      path: '/users/{id}/enable',
      summary: 'Re-enable a user (M1-USR-06)',
      roles: USER_WRITERS,
      params: IdParam,
      response: UserSchema,
      audit: 'user.enable',
      handler: (c, ctx) => c.service.enable(ctx.param('id')),
    },
    {
      method: 'post',
      path: '/users/{id}/site-scopes',
      summary: 'Assign a site to a supervisor — pending until approved (M1-USR-07)',
      roles: SCOPE_WRITERS,
      params: IdParam,
      body: AssignScopeBody,
      response: SiteScopeSchema,
      status: 201,
      audit: 'user_site_scope.assign',
      makerChecker: true,
      handler: (c, ctx) => c.service.assignScope(ctx.param('id'), ctx.body()),
    },
    {
      method: 'post',
      path: '/site-scopes/{scopeId}/approve',
      summary: 'Approve a pending site scope (someone other than its creator)',
      roles: SCOPE_WRITERS,
      params: ScopeIdParam,
      response: SiteScopeSchema,
      audit: 'user_site_scope.approve',
      makerChecker: true,
      handler: (c, ctx) => c.service.approveScope(ctx.param('scopeId')),
    },
    {
      method: 'post',
      path: '/site-scopes/{scopeId}/revoke',
      summary: 'End a site scope now',
      roles: SCOPE_WRITERS,
      params: ScopeIdParam,
      response: SiteScopeSchema,
      audit: 'user_site_scope.revoke',
      handler: (c, ctx) => c.service.revokeScope(ctx.param('scopeId')),
    },
  ]);
}
