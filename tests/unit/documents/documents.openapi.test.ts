import { describe, expect, it } from 'vitest';

import { createOpenApiDocument } from '../../../src/openapi/document.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

describe('Documents OpenAPI contract', () => {
  it('documents PDF previews as binary and DOC/DOCX previews as JSON', () => {
    const document = createOpenApiDocument();
    const preview = document.paths['/api/v1/documents/{id}/preview']?.get;
    const response = preview?.responses[HTTP_STATUS.HTTP_200_OK];
    const content = 'content' in response && response.content ? response.content : undefined;

    expect(content?.['application/pdf']?.schema).toMatchObject({
      type: 'string',
      format: 'binary',
    });
    expect(content?.['application/json']?.schema).toBeDefined();
  });
});
