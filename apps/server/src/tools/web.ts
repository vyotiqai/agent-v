import type { Context } from "../context.ts";
import { AppError } from "../errors.ts";
import { htmlToText, safeFetch } from "../net/safe-fetch.ts";

export interface WebPage {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
}

/** Read a public page as text for the model. Errors are returned, not thrown, so the agent can react. */
export async function readWebPage(
  ctx: Context,
  url: string,
  maxChars = 20_000,
): Promise<WebPage | { error: string }> {
  try {
    const response = await safeFetch(url, { allowPrivate: ctx.config.allowPrivateNetworkFetch });
    if (response.status >= 400) return { error: `The page answered HTTP ${response.status}` };
    const isHtml = /html|xml/i.test(response.contentType) || /^\s*</.test(response.body);
    if (!isHtml && !/^text\/|json/i.test(response.contentType))
      return { error: `Unsupported content type ${response.contentType || "unknown"}` };
    const { title, text } = isHtml ? htmlToText(response.body) : { title: "", text: response.body };
    return {
      url: response.url,
      title,
      text: text.slice(0, maxChars),
      truncated: response.truncated || text.length > maxChars,
    };
  } catch (error) {
    return { error: error instanceof AppError ? error.message : "Could not read the page" };
  }
}
