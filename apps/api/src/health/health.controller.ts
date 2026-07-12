import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@bookly/shared';
import Redis from 'ioredis';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness + dependency health' })
  async check(): Promise<HealthResponse> {
    const [db, redis] = await Promise.all([this.checkDb(), this.checkRedis()]);
    return {
      status: db === 'up' && redis === 'up' ? 'ok' : 'degraded',
      db,
      redis,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  private async checkDb(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<'up' | 'down'> {
    try {
      return (await this.redis.ping()) === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
