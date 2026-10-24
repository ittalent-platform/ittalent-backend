import { describe, expect, it } from 'vitest';

import { createOpenApiDocument } from '../../../src/openapi/document.js';

interface OpenApiSchemaShape {
  required?: string[];
  oneOf?: unknown[];
}

interface OpenApiDocumentShape {
  components?: { schemas?: Record<string, OpenApiSchemaShape> };
  paths?: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
}

describe('personal profile and password OpenAPI contract', () => {
  it('requires optimistic versioning and explicit password confirmation', () => {
    const document = createOpenApiDocument() as unknown as OpenApiDocumentShape;
    expect(document.components?.schemas?.UpdateMyProfile?.required).toContain('expectedVersion');
    expect(document.components?.schemas?.ChangePasswordRequest?.required).toEqual(
      expect.arrayContaining(['currentPassword', 'newPassword', 'confirmation']),
    );
    expect(JSON.stringify(document.components?.schemas?.ChangePasswordRequest)).not.toContain('revokeOtherSessions');
  });

  it('publishes basic/full projections and stable mutation outcomes', () => {
    const document = createOpenApiDocument() as unknown as OpenApiDocumentShape;
    expect(document.components?.schemas?.MyProfile?.oneOf).toHaveLength(2);
    expect(document.paths?.['/api/v1/me/profile']?.patch?.responses).toHaveProperty('403');
    expect(document.paths?.['/api/v1/me/profile']?.patch?.responses).toHaveProperty('409');
    expect(document.paths?.['/api/v1/me/profile/avatar']?.patch?.responses).toHaveProperty('403');
    expect(document.paths?.['/api/v1/auth/change-password']?.post?.responses).toHaveProperty('429');
  });

  it('declares JSON bodies for every runtime error response', () => {
    const document = createOpenApiDocument() as unknown as OpenApiDocumentShape;
    const profilePaths = document.paths;

    expect(profilePaths?.['/api/v1/me/profile']?.get?.responses?.['404'])
      .toMatchObject({ content: { 'application/json': expect.anything() } });
    expect(profilePaths?.['/api/v1/me/profile/avatar']?.patch?.responses?.['502'])
      .toMatchObject({ content: { 'application/json': expect.anything() } });
    expect(profilePaths?.['/api/v1/me/profile/avatar']?.patch?.responses?.['503'])
      .toMatchObject({ content: { 'application/json': expect.anything() } });
  });
});
