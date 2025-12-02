#!/usr/bin/env node

/**
 * RuVector PostgreSQL CLI
 *
 * Supabase-style command-line interface for managing the RuVector PostgreSQL
 * vector similarity search extension.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { version } from '../package.json';

// Import commands
import { initCommand } from './commands/init';
import { startCommand } from './commands/start';
import { stopCommand } from './commands/stop';
import { statusCommand } from './commands/status';
import { installCommand } from './commands/install';
import { dbCommand } from './commands/db';
import { configCommand } from './commands/config';
import { benchCommand } from './commands/bench';
import { migrateCommand } from './commands/migrate';
import { upgradeCommand } from './commands/upgrade';

const program = new Command();

// ASCII art banner
const banner = `
${chalk.cyan('╔═══════════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold.white('RuVector PostgreSQL')} - Vector Similarity Search Extension   ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.gray('High-performance SIMD-optimized vector operations')}           ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════════════════════════════╝')}
`;

program
  .name('ruvector-pg')
  .description(banner + '\n' + chalk.white('Supabase-style CLI for managing RuVector PostgreSQL extension'))
  .version(version, '-v, --version', 'Display version number')
  .option('--debug', 'Enable debug mode')
  .option('--workdir <path>', 'Change working directory')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.workdir) {
      process.chdir(opts.workdir);
    }
    if (opts.debug) {
      process.env.RUVECTOR_DEBUG = 'true';
    }
  });

// Register all commands
program.addCommand(initCommand);
program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(statusCommand);
program.addCommand(installCommand);
program.addCommand(dbCommand);
program.addCommand(configCommand);
program.addCommand(benchCommand);
program.addCommand(migrateCommand);
program.addCommand(upgradeCommand);

// Add help examples
program.addHelpText('after', `
${chalk.bold('Examples:')}
  ${chalk.gray('# Initialize a new project')}
  $ ruvector-pg init

  ${chalk.gray('# Start local development environment')}
  $ ruvector-pg start

  ${chalk.gray('# Install extension to existing PostgreSQL')}
  $ ruvector-pg install --pg-version 16

  ${chalk.gray('# Check status')}
  $ ruvector-pg status

  ${chalk.gray('# Run database migrations')}
  $ ruvector-pg db migrate

  ${chalk.gray('# Run benchmarks')}
  $ ruvector-pg bench --dimensions 1536 --vectors 10000

${chalk.bold('Documentation:')}
  ${chalk.blue('https://github.com/ruvnet/ruvector')}

${chalk.bold('Support:')}
  ${chalk.blue('https://github.com/ruvnet/ruvector/issues')}
`);

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (process.argv.length === 2) {
  program.outputHelp();
}
