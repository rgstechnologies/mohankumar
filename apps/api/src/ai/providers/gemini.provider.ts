import {
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AiJsonRequest, AiProvider } from '../ai-provider.interface';

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message?: string };
}

/** Google AI Studio / Gemini API adapter (REST, no SDK dependency). */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  private readonly logger = new Logger('GeminiProvider');

  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async completeJson(request: AiJsonRequest): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    const send = () =>
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [
            {
              role: 'user',
              parts: [
                ...(request.file
                  ? [
                      {
                        inlineData: {
                          mimeType: request.file.mimeType,
                          data: request.file.data,
                        },
                      },
                    ]
                  : []),
                { text: request.prompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: request.maxOutputTokens ?? 4096,
            responseMimeType: 'application/json',
          },
        }),
      });

    let response: Response;
    try {
      response = await send();
      // Google's free tier intermittently 5xxes under load ("high demand") —
      // one short retry absorbs most of those blips.
      if (response.status >= 500) {
        this.logger.warn(`Gemini returned ${response.status} — retrying once`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        response = await send();
      }
    } catch (error) {
      this.logger.error(`Gemini request failed: ${String(error)}`);
      throw new ServiceUnavailableException(
        'The AI service could not be reached — try again shortly',
      );
    }

    if (response.status === 429) {
      throw new ServiceUnavailableException(
        'The AI service is rate-limited right now — wait a minute and try again',
      );
    }
    const body = (await response.json().catch(() => ({}))) as GeminiResponse;
    if (!response.ok) {
      this.logger.error(
        `Gemini ${this.model} returned ${response.status}: ${body.error?.message ?? 'unknown error'}`,
      );
      throw new ServiceUnavailableException(
        'The AI service returned an error — try again shortly',
      );
    }

    const text = body.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('');
    if (!text) {
      this.logger.error(
        `Gemini ${this.model} returned no text (finishReason=${body.candidates?.[0]?.finishReason ?? 'none'})`,
      );
      throw new ServiceUnavailableException(
        'The AI service returned an empty response — try again shortly',
      );
    }
    return text;
  }
}
