import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BalancesModule } from '../balances/balances.module';
import { ReportsModule } from '../reports/reports.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AI_PROVIDER, type AiProvider } from './ai-provider.interface';
import { GeminiProvider } from './providers/gemini.provider';
import { UnconfiguredProvider } from './providers/unconfigured.provider';

function buildProvider(config: ConfigService): AiProvider {
  const logger = new Logger('AiModule');
  const choice = config.get<string>('AI_PROVIDER') ?? 'none';

  if (choice === 'gemini') {
    const apiKey = config.get<string>('GEMINI_API_KEY') ?? '';
    if (!apiKey) {
      logger.warn('AI_PROVIDER=gemini but GEMINI_API_KEY is empty — AI disabled');
      return new UnconfiguredProvider();
    }
    const model = config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash';
    logger.log(`AI enabled: gemini (${model})`);
    return new GeminiProvider(apiKey, model);
  }

  if (choice !== 'none') {
    logger.warn(`Unknown AI_PROVIDER "${choice}" — AI disabled`);
  }
  return new UnconfiguredProvider();
}

@Module({
  imports: [ReportsModule, BalancesModule],
  controllers: [AiController],
  providers: [
    AiService,
    {
      provide: AI_PROVIDER,
      useFactory: buildProvider,
      inject: [ConfigService],
    },
  ],
  exports: [AiService, AI_PROVIDER],
})
export class AiModule {}
