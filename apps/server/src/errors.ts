import type { ContentfulStatusCode } from "hono/utils/http-status";

export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  constructor(message: string, status: ContentfulStatusCode = 400) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

export const notFound = (what: string) => new AppError(`${what} not found`, 404);
