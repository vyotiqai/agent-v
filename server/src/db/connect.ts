import postgres from 'postgres';

export type Sql = postgres.Sql;

/**
 * Opens a pool of connections to Postgres. Notices from the server are not printed: they can name
 * tables and values, and all output goes through the content-free logger.
 */
export function connect(url: string, options: { max?: number } = {}): Sql {
  return postgres(url, {
    max: options.max ?? 10,
    idle_timeout: 30,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    onnotice: () => {},
  });
}
