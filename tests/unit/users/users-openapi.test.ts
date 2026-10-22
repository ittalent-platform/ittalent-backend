import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { describe, expect, it } from 'vitest';

import { registry } from '../../../src/openapi/registry.js';

describe('POST /api/v1/users in the OpenAPI document', () => {
  const document = new OpenApiGeneratorV3(registry.definitions).generateDocument({ openapi: '3.0.3', info: { title: 'Test', version: '1' } });
  const post = (document.paths['/api/v1/users'] as { post: { requestBody: { content: Record<string, { schema: { oneOf: Array<{ $ref: string }> } }> }; responses: Record<string, { content: Record<string, { schema: { oneOf: Array<{ $ref: string }> } }> }> } }).post;

  it('documents both callers in one operation, so neither registration erases the other', () => {
    const body = post.requestBody.content['application/json']!.schema.oneOf.map((entry) => entry.$ref);
    expect(body).toEqual(['#/components/schemas/CreateAdminUserRequest', '#/components/schemas/CreateEmployeeRequest']);
    const created = post.responses['201']!.content['application/json']!.schema.oneOf.map((entry) => entry.$ref);
    expect(created).toEqual(['#/components/schemas/CreateAdminUserResponse', '#/components/schemas/UserDTO']);
  });

  it('keeps every referenced schema in the document', () => {
    const schemas = document.components?.schemas ?? {};
    for (const name of ['CreateAdminUserRequest', 'CreateEmployeeRequest', 'CreateAdminUserResponse', 'UserDTO']) {
      expect(schemas, name).toHaveProperty(name);
    }
  });
});
