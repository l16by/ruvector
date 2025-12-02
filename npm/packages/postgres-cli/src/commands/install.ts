/**
 * Install command - Install RuVector PostgreSQL extension
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { Listr } from 'listr2';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { loadProjectConfig } from '../utils/config';
import {
  getSystemInfo,
  detectPostgres,
  detectRust,
  getRecommendedSimdMode,
  commandExists,
} from '../utils/system';

export const installCommand = new Command('install')
  .description('Install RuVector PostgreSQL extension to your PostgreSQL installation')
  .option('--pg-version <version>', 'PostgreSQL version (14, 15, 16, 17)')
  .option('--pg-config <path>', 'Path to pg_config binary')
  .option('--simd <mode>', 'SIMD mode: auto, avx512, avx2, neon, scalar', 'auto')
  .option('--from-source', 'Build from source (requires Rust)')
  .option('--skip-tests', 'Skip installation tests')
  .option('--dry-run', 'Show what would be done without making changes')
  .option('--verbose', 'Verbose output')
  .option('--force', 'Force reinstall even if already installed')
  .action(async (options) => {
    console.log('');
    console.log(chalk.bold.cyan('RuVector PostgreSQL Extension Installer'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log('');

    // Detect system
    const sysInfo = getSystemInfo();
    const pgInfo = options.pgConfig
      ? null // Will be detected from pg_config
      : detectPostgres();

    if (!pgInfo && !options.pgConfig) {
      console.log(chalk.red('PostgreSQL not found.'));
      console.log('');
      console.log('Please install PostgreSQL or specify the pg_config path:');
      console.log(chalk.gray('  ruvector-pg install --pg-config /path/to/pg_config'));
      console.log('');
      console.log('Or install PostgreSQL:');

      if (sysInfo.os === 'darwin') {
        console.log(chalk.gray('  brew install postgresql@16'));
      } else if (sysInfo.os === 'linux') {
        console.log(chalk.gray('  sudo apt install postgresql-16 postgresql-server-dev-16'));
      }
      process.exit(1);
    }

    const pgVersion = options.pgVersion || pgInfo?.version || 16;
    const pgConfig = options.pgConfig || pgInfo?.pgConfig || 'pg_config';
    const simdMode = options.simd || getRecommendedSimdMode();

    console.log(chalk.bold('Installation Configuration:'));
    console.log(chalk.gray(`  PostgreSQL Version: ${pgVersion}`));
    console.log(chalk.gray(`  pg_config:          ${pgConfig}`));
    console.log(chalk.gray(`  SIMD Mode:          ${simdMode}`));
    console.log(chalk.gray(`  Platform:           ${sysInfo.os} (${sysInfo.arch})`));
    console.log('');

    if (options.dryRun) {
      console.log(chalk.yellow('DRY RUN - No changes will be made'));
      console.log('');
    }

    // Check for Rust if building from source
    const rustInfo = detectRust();
    const buildFromSource = options.fromSource || !hasPrebuiltBinary(pgVersion, sysInfo);

    if (buildFromSource && !rustInfo) {
      console.log(chalk.yellow('Rust is required to build from source.'));
      console.log('');
      console.log('Install Rust:');
      console.log(chalk.gray('  curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh'));
      console.log('');

      const { installRust } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'installRust',
          message: 'Would you like to install Rust now?',
          default: true,
        },
      ]);

      if (installRust && !options.dryRun) {
        const rustSpinner = ora('Installing Rust...').start();
        try {
          execSync('curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y', {
            stdio: 'inherit',
          });
          // Source cargo env
          process.env.PATH = `${process.env.HOME}/.cargo/bin:${process.env.PATH}`;
          rustSpinner.succeed('Rust installed');
        } catch (e: any) {
          rustSpinner.fail('Failed to install Rust');
          console.log(chalk.gray(e.message));
          process.exit(1);
        }
      } else if (!installRust) {
        process.exit(1);
      }
    }

    // Run installation tasks
    const tasks = new Listr([
      {
        title: 'Checking prerequisites',
        task: async (ctx) => {
          ctx.pgConfig = pgConfig;
          ctx.pgVersion = pgVersion;
          ctx.simdMode = simdMode;

          // Verify pg_config works
          try {
            execSync(`${pgConfig} --version`, { stdio: 'pipe' });
          } catch {
            throw new Error(`pg_config not found: ${pgConfig}`);
          }
        },
      },
      {
        title: 'Installing cargo-pgrx',
        enabled: () => buildFromSource,
        task: async (ctx, task) => {
          if (options.dryRun) {
            task.skip('Dry run');
            return;
          }

          const pgrxInstalled = commandExists('cargo-pgrx');
          if (!pgrxInstalled) {
            execSync('cargo install cargo-pgrx --version "0.12.9" --locked', {
              stdio: options.verbose ? 'inherit' : 'pipe',
            });
          } else {
            task.skip('Already installed');
          }
        },
      },
      {
        title: 'Initializing pgrx',
        enabled: () => buildFromSource,
        task: async (ctx, task) => {
          if (options.dryRun) {
            task.skip('Dry run');
            return;
          }

          const pgrxConfigPath = path.join(
            process.env.HOME || '',
            '.pgrx',
            'config.toml'
          );

          if (!fs.existsSync(pgrxConfigPath)) {
            execSync(`cargo pgrx init --pg${pgVersion} ${pgConfig}`, {
              stdio: options.verbose ? 'inherit' : 'pipe',
            });
          } else {
            task.skip('Already initialized');
          }
        },
      },
      {
        title: 'Cloning RuVector repository',
        enabled: () => buildFromSource && !fs.existsSync('crates/ruvector-postgres'),
        task: async (ctx, task) => {
          if (options.dryRun) {
            task.skip('Dry run');
            return;
          }

          const tmpDir = path.join('/tmp', 'ruvector-build');
          fs.ensureDirSync(tmpDir);

          execSync('git clone --depth 1 https://github.com/ruvnet/ruvector.git .', {
            cwd: tmpDir,
            stdio: options.verbose ? 'inherit' : 'pipe',
          });

          ctx.buildDir = tmpDir;
        },
      },
      {
        title: 'Building RuVector extension',
        enabled: () => buildFromSource,
        task: async (ctx, task) => {
          if (options.dryRun) {
            task.skip('Dry run');
            return;
          }

          task.title = 'Building RuVector extension (this may take several minutes)...';

          const buildDir = ctx.buildDir || process.cwd();
          const cwd = path.join(buildDir, 'crates', 'ruvector-postgres');

          // Set SIMD features
          let features = `pg${pgVersion}`;
          if (simdMode === 'avx512') features += ',simd-avx512';
          else if (simdMode === 'avx2') features += ',simd-avx2';
          else if (simdMode === 'neon') features += ',simd-neon';

          execSync(`cargo pgrx package --pg-config ${pgConfig} --features ${features}`, {
            cwd,
            stdio: options.verbose ? 'inherit' : 'pipe',
            env: {
              ...process.env,
              RUSTFLAGS: simdMode === 'auto' ? '-C target-cpu=native' : '',
            },
          });

          ctx.buildOutput = path.join(buildDir, 'target', 'release', `ruvector-pg${pgVersion}`);
        },
      },
      {
        title: 'Installing extension files',
        task: async (ctx, task) => {
          if (options.dryRun) {
            task.skip('Dry run');
            return;
          }

          // Get PostgreSQL paths
          const libDir = execSync(`${pgConfig} --pkglibdir`, { encoding: 'utf8' }).trim();
          const shareDir = execSync(`${pgConfig} --sharedir`, { encoding: 'utf8' }).trim();
          const extDir = path.join(shareDir, 'extension');

          if (buildFromSource && ctx.buildOutput) {
            // Copy from build output
            const soFile = path.join(
              ctx.buildOutput,
              'usr',
              'lib',
              'postgresql',
              String(pgVersion),
              'lib',
              'ruvector.so'
            );
            const controlFile = path.join(
              ctx.buildOutput,
              'usr',
              'share',
              'postgresql',
              String(pgVersion),
              'extension',
              'ruvector.control'
            );

            if (fs.existsSync(soFile)) {
              fs.copyFileSync(soFile, path.join(libDir, 'ruvector.so'));
              fs.chmodSync(path.join(libDir, 'ruvector.so'), 0o755);
            }

            if (fs.existsSync(controlFile)) {
              fs.copyFileSync(controlFile, path.join(extDir, 'ruvector.control'));
            }

            // Copy SQL files
            const sqlDir = path.dirname(controlFile);
            const sqlFiles = fs.readdirSync(sqlDir).filter((f: string) => f.endsWith('.sql'));
            for (const sqlFile of sqlFiles) {
              fs.copyFileSync(path.join(sqlDir, sqlFile), path.join(extDir, sqlFile));
            }
          }
        },
      },
      {
        title: 'Verifying installation',
        enabled: () => !options.skipTests,
        task: async (ctx, task) => {
          if (options.dryRun) {
            task.skip('Dry run');
            return;
          }

          // Check if extension files exist
          const libDir = execSync(`${pgConfig} --pkglibdir`, { encoding: 'utf8' }).trim();
          const soPath = path.join(libDir, 'ruvector.so');

          if (!fs.existsSync(soPath)) {
            throw new Error('Extension shared library not found');
          }

          task.title = 'Installation verified';
        },
      },
    ]);

    try {
      await tasks.run();

      console.log('');
      console.log(chalk.green.bold('✓ RuVector PostgreSQL extension installed!'));
      console.log('');
      console.log(chalk.bold('Next Steps:'));
      console.log('');
      console.log('  ' + chalk.cyan('1. Connect to your database:'));
      console.log('     ' + chalk.gray('psql -d your_database'));
      console.log('');
      console.log('  ' + chalk.cyan('2. Create the extension:'));
      console.log('     ' + chalk.gray('CREATE EXTENSION ruvector;'));
      console.log('');
      console.log('  ' + chalk.cyan('3. Create a table with vectors:'));
      console.log('     ' + chalk.gray('CREATE TABLE items (id serial, embedding ruvector(1536));'));
      console.log('');
      console.log('  ' + chalk.cyan('4. Insert and query vectors:'));
      console.log('     ' + chalk.gray("INSERT INTO items (embedding) VALUES ('[1,2,3,...]');"));
      console.log('     ' + chalk.gray("SELECT * FROM items ORDER BY embedding <-> '[1,1,1,...]' LIMIT 10;"));
      console.log('');
      console.log(chalk.gray('Documentation: https://github.com/ruvnet/ruvector'));
      console.log('');
    } catch (error: any) {
      console.log('');
      console.log(chalk.red('Installation failed'));
      console.log(chalk.gray(error.message));
      console.log('');
      console.log('Try running with --verbose for more details:');
      console.log(chalk.gray('  ruvector-pg install --verbose'));
      process.exit(1);
    }
  });

/**
 * Check if we have a pre-built binary for this platform
 */
function hasPrebuiltBinary(pgVersion: number, sysInfo: any): boolean {
  // For now, we always build from source
  // In the future, we could check for pre-built binaries on GitHub releases
  return false;
}
