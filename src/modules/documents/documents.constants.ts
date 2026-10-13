export const DOCUMENT_MESSAGES = {
  NOT_FOUND: 'Document not found',
  IN_USE: 'Document cannot be deleted because an application references it.',
  DOWNLOAD_FAILED: 'Document file could not be downloaded',
  PREVIEW_UNSUPPORTED:
    'Document preview is only supported for PDF, DOC, and DOCX files',
} as const;

export const DOCUMENT_SEARCH_MAX_LENGTH = 100;
export const GOOGLE_DOCS_VIEWER_URL = 'https://docs.google.com/gview';
