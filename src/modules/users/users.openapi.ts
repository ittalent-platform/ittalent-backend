import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  createEmployeeBodySchema,
  emergencySuspensionBodySchema,
  roleUpdateBodySchema,
  updateUserBodySchema,
  updateUserStatusBodySchema,
  userDtoSchema,
  userHistoryResponseSchema,
  userIdParamSchema,
  userListQuerySchema,
  userListResponseSchema,
} from './users.schemas.js';

export function registerUsersOpenApi(registry: OpenAPIRegistry): void {
  const registeredUserDto = registry.register('UserDTO', userDtoSchema);
  const registeredUserList = registry.register('UserListResponse', userListResponseSchema);
  const registeredUpdateUserRequest = registry.register('UpdateUserRequest', updateUserBodySchema);
  const registeredCreateEmployeeRequest = registry.register('CreateEmployeeRequest', createEmployeeBodySchema);
  const registeredUpdateUserStatusRequest = registry.register('UpdateUserStatusRequest', updateUserStatusBodySchema);
  const registeredUserHistoryResponse = registry.register('UserHistoryResponse', userHistoryResponseSchema);
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

  // UC-10 / UC-EMP-01: Create employee account
  registry.registerPath({
    method: 'post',
    path: '/api/v1/users',
    tags: ['Users', 'Employees'],
    operationId: 'createEmployee',
    summary: 'Create employee account',
    description: 'Provisions a new staff or recruiter account under authorized enterprise tenancy (UC-10).',
    security: [{ bearerAuth: [] }],
    request: {
      body: { required: true, content: { 'application/json': { schema: registeredCreateEmployeeRequest } } },
    },
    responses: {
      [HTTP_STATUS.HTTP_201_CREATED]: {
        description: 'Employee account created successfully',
        content: { 'application/json': { schema: registeredUserDto } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Validation error on input fields' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Insufficient permissions' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Corporate email is already registered' },
      [HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]: { description: 'Account storage unavailable' },
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
      'Retrieves paginated user accounts. Scoped to caller enterprise if recruiter, or global for system admin (UC-13, UC-16).',
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

  // UC-15 / UC-EMP-06: Employee history
  registry.registerPath({
    method: 'get',
    path: '/api/v1/users/{id}/history',
    tags: ['Users', 'Employees'],
    operationId: 'getUserHistory',
    summary: 'View employee account history',
    description: 'Retrieves audit trail and lifecycle modification events for the employee (UC-15).',
    security: [{ bearerAuth: [] }],
    request: { params: userIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Employee audit history events',
        content: { 'application/json': { schema: registeredUserHistoryResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid user ID format' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Insufficient permissions' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'User not found' },
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
    description: 'Updates employee details; email is immutable; self-role change blocked (UC-11).',
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
