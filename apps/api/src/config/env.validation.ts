import { z } from 'zod';

/**
 * Environment schema — the API refuses to boot with an invalid config,
 * so misconfiguration surfaces at startup instead of at 2am in production.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  /// Extra allowed CORS origins (comma-separated) — for the desktop/mobile app
  /// shells or alternate web domains, on top of WEB_ORIGIN and the built-in
  /// Electron/Capacitor localhost origins.
  CORS_ORIGINS: z.string().optional().default(''),
  /// Public base URL of the API (share links). Defaults to WEB_ORIGIN + /api/v1,
  /// which is correct behind the production nginx; dev needs the :4000 origin.
  API_PUBLIC_URL: z.string().url().optional(),
  SUPER_ADMIN_EMAIL: z.string().email().optional(),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000),

  /// Key for encrypting secrets at rest (e.g. e-way bill API passwords).
  /// Optional — falls back to JWT_ACCESS_SECRET when unset. Set a dedicated
  /// value in production so rotating JWT secrets doesn't orphan encrypted data.
  ENCRYPTION_KEY: z.string().optional().default(''),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  // NOTE: z.coerce.boolean() would treat the string "false" as true —
  // parse the literal strings instead.
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_FROM: z.string().default('RGS <no-reply@bookly.local>'),
  /// Inbox that receives "Contact sales" enquiry notifications. Empty = disabled.
  SALES_NOTIFY_EMAIL: z.string().optional().default(''),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./storage'),

  // AI layer — 'none' keeps every AI endpoint cleanly disabled (503).
  AI_PROVIDER: z.enum(['none', 'gemini']).default('none'),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),

  // Razorpay — empty keys disable online plan upgrades (admin can still
  // activate plans manually from the console).
  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),

  // Sandbox.co.in — GST Data + E-Invoicing APIs. Leave blank to keep the
  // built-in simulator active (safe for dev/test). Set all three to route
  // real GST operations through Sandbox.
  SANDBOX_API_KEY: z.string().optional().default(''),
  SANDBOX_API_SECRET: z.string().optional().default(''),
  SANDBOX_API_URL: z.string().url().optional().default('https://api.sandbox.co.in'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
