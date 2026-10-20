import { describe, expect, it } from 'vitest';

import { createOpenApiDocument } from '../../../src/openapi/document.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

describe('Notifications OpenAPI contract', () => {
  it('registers all notification inbox and device token endpoints in OpenAPI specification', () => {
    const doc = createOpenApiDocument();

    expect(doc.paths['/api/v1/notifications']?.get).toBeDefined();
    expect(doc.paths['/api/v1/notifications/stream']?.get).toBeDefined();
    expect(doc.paths['/api/v1/notifications/unread-count']?.get).toBeDefined();
    expect(doc.paths['/api/v1/notifications/read-all']?.patch).toBeDefined();
    expect(doc.paths['/api/v1/notifications/{id}/read']?.patch).toBeDefined();
    expect(doc.paths['/api/v1/notifications/{id}']?.delete).toBeDefined();
    expect(doc.paths['/api/v1/notifications']?.delete).toBeDefined();
    expect(doc.paths['/api/v1/notifications/devices']?.post).toBeDefined();
    expect(doc.paths['/api/v1/notifications/devices/{token}']?.delete).toBeDefined();

    const getInbox = doc.paths['/api/v1/notifications']?.get;
    expect(getInbox?.responses[HTTP_STATUS.HTTP_200_OK]).toBeDefined();
    expect(getInbox?.security).toEqual([{ bearerAuth: [] }]);

    const getStream = doc.paths['/api/v1/notifications/stream']?.get;
    expect(getStream?.responses[HTTP_STATUS.HTTP_200_OK]).toBeDefined();
    expect(getStream?.security).toEqual([{ bearerAuth: [] }]);

    const deleteOne = doc.paths['/api/v1/notifications/{id}']?.delete;
    expect(deleteOne?.responses[HTTP_STATUS.HTTP_200_OK]).toBeDefined();
    expect(deleteOne?.responses[HTTP_STATUS.HTTP_404_NOT_FOUND]).toBeDefined();
  });
});
