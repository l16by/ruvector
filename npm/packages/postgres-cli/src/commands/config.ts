/**
 * Config command - Configuration management
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import yaml from 'yaml';
import {
  loadProjectConfig,
  saveProjectConfig,
  isInProject,
  getProjectConfigPath,
  defaultConfig,
  RuvectorConfig,
} from '../utils/config';
import { getSystemInfo, getRecommendedSimdMode } from '../utils/system';

export const configCommand = new Command('config')
  .description('Configuration management');

// config show - Show current configuration
configCommand
  .command('show')
  .description('Show current configuration')
  .option('--json', 'Output as JSON')
  .action((options) => {
    console.log('');

    if (!isInProject()) {
      console.log(chalk.yellow('Not in a RuVector project directory.'));
      console.log(chalk.gray('Run "ruvector-pg init" to create a project.'));
      return;
    }

    const config = loadProjectConfig();

    if (options.json) {
      console.log(JSON.stringify(config, null, 2));
    } else {
      console.log(chalk.bold.cyan('RuVector PostgreSQL Configuration'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log('');
      console.log(chalk.bold('Project'));
      console.log(chalk.gray(`  Name:        ${config.projectName || 'Unnamed'}`));
      console.log('');
      console.log(chalk.bold('PostgreSQL'));
      console.log(chalk.gray(`  Version:     ${config.postgres.version}`));
      console.log(chalk.gray(`  Host:        ${config.postgres.host}`));
      console.log(chalk.gray(`  Port:        ${config.postgres.port}`));
      console.log(chalk.gray(`  Database:    ${config.postgres.database}`));
      console.log(chalk.gray(`  User:        ${config.postgres.user}`));
      console.log('');
      console.log(chalk.bold('Extension'));
      console.log(chalk.gray(`  Version:     ${config.extension.version}`));
      console.log(chalk.gray(`  SIMD Mode:   ${config.extension.simdMode}`));
      console.log(chalk.gray(`  HNSW M:      ${config.extension.hnswM}`));
      console.log(chalk.gray(`  HNSW EF:     ${config.extension.hnswEfConstruction}`));
      console.log(chalk.gray(`  IVF Lists:   ${config.extension.ivfflatLists}`));
      console.log('');
      console.log(chalk.bold('Docker'));
      console.log(chalk.gray(`  Enabled:     ${config.docker.enabled}`));
      console.log(chalk.gray(`  Container:   ${config.docker.containerName}`));
      console.log(chalk.gray(`  Image:       ${config.docker.image}`));
      console.log(chalk.gray(`  Volume:      ${config.docker.dataVolume}`));
      console.log('');
      console.log(chalk.gray(`Config file: ${getProjectConfigPath()}`));
      console.log('');
    }
  });

// config set - Set configuration value
configCommand
  .command('set <key> <value>')
  .description('Set a configuration value')
  .action((key, value) => {
    if (!isInProject()) {
      console.log(chalk.yellow('Not in a RuVector project directory.'));
      return;
    }

    const config = loadProjectConfig();
    const parts = key.split('.');

    // Navigate to the correct location in config
    let current: any = config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }

    // Set the value (with type conversion)
    const lastKey = parts[parts.length - 1];
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (!isNaN(Number(value))) value = Number(value);

    current[lastKey] = value;

    saveProjectConfig(config);
    console.log(chalk.green(`Set ${key} = ${value}`));
  });

// config get - Get configuration value
configCommand
  .command('get <key>')
  .description('Get a configuration value')
  .action((key) => {
    if (!isInProject()) {
      console.log(chalk.yellow('Not in a RuVector project directory.'));
      return;
    }

    const config = loadProjectConfig();
    const parts = key.split('.');

    let current: any = config;
    for (const part of parts) {
      if (!(part in current)) {
        console.log(chalk.yellow(`Key not found: ${key}`));
        return;
      }
      current = current[part];
    }

    if (typeof current === 'object') {
      console.log(JSON.stringify(current, null, 2));
    } else {
      console.log(current);
    }
  });

// config edit - Open config in editor
configCommand
  .command('edit')
  .description('Open configuration file in editor')
  .action(() => {
    if (!isInProject()) {
      console.log(chalk.yellow('Not in a RuVector project directory.'));
      return;
    }

    const configPath = getProjectConfigPath();
    const editor = process.env.EDITOR || process.env.VISUAL || 'vi';

    const { execSync } = require('child_process');
    try {
      execSync(`${editor} "${configPath}"`, { stdio: 'inherit' });
    } catch (e: any) {
      console.log(chalk.red(`Failed to open editor: ${e.message}`));
      console.log(chalk.gray(`Config file: ${configPath}`));
    }
  });

// config reset - Reset configuration to defaults
configCommand
  .command('reset')
  .description('Reset configuration to defaults')
  .option('--force', 'Skip confirmation')
  .action(async (options) => {
    if (!isInProject()) {
      console.log(chalk.yellow('Not in a RuVector project directory.'));
      return;
    }

    if (!options.force) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Reset all configuration to defaults?',
          default: false,
        },
      ]);

      if (!confirm) {
        console.log(chalk.gray('Cancelled.'));
        return;
      }
    }

    saveProjectConfig(defaultConfig);
    console.log(chalk.green('Configuration reset to defaults.'));
  });

// config optimize - Auto-optimize configuration
configCommand
  .command('optimize')
  .description('Auto-optimize configuration based on system capabilities')
  .action(async () => {
    console.log('');
    console.log(chalk.bold.cyan('Optimizing Configuration'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log('');

    if (!isInProject()) {
      console.log(chalk.yellow('Not in a RuVector project directory.'));
      return;
    }

    const config = loadProjectConfig();
    const sysInfo = getSystemInfo();
    const changes: string[] = [];

    // Optimize SIMD mode
    const recommendedSimd = getRecommendedSimdMode();
    if (config.extension.simdMode !== recommendedSimd && config.extension.simdMode !== 'auto') {
      config.extension.simdMode = recommendedSimd;
      changes.push(`SIMD mode: ${recommendedSimd}`);
    }

    // Optimize HNSW parameters based on available memory
    // For now, use sensible defaults
    if (config.extension.hnswEfConstruction < 64) {
      config.extension.hnswEfConstruction = 64;
      changes.push('HNSW ef_construction: 64');
    }

    if (config.extension.hnswM < 16) {
      config.extension.hnswM = 16;
      changes.push('HNSW M: 16');
    }

    if (changes.length > 0) {
      saveProjectConfig(config);
      console.log(chalk.green('Applied optimizations:'));
      for (const change of changes) {
        console.log(chalk.gray(`  • ${change}`));
      }
    } else {
      console.log(chalk.green('Configuration is already optimized.'));
    }

    console.log('');
    console.log(chalk.bold('System Capabilities:'));
    console.log(chalk.gray(`  SIMD: ${recommendedSimd}`));
    console.log(chalk.gray(`  PostgreSQL: ${sysInfo.postgres?.version || 'Not installed'}`));
    console.log(chalk.gray(`  Docker: ${sysInfo.docker ? 'Available' : 'Not available'}`));
    console.log('');
  });
