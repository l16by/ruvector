/**
 * RuVector PostgreSQL CLI
 *
 * Supabase-style command-line interface for managing the RuVector PostgreSQL
 * vector similarity search extension.
 *
 * @example
 * ```bash
 * # Initialize a new project
 * npx @ruvector/postgres init
 *
 * # Start local development environment
 * npx @ruvector/postgres start
 *
 * # Install extension to PostgreSQL
 * npx @ruvector/postgres install --pg-version 16
 * ```
 */

export { initCommand } from './commands/init';
export { startCommand } from './commands/start';
export { stopCommand } from './commands/stop';
export { statusCommand } from './commands/status';
export { installCommand } from './commands/install';
export { dbCommand } from './commands/db';
export { configCommand } from './commands/config';
export { benchCommand } from './commands/bench';
export { migrateCommand } from './commands/migrate';
export { upgradeCommand } from './commands/upgrade';

export * from './utils/config';
export * from './utils/system';
export * from './utils/docker';
