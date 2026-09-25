/**
 * Settings come from the environment, and each process reads only what it needs. A missing or
 * malformed setting stops the process at start, with the setting's name, rather than failing
 * later on someone's request.
 */
export type Env = Record<string, string | undefined>;

export function required(env: Env, name: string): string {
  const value = env[name];
  if (value === undefined || value === '') throw new Error(`The setting ${name} is missing.`);
  return value;
}

export function optional(env: Env, name: string): string | undefined {
  const value = env[name];
  return value === undefined || value === '' ? undefined : value;
}

export function port(env: Env, name: string, fallback: number): number {
  const value = optional(env, name);
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535)
    throw new Error(`The setting ${name} is not a port.`);
  return n;
}
