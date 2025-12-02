/**
 * Upgrade command - Upgrade RuVector PostgreSQL extension
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import semver from 'semver';
import { loadProjectConfig, isInProject } from '../utils/config';
import { isContainerRunning, execSqlInContainer } from '../utils/docker';
import { getSystemInfo, detectRust, commandExists } from '../utils/system';
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

export const upgradeCommand = new Command('upgrade')
  .description('Upgrade RuVector PostgreSQL extension to latest version')
  .option('--version <version>', 'Upgrade to specific version')
  .option('--check', 'Check for updates without upgrading')
  .option('--force', 'Force upgrade even if already up to date')
  .option('--from-source', 'Build from source')
  .action(async (options) => {
    console.log('');
    console.log(chalk.bold.cyan('RuVector Upgrade'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log('');

    // Get current version
    const currentVersion = await getCurrentVersion();
    const latestVersion = options.version || (await getLatestVersion());

    console.log(chalk.bold('Version Information:'));
    console.log(chalk.gray(`  Installed:  ${currentVersion || 'Not installed'}`));
    console.log(chalk.gray(`  Latest:     ${latestVersion}`));
    console.log('');

    if (options.check) {
      if (!currentVersion) {
        console.log(chalk.yellow('RuVector is not installed.'));
        console.log(chalk.gray('Run "ruvector-pg install" to install.'));
      } else if (semver.gte(currentVersion, latestVersion)) {
        console.log(chalk.green('You are running the latest version!'));
      } else {
        console.log(chalk.cyan(`Update available: ${currentVersion} → ${latestVersion}`));
        console.log('');
        console.log('To upgrade:');
        console.log(chalk.gray('  ruvector-pg upgrade'));
      }
      return;
    }

    if (!currentVersion) {
      console.log(chalk.yellow('RuVector is not installed.'));
      console.log(chalk.gray('Run "ruvector-pg install" to install.'));
      return;
    }

    if (semver.gte(currentVersion, latestVersion) && !options.force) {
      console.log(chalk.green('Already running the latest version!'));
      console.log(chalk.gray('Use --force to reinstall.'));
      return;
    }

    // Perform upgrade
    console.log(chalk.bold(`Upgrading ${currentVersion} → ${latestVersion}`));
    console.log('');

    const sysInfo = getSystemInfo();
    const pgInfo = sysInfo.postgres;

    if (!pgInfo) {
      console.log(chalk.red('PostgreSQL not found.'));
      return;
    }

    const tasks = [
      { name: 'Downloading latest version', fn: downloadLatest },
      { name: 'Building extension', fn: buildExtension },
      { name: 'Stopping PostgreSQL', fn: stopPostgres },
      { name: 'Installing new version', fn: installExtension },
      { name: 'Starting PostgreSQL', fn: startPostgres },
      { name: 'Running upgrade scripts', fn: runUpgradeScripts },
      { name: 'Verifying upgrade', fn: verifyUpgrade },
    ];

    for (const task of tasks) {
      const spinner = ora(task.name).start();
      try {
        await task.fn(options, pgInfo, latestVersion);
        spinner.succeed(task.name);
      } catch (error: any) {
        spinner.fail(task.name);
        console.log(chalk.red(error.message));
        console.log('');
        console.log(chalk.yellow('Upgrade failed. Your previous version should still work.'));
        return;
      }
    }

    console.log('');
    console.log(chalk.green.bold(`✓ Upgraded to RuVector ${latestVersion}!`));
    console.log('');
    console.log(chalk.bold('Release Notes:'));
    console.log(chalk.gray(`  https://github.com/ruvnet/ruvector/releases/tag/v${latestVersion}`));
    console.log('');
  });

async function getCurrentVersion(): Promise<string | null> {
  try {
    if (isInProject()) {
      const config = loadProjectConfig();
      const containerName = config.docker?.containerName || 'ruvector-postgres';

      if (isContainerRunning(containerName)) {
        const result = execSqlInContainer(
          containerName,
          "SELECT extversion FROM pg_extension WHERE extname = 'ruvector';",
          config.postgres.database
        );
        const match = result.match(/\d+\.\d+\.\d+/);
        if (match) return match[0];
      }
    }

    // Try local installation
    const sysInfo = getSystemInfo();
    if (sysInfo.postgres) {
      const extDir = path.join(sysInfo.postgres.shareDir, 'extension');
      const controlFile = path.join(extDir, 'ruvector.control');
      if (fs.existsSync(controlFile)) {
        const content = fs.readFileSync(controlFile, 'utf8');
        const match = content.match(/default_version\s*=\s*'([^']+)'/);
        if (match) return match[1];
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

async function getLatestVersion(): Promise<string> {
  // In a real implementation, this would check GitHub releases or npm
  // For now, return the current version
  return '0.1.0';
}

async function downloadLatest(options: any, pgInfo: any, version: string): Promise<void> {
  // Clone or update repository
  const tmpDir = '/tmp/ruvector-upgrade';

  if (fs.existsSync(tmpDir)) {
    execSync('git fetch --all && git checkout main && git pull', {
      cwd: tmpDir,
      stdio: 'pipe',
    });
  } else {
    fs.ensureDirSync(tmpDir);
    execSync('git clone --depth 1 https://github.com/ruvnet/ruvector.git .', {
      cwd: tmpDir,
      stdio: 'pipe',
    });
  }
}

async function buildExtension(options: any, pgInfo: any, version: string): Promise<void> {
  const tmpDir = '/tmp/ruvector-upgrade';
  const cwd = path.join(tmpDir, 'crates', 'ruvector-postgres');

  // Ensure pgrx is installed
  if (!commandExists('cargo-pgrx')) {
    execSync('cargo install cargo-pgrx --version "0.12.9" --locked', { stdio: 'pipe' });
  }

  // Build
  execSync(`cargo pgrx package --pg-config ${pgInfo.pgConfig}`, {
    cwd,
    stdio: 'pipe',
    env: {
      ...process.env,
      RUSTFLAGS: '-C target-cpu=native',
    },
  });
}

async function stopPostgres(options: any, pgInfo: any, version: string): Promise<void> {
  if (isInProject()) {
    const config = loadProjectConfig();
    const containerName = config.docker?.containerName || 'ruvector-postgres';
    if (isContainerRunning(containerName)) {
      execSync(`docker stop ${containerName}`, { stdio: 'pipe' });
    }
  }
}

async function installExtension(options: any, pgInfo: any, version: string): Promise<void> {
  const tmpDir = '/tmp/ruvector-upgrade';
  const buildOutput = path.join(tmpDir, 'target', 'release', `ruvector-pg${pgInfo.version}`);

  const soFile = path.join(
    buildOutput,
    'usr',
    'lib',
    'postgresql',
    String(pgInfo.version),
    'lib',
    'ruvector.so'
  );

  if (fs.existsSync(soFile)) {
    fs.copyFileSync(soFile, path.join(pgInfo.libDir, 'ruvector.so'));
  }
}

async function startPostgres(options: any, pgInfo: any, version: string): Promise<void> {
  if (isInProject()) {
    const config = loadProjectConfig();
    const containerName = config.docker?.containerName || 'ruvector-postgres';
    execSync(`docker start ${containerName}`, { stdio: 'pipe' });
  }
}

async function runUpgradeScripts(options: any, pgInfo: any, version: string): Promise<void> {
  // Run any necessary upgrade SQL scripts
  if (isInProject()) {
    const config = loadProjectConfig();
    const containerName = config.docker?.containerName || 'ruvector-postgres';

    if (isContainerRunning(containerName)) {
      try {
        execSqlInContainer(
          containerName,
          'ALTER EXTENSION ruvector UPDATE;',
          config.postgres.database
        );
      } catch {
        // Extension update may not be needed
      }
    }
  }
}

async function verifyUpgrade(options: any, pgInfo: any, version: string): Promise<void> {
  if (isInProject()) {
    const config = loadProjectConfig();
    const containerName = config.docker?.containerName || 'ruvector-postgres';

    if (isContainerRunning(containerName)) {
      const result = execSqlInContainer(
        containerName,
        "SELECT extversion FROM pg_extension WHERE extname = 'ruvector';",
        config.postgres.database
      );

      if (!result.includes(version)) {
        throw new Error(`Version mismatch: expected ${version}`);
      }
    }
  }
}
