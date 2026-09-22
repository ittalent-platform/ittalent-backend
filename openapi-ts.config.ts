import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: 'http://localhost:3000/openapi.json',
  output: 'generated/client',
  plugins: ['@hey-api/client-fetch'],
});
