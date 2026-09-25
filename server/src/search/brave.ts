import { obj, parseJson, readText, retryAfter, send, str } from '../ai/http.ts';
import { ProviderError, type ProviderErrorKind } from '../ai/types.ts';
import type { Egress } from '../egress/client.ts';

/**
 * Brave's Web Search API, with the person's own key (stage 6, section 16; D105): our own small
 * client. Slice 2 uses it to check a key with a real search; research uses it from slice 3.
 */

const SEARCH = 'https://api.search.brave.com/res/v1/web/search';

export interface SearchResult {
  title: string;
  url: string;
  description: string;
}

export async function braveSearch(
  egress: Egress,
  key: string,
  query: string,
  options: { count?: number; signal?: AbortSignal } = {},
): Promise<SearchResult[]> {
  const url = new URL(SEARCH);
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(options.count ?? 10));
  const res = await send(egress, url.href, {
    headers: { accept: 'application/json', 'x-subscription-token': key },
    signal: options.signal,
  });
  const text = await readText(res);
  const body = parseJson(text);
  if (res.status !== 200) {
    const error = obj(body, 'error');
    const message = str(error, 'detail') ?? str(error, 'message');
    throw new ProviderError(kindOf(res.status, str(error, 'code')), {
      status: res.status,
      retryAfterMs: retryAfter(res.headers),
      message,
    });
  }
  const results = (obj(body, 'web') as { results?: unknown } | undefined)?.results;
  return (Array.isArray(results) ? results : []).flatMap((r) => {
    const title = str(r, 'title');
    const link = str(r, 'url');
    return title && link ? [{ title, url: link, description: str(r, 'description') ?? '' }] : [];
  });
}

/** Brave names its errors with a code; its statuses say the rest. */
function kindOf(status: number, code: string | undefined): ProviderErrorKind {
  if (code?.includes('TOKEN_INVALID') || status === 401 || status === 403) return 'declined';
  if (code?.includes('QUOTA') || status === 402) return 'no-credit';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'provider-down';
  return 'bad-request';
}
