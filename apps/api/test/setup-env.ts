/**
 * Test environment — applied before every test file.
 * Points the app at the dedicated test database so tests can never
 * touch development data.
 */

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://accountant:change-me-in-production@localhost:5433/erp_mohankumar_test?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789';
process.env.WEB_ORIGIN = 'http://localhost:3000';
// Tests use supertest against the in-memory server — this port is never bound.
process.env.API_PORT = '4099';
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1';
