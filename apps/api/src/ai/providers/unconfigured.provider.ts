import { ServiceUnavailableException } from '@nestjs/common';
import type { AiProvider } from '../ai-provider.interface';

/** Used when AI_PROVIDER=none or the chosen provider is missing its API key. */
export class UnconfiguredProvider implements AiProvider {
  readonly name = 'none';
  readonly model = 'none';

  completeJson(): Promise<string> {
    throw new ServiceUnavailableException(
      'AI is not configured on this server — set AI_PROVIDER and the matching API key',
    );
  }
}
