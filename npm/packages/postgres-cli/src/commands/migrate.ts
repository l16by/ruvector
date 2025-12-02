/**
 * Migrate command - Migrate from pgvector to RuVector
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { loadProjectConfig, isInProject } from '../utils/config';
import { isContainerRunning, execSqlInContainer } from '../utils/docker';
import { execSync } from 'child_process';

export const migrateCommand = new Command('migrate')
  .description('Migrate from pgvector to RuVector')
  .option('--from <extension>', 'Source extension (pgvector)', 'pgvector')
  .option('--analyze', 'Analyze current setup before migration')
  .option('--dry-run', 'Show what would be done without making changes')
  .option('--force', 'Force migration without confirmation')
  .action(async (options) => {
    console.log('');
    console.log(chalk.bold.cyan('RuVector Migration Tool'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log('');

    console.log(chalk.bold(`Migrating from ${options.from} to RuVector`));
    console.log('');

    // Analysis mode
    if (options.analyze) {
      await analyzeMigration(options);
      return;
    }

    if (!options.force && !options.dryRun) {
      console.log(chalk.yellow('⚠️  Migration will modify your database schema.'));
      console.log('');
      console.log('Before proceeding:');
      console.log(chalk.gray('  1. Create a backup: ruvector-pg db dump -o backup.sql'));
      console.log(chalk.gray('  2. Review the changes with --analyze'));
      console.log(chalk.gray('  3. Test in a development environment first'));
      console.log('');

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Have you created a backup and are ready to proceed?',
          default: false,
        },
      ]);

      if (!confirm) {
        console.log(chalk.gray('Migration cancelled.'));
        return;
      }
    }

    // Get database connection
    let containerName: string | null = null;
    let database = 'postgres';

    if (isInProject()) {
      const config = loadProjectConfig();
      containerName = config.docker?.containerName || 'ruvector-postgres';
      database = config.postgres.database;

      if (!isContainerRunning(containerName)) {
        console.log(chalk.yellow('Database container is not running.'));
        console.log(chalk.gray('Start with: ruvector-pg start'));
        return;
      }
    } else {
      console.log(chalk.yellow('Not in a RuVector project directory.'));
      console.log(chalk.gray('Run from a project directory or specify connection details.'));
      return;
    }

    // Run migration steps
    console.log('');
    console.log(chalk.bold('Migration Steps:'));
    console.log('');

    const steps = [
      {
        name: 'Check pgvector installation',
        sql: "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';",
        check: true,
      },
      {
        name: 'Find vector columns',
        sql: `SELECT table_name, column_name, udt_name
              FROM information_schema.columns
              WHERE udt_name = 'vector'
              ORDER BY table_name, column_name;`,
        check: true,
      },
      {
        name: 'Find vector indexes',
        sql: `SELECT indexname, indexdef
              FROM pg_indexes
              WHERE indexdef LIKE '%vector%' OR indexdef LIKE '%hnsw%' OR indexdef LIKE '%ivfflat%';`,
        check: true,
      },
      {
        name: 'Install RuVector extension',
        sql: 'CREATE EXTENSION IF NOT EXISTS ruvector;',
        execute: true,
      },
    ];

    for (const step of steps) {
      const spinner = ora(step.name).start();

      if (options.dryRun) {
        spinner.info(`[DRY RUN] ${step.name}`);
        console.log(chalk.gray(`  SQL: ${step.sql.substring(0, 100)}...`));
        continue;
      }

      try {
        const result = execSqlInContainer(containerName!, step.sql, database);

        if (step.check) {
          spinner.succeed(step.name);
          console.log(chalk.gray(result.split('\n').slice(0, 10).join('\n')));
        } else if (step.execute) {
          spinner.succeed(step.name);
        }
      } catch (error: any) {
        spinner.fail(step.name);
        console.log(chalk.red(error.message));

        if (!options.force) {
          console.log('');
          console.log(chalk.yellow('Migration stopped. Use --force to continue on errors.'));
          return;
        }
      }
    }

    console.log('');
    console.log(chalk.green.bold('✓ Migration analysis complete!'));
    console.log('');
    console.log(chalk.bold('Next Steps:'));
    console.log('');
    console.log('  ' + chalk.cyan('1. Convert vector columns:'));
    console.log('     ' + chalk.gray('ALTER TABLE your_table'));
    console.log('     ' + chalk.gray('  ALTER COLUMN embedding TYPE ruvector'));
    console.log('     ' + chalk.gray('  USING embedding::text::ruvector;'));
    console.log('');
    console.log('  ' + chalk.cyan('2. Recreate indexes with RuVector:'));
    console.log('     ' + chalk.gray('DROP INDEX old_vector_idx;'));
    console.log('     ' + chalk.gray('CREATE INDEX ON table USING ruhnsw (embedding ruvector_l2_ops);'));
    console.log('');
    console.log('  ' + chalk.cyan('3. Update queries:'));
    console.log('     ' + chalk.gray("-- pgvector:  SELECT * FROM items ORDER BY embedding <-> '[1,2,3]'"));
    console.log('     ' + chalk.gray("-- RuVector:  SELECT * FROM items ORDER BY embedding <-> '[1,2,3]'::ruvector"));
    console.log('');
    console.log('  ' + chalk.cyan('4. (Optional) Remove pgvector:'));
    console.log('     ' + chalk.gray('DROP EXTENSION vector;'));
    console.log('');
    console.log(chalk.gray('See: https://github.com/ruvnet/ruvector/docs/MIGRATION.md'));
    console.log('');
  });

async function analyzeMigration(options: any) {
  console.log(chalk.bold('Analyzing current database setup...'));
  console.log('');

  if (!isInProject()) {
    console.log(chalk.yellow('Not in a RuVector project directory.'));
    return;
  }

  const config = loadProjectConfig();
  const containerName = config.docker?.containerName || 'ruvector-postgres';

  if (!isContainerRunning(containerName)) {
    console.log(chalk.yellow('Database container is not running.'));
    return;
  }

  // Check for pgvector
  console.log(chalk.bold('Extensions:'));
  try {
    const extResult = execSqlInContainer(
      containerName,
      "SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'ruvector');",
      config.postgres.database
    );
    console.log(chalk.gray(extResult));
  } catch {
    console.log(chalk.gray('  No vector extensions found.'));
  }

  // Find vector columns
  console.log(chalk.bold('Vector Columns:'));
  try {
    const colResult = execSqlInContainer(
      containerName,
      `SELECT table_name, column_name, udt_name,
              character_maximum_length as dimensions
       FROM information_schema.columns
       WHERE udt_name IN ('vector', 'ruvector', 'halfvec', 'sparsevec')
       ORDER BY table_name, column_name;`,
      config.postgres.database
    );
    console.log(chalk.gray(colResult));
  } catch {
    console.log(chalk.gray('  No vector columns found.'));
  }

  // Find indexes
  console.log(chalk.bold('Vector Indexes:'));
  try {
    const idxResult = execSqlInContainer(
      containerName,
      `SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) as size
       FROM pg_indexes
       WHERE indexdef LIKE '%vector%' OR indexdef LIKE '%hnsw%' OR indexdef LIKE '%ivfflat%'
          OR indexdef LIKE '%ruvector%' OR indexdef LIKE '%ruhnsw%' OR indexdef LIKE '%ruivfflat%';`,
      config.postgres.database
    );
    console.log(chalk.gray(idxResult));
  } catch {
    console.log(chalk.gray('  No vector indexes found.'));
  }

  // Estimate migration effort
  console.log('');
  console.log(chalk.bold('Migration Compatibility:'));
  console.log(chalk.gray('  • Operator syntax: Compatible (<->, <=>, <#>)'));
  console.log(chalk.gray('  • Index types: HNSW → ruhnsw, IVFFlat → ruivfflat'));
  console.log(chalk.gray('  • Data types: vector → ruvector, halfvec → halfvec'));
  console.log('');
  console.log(chalk.green('RuVector is API-compatible with pgvector.'));
  console.log(chalk.gray('Most queries will work without modification.'));
  console.log('');
}
