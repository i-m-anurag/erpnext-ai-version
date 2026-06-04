/**
 * A seeder is an idempotent unit of shipped base data. Seeders are safe to re-run
 * on every deploy/upgrade: re-seeding a new base version must not disturb client
 * overrides (§7). Services used by seeders handle their own transactions.
 */
export interface Seeder {
  readonly name: string;
  run(): Promise<void>;
}
