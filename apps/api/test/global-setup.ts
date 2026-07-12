import { execSync } from 'child_process';
import { join } from 'path';

/**
 * Creates/synchronizes the dedicated test database schema once per run.
 * `prisma db push` also creates the database itself when it doesn't exist.
 */
export default function globalSetup(): void {
  const url =
    process.env.TEST_DATABASE_URL ??
    'postgresql://accountant:change-me-in-production@localhost:5433/erp_mohankumar_test?schema=public';

  // --accept-data-loss is safe here: this database is throwaway test state,
  // recreated/truncated on every run.
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
