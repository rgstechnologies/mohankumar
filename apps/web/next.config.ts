import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Self-contained server bundle — required by docker/web.Dockerfile
  output: 'standalone',
  transpilePackages: ['@bookly/shared'],
  turbopack: {
    // Pin the monorepo root so Turbopack doesn't pick up a stray lockfile
    root: path.resolve(__dirname, '../../'),
  },
};

export default withNextIntl(nextConfig);
