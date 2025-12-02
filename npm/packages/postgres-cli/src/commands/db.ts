/**
 * DB command - Database management commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { loadProjectConfig, isInProject, findProjectRoot } from '../utils/config';
import { isContainerRunning, execSqlInContainer, getContainerLogs } from '../utils/docker';
import { execSync } from 'child_process';

export const dbCommand = new Command('db')
  .description('Database management commands');

// db migrate - Run migrations
dbCommand
  .command('migrate')
  .description('Run database migrations')
  .option('--up', 'Run pending migrations (default)')
  .option('--down', 'Rollback last migration')
  .option('--to <version>', 'Migrate to specific version')
  .option('--dry-run', 'Show what would be done')
  .action(async (options) => {
    console.log('');
    console.log(chalk.bold.cyan('Running Database Migrations'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log('');

    if (!isInProject()) {
      console.log(chalk.yellow('Not in a RuVector project directory.'));
      return;
    }

    const config = loadProjectConfig();
    const projectRoot = findProjectRoot() || process.cwd();
    const migrationsDir = path.join(projectRoot, 'migrations');

    if (!fs.existsSync(migrationsDir)) {
      console.log(chalk.yellow('No migrations directory found.'));
      console.log(chalk.gray('Create migrations in the "migrations" directory.'));
      return;
    }

    // Get migration files
    const migrations = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (migrations.length === 0) {
      console.log(chalk.yellow('No migrations found.'));
      console.log(chalk.gray('Create .sql files in the "migrations" directory.'));
      return;
    }

    console.log(`Found ${migrations.length} migration(s)`);
    console.log('');

    const containerName = config.docker?.containerName || 'ruvector-postgres';

    if (config.docker?.enabled && isContainerRunning(containerName)) {
      // Run in Docker
      for (const migration of migrations) {
        const spinner = ora(`Running ${migration}...`).start();

        if (options.dryRun) {
          spinner.info(`Would run: ${migration}`);
          continue;
        }

        try {
          const sql = fs.readFileSync(path.join(migrationsDir, migration), 'utf8');
          execSqlInContainer(containerName, sql, config.postgres.database);
          spinner.succeed(`Applied: ${migration}`);
        } catch (error: any) {
          spinner.fail(`Failed: ${migration}`);
          console.log(chalk.red(error.message));
          process.exit(1);
        }
      }
    } else {
      // Run with psql directly
      const pgUri = `postgresql://${config.postgres.user}@${config.postgres.host}:${config.postgres.port}/${config.postgres.database}`;

      for (const migration of migrations) {
        const spinner = ora(`Running ${migration}...`).start();

        if (options.dryRun) {
          spinner.info(`Would run: ${migration}`);
          continue;
        }

        try {
          execSync(`psql "${pgUri}" -f "${path.join(migrationsDir, migration)}"`, {
            stdio: 'pipe',
          });
          spinner.succeed(`Applied: ${migration}`);
        } catch (error: any) {
          spinner.fail(`Failed: ${migration}`);
          console.log(chalk.red(error.message));
          process.exit(1);
        }
      }
    }

    console.log('');
    console.log(chalk.green('Migrations complete!'));
    console.log('');
  });

// db dump - Dump database
dbCommand
  .command('dump')
  .description('Dump database to file')
  .option('-o, --output <file>', 'Output file', 'dump.sql')
  .option('--data-only', 'Only dump data, not schema')
  .option('--schema-only', 'Only dump schema, not data')
  .option('--table <table>', 'Only dump specific table')
  .action(async (options) => {
    console.log('');
    console.log(chalk.bold.cyan('Dumping Database'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log('');

    if (!isInProject()) {
      console.log(chalk.yellow('Not in a RuVector project directory.'));
      return;
    }

    const config = loadProjectConfig();
    const containerName = config.docker?.containerName || 'ruvector-postgres';
    const spinner = ora('Dumping database...').start();

    try {
      let cmd = `pg_dump -U ${config.postgres.user} -d ${config.postgres.database}`;

      if (options.dataOnly) cmd += ' --data-only';
      if (options.schemaOnly) cmd += ' --schema-only';
      if (options.table) cmd += ` --table=${options.table}`;

      let output: string;

      if (config.docker?.enabled && isContainerRunning(containerName)) {
        output = execSync(`docker exec ${containerName} ${cmd}`, {
          encoding: 'utf8',
        });
      } else {
        cmd += ` -h ${config.postgres.host} -p ${config.postgres.port}`;
        output = execSync(cmd, { encoding: 'utf8' });
      }

      fs.writeFileSync(options.output, output);
      spinner.succeed(`Database dumped to ${options.output}`);

      const stats = fs.statSync(options.output);
      console.log(chalk.gray(`  Size: ${(stats.size / 1024).toFixed(2)} KB`));
    } catch (error: any) {
      spinner.fail('Failed to dump database');
      console.log(chalk.red(error.message));
      process.exit(1);
    }
  });

// db push - Push schema changes
dbCommand
  .command('push')
  .description('Push local schema changes to database')
  .option('--file <file>', 'SQL file to push')
  .action(async (options) => {
    console.log('');
    console.log(chalk.bold.cyan('Pushing Schema Changes'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log('');

    if (!isInProject()) {
      console.log(chalk.yellow('Not in a RuVector project directory.'));
      return;
    }

    if (!options.file) {
      console.log(chalk.yellow('Please specify a SQL file with --file'));
      return;
    }

    if (!fs.existsSync(options.file)) {
      console.log(chalk.red(`File not found: ${options.file}`));
      return;
    }

    const config = loadProjectConfig();
    const containerName = config.docker?.containerName || 'ruvector-postgres';
    const spinner = ora('Pushing schema...').start();

    try {
      const sql = fs.readFileSync(options.file, 'utf8');

      if (config.docker?.enabled && isContainerRunning(containerName)) {
        execSqlInContainer(containerName, sql, config.postgres.database);
      } else {
        const pgUri = `postgresql://${config.postgres.user}@${config.postgres.host}:${config.postgres.port}/${config.postgres.database}`;
        execSync(`psql "${pgUri}" -f "${options.file}"`, { stdio: 'pipe' });
      }

      spinner.succeed('Schema pushed successfully');
    } catch (error: any) {
      spinner.fail('Failed to push schema');
      console.log(chalk.red(error.message));
      process.exit(1);
    }
  });

// db reset - Reset database
dbCommand
  .command('reset')
  .description('Reset database (DROP and recreate)')
  .option('--force', 'Skip confirmation')
  .action(async (options) => {
    console.log('');
    console.log(chalk.bold.red('Database Reset'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log('');

    if (!isInProject()) {
      console.log(chalk.yellow('Not in a RuVector project directory.'));
      return;
    }

    if (!options.force) {
      console.log(chalk.red('⚠️  This will DELETE ALL DATA in the database!'));
      console.log('');
      console.log('Add --force to confirm:');
      console.log(chalk.gray('  ruvector-pg db reset --force'));
      return;
    }

    const config = loadProjectConfig();
    const containerName = config.docker?.containerName || 'ruvector-postgres';
    const spinner = ora('Resetting database...').start();

    try {
      const dropSql = `DROP DATABASE IF EXISTS ${config.postgres.database};`;
      const createSql = `CREATE DATABASE ${config.postgres.database};`;
      const extSql = 'CREATE EXTENSION IF NOT EXISTS ruvector;';

      if (config.docker?.enabled && isContainerRunning(containerName)) {
        execSqlInContainer(containerName, dropSql, 'postgres');
        execSqlInContainer(containerName, createSql, 'postgres');
        try {
          execSqlInContainer(containerName, extSql, config.postgres.database);
        } catch {
          // Extension may not be installed yet
        }
      } else {
        const pgUri = `postgresql://${config.postgres.user}@${config.postgres.host}:${config.postgres.port}`;
        execSync(`psql "${pgUri}/postgres" -c "${dropSql}"`, { stdio: 'pipe' });
        execSync(`psql "${pgUri}/postgres" -c "${createSql}"`, { stdio: 'pipe' });
        try {
          execSync(`psql "${pgUri}/${config.postgres.database}" -c "${extSql}"`, { stdio: 'pipe' });
        } catch {
          // Extension may not be installed yet
        }
      }

      spinner.succeed('Database reset complete');
      console.log('');
      console.log(chalk.gray('Run migrations to recreate schema:'));
      console.log(chalk.gray('  ruvector-pg db migrate'));
    } catch (error: any) {
      spinner.fail('Failed to reset database');
      console.log(chalk.red(error.message));
      process.exit(1);
    }
  });

// db stats - Show database statistics
dbCommand
  .command('stats')
  .description('Show database and vector statistics')
  .action(async () => {
    console.log('');
    console.log(chalk.bold.cyan('Database Statistics'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log('');

    if (!isInProject()) {
      console.log(chalk.yellow('Not in a RuVector project directory.'));
      return;
    }

    const config = loadProjectConfig();
    const containerName = config.docker?.containerName || 'ruvector-postgres';

    if (!config.docker?.enabled || !isContainerRunning(containerName)) {
      console.log(chalk.yellow('Database container is not running.'));
      console.log(chalk.gray('Start with: ruvector-pg start'));
      return;
    }

    try {
      // Database size
      const sizeResult = execSqlInContainer(
        containerName,
        `SELECT pg_size_pretty(pg_database_size('${config.postgres.database}')) as size;`,
        config.postgres.database
      );
      console.log(chalk.bold('Database Size:'));
      console.log(chalk.gray(`  ${sizeResult.split('\n')[2]?.trim() || 'Unknown'}`));
      console.log('');

      // Vector tables
      const tablesResult = execSqlInContainer(
        containerName,
        `SELECT table_name,
                pg_size_pretty(pg_total_relation_size(table_name::regclass)) as size
         FROM information_schema.columns
         WHERE udt_name = 'ruvector'
         GROUP BY table_name;`,
        config.postgres.database
      );
      console.log(chalk.bold('Vector Tables:'));
      console.log(chalk.gray(tablesResult));
      console.log('');

      // Index statistics
      const indexResult = execSqlInContainer(
        containerName,
        `SELECT indexname,
                pg_size_pretty(pg_relation_size(indexname::regclass)) as size,
                indexdef
         FROM pg_indexes
         WHERE indexdef LIKE '%ruvector%' OR indexdef LIKE '%ruhnsw%' OR indexdef LIKE '%ruivfflat%';`,
        config.postgres.database
      );
      console.log(chalk.bold('Vector Indexes:'));
      console.log(chalk.gray(indexResult));
    } catch (error: any) {
      console.log(chalk.red('Failed to get statistics'));
      console.log(chalk.gray(error.message));
    }
  });

// db shell - Open database shell
dbCommand
  .command('shell')
  .alias('psql')
  .description('Open PostgreSQL shell (psql)')
  .action(async () => {
    if (!isInProject()) {
      console.log(chalk.yellow('Not in a RuVector project directory.'));
      return;
    }

    const config = loadProjectConfig();
    const containerName = config.docker?.containerName || 'ruvector-postgres';

    if (config.docker?.enabled && isContainerRunning(containerName)) {
      execSync(
        `docker exec -it ${containerName} psql -U ${config.postgres.user} -d ${config.postgres.database}`,
        { stdio: 'inherit' }
      );
    } else {
      const pgUri = `postgresql://${config.postgres.user}@${config.postgres.host}:${config.postgres.port}/${config.postgres.database}`;
      execSync(`psql "${pgUri}"`, { stdio: 'inherit' });
    }
  });
