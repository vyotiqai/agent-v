import type { AiProvider } from '@agentv/shared/ai.ts';
import type { Egress } from '../egress/client.ts';
import { anthropicClient } from './anthropic.ts';
import { compatibleClient } from './compatible.ts';
import { googleClient } from './google.ts';
import { openaiClient } from './openai.ts';
import type { ProviderClient } from './types.ts';

/** The client for a provider; another provider's needs its address. All calls use `egress`. */
export function providerClients(egress: Egress) {
  return (provider: AiProvider, baseUrl: string | null): ProviderClient => {
    switch (provider) {
      case 'anthropic':
        return anthropicClient(egress);
      case 'openai':
        return openaiClient(egress);
      case 'google':
        return googleClient(egress);
      case 'compatible':
        if (!baseUrl) throw new Error('Another provider needs its address.');
        return compatibleClient(egress, baseUrl);
    }
  };
}
