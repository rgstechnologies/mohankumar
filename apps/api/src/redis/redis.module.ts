import {
  Global,
  Inject,
  Injectable,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS = Symbol('REDIS');

/** Closes the Redis connection on shutdown — without this the factory-created
 *  client keeps the event loop alive (graceful shutdown + Jest both hang). */
@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis =>
        new Redis(config.getOrThrow<string>('REDIS_URL'), {
          maxRetriesPerRequest: 3,
          lazyConnect: false,
        }),
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}
