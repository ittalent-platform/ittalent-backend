import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  createEmployeeBodySchema,
  emergencySuspensionBodySchema,
  roleUpdateBodySchema,
  statusUpdateBodySchema,
  updateUserBodySchema,
  userDtoSchema,
  userIdParamSchema,
  userListQuerySchema,
  userListResponseSchema,
} from './users.schemas.js';

export function registerUsersOpenApi(registry: OpenAPIRegistry): void {
  const registeredUserDto = registry.register('UserDTO', userDtoSchema);
  const registeredUserList = registry.register('UserListResponse', userListResponseSchema);
  const registeredUpdateUserRequest = registry.register('UpdateUserRequest', updateUserBodySchema);
  // The create operation itself lives in user-invitations.openapi.ts: both callers share POST /api/v1/users and
  // the OpenAPI document keeps only one operation per path and method.
  registry.register('CreateEmployeeRequest', createEmployeeBodySchema);
  const registeredUpdateUserStatusRequest = registry.register('UpdateUserStatusRequest', statusUpdateBodySchema);
  const registeredRoleUpdate = registry.register('UpdateUserRoleRequest', roleUpdateBodySchema);
  const emergencySuspension = registry.register('EmergencyUserSuspensionRequest', emergencySuspensionBodySchema);

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/users/{id}/role',
    tags: ['Users'],
    summary: 'Change a company account role between HR and Enterprise Administrator',
    security: [{ bearerAuth: [] }],
    request: { params: userIdParamSchema, body: { required: true, content: { 'application/json': { schema: registeredRoleUpdate } } } },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Updated account role', content: { 'application/json': { schema: registeredUserDto } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid account ID or role change' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Active System Administrator required' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Account not found' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Invalid transition, stale version or final Enterprise Administrator' },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/users/{id}/emergency-suspension',
    tags: ['Users'],
    summary: 'Urgently suspend an account with a required audit reason',
    security: [{ bearerAuth: [] }],
    request: { params: userIdParamSchema, body: { required: true, content: { 'application/json': { schema: emergencySuspension } } } },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Account suspended and sessions revoked', content: { 'application/json': { schema: registeredUserDto } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid request' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Active System Administrator required' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Account not found' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Platform administrator cannot self-suspend or suspend the final platform administrator' },
    },
  });

  // UC-13 / UC-EMP-04 & UC-16 / UC-EMP-07: List & Search employees
  registry.registerPath({
    method: 'get',
    path: '/api/v1/users',
    tags: ['Users', 'Employees'],
    operationId: 'listUsers',
    summary: 'List and search employee accounts',
    description:
      'Retrieves paginated recruiter accounts. Scoped to caller enterprise for enterprise admins and recruiters, or global for system admins (UC-13, UC-16).',
    security: [{ bearerAuth: [] }],
    request: { query: userListQuerySchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Paginated user/employee accounts',
        content: { 'application/json': { schema: registeredUserList } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid query parameters' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Insufficient permissions' },
      [HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]: { description: 'Storage unavailable' },
    },
  });

  // UC-12 / UC-EMP-03: Update employee status
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/users/{id}/status',
    tags: ['Users', 'Employees'],
    operationId: 'updateUserStatus',
    summary: 'Update employee account status',
    description: 'Suspends or activates an employee account with audit logging (UC-12). Self-suspension is blocked.',
    security: [{ bearerAuth: [] }],
    request: {
      params: userIdParamSchema,
      body: { required: true, content: { 'application/json': { schema: registeredUpdateUserStatusRequest } } },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Status updated successfully',
        content: { 'application/json': { schema: registeredUserDto } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid status transition or missing reason' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Cannot suspend own account or cross-tenant forbidden' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'User not found' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Illegal transition, stale version, final System Administrator, or final Enterprise Administrator' },
    },
  });

  // UC-14 / UC-EMP-05: Get employee detail
  registry.registerPath({
    method: 'get',
    path: '/api/v1/users/{id}',
    tags: ['Users', 'Employees'],
    operationId: 'getUserById',
    summary: 'Get employee by ID',
    description: 'Retrieves employee details with tenancy boundary verification (UC-14).',
    security: [{ bearerAuth: [] }],
    request: { params: userIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'User details retrieved successfully',
        content: { 'application/json': { schema: registeredUserDto } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid user ID' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Insufficient permissions' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'User not found' },
    },
  });

  // UC-11 / UC-EMP-02: Update employee information
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/users/{id}',
    tags: ['Users', 'Employees'],
    operationId: 'patchApiV1UsersById',
    summary: 'Update employee information',
    description: 'System administrators update accounts globally. Enterprise administrators can update recruiter accounts in their enterprise; recruiters can update only their own profile. Email is immutable and writes require expectedVersion.',
    security: [{ bearerAuth: [] }],
    request: {
      params: userIdParamSchema,
      body: { required: true, content: { 'application/json': { schema: registeredUpdateUserRequest } } },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Updated user account',
        content: { 'application/json': { schema: registeredUserDto } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid user ID or update body' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Self-role change blocked or unauthorized' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'User not found' },
      [HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]: { description: 'Account storage unavailable' },
    },
  });
}
