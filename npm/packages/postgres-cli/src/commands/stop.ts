/**
 * Stop command - Stop RuVector PostgreSQL local development environment
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadProjectConfig, isInProject } from '../utils/config';
import {
  isContainerRunning,
  stopContainer,
  removeContainer,
  getContainerInfo,
} from '../utils/docker';
import { execSync } from 'child_process';

export const stopCommand = new Command('stop')
  .description('Stop RuVector PostgreSQL local development environment')
  .option('--remove', 'Remove container after stopping')
  .option('--remove-data', 'Remove container and data volumes (DESTRUCTIVE)')
  .option('--all', 'Stop all RuVector containers')
  .action(async (options) => {
    console.log('');
    console.log(chalk.bold.cyan('Stopping RuVector PostgreSQL'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log('');

    if (!isInProject() && !options.all) {
      console.log(chalk.yellow('Not in a RuVector project directory.'));
      console.log(chalk.gray('Use --all to stop all RuVector containers.'));
      return;
    }

    const config = loadProjectConfig();
    const containerName = config.docker?.containerName || 'ruvector-postgres';

    // Stop all RuVector containers
    if (options.all) {
      const spinner = ora('Finding RuVector containers...').start();
      try {
        const containers = execSync(
          'docker ps -a --filter "name=ruvector" --format "{{.Names}}"',
          { encoding: 'utf8' }
        )
          .trim()
          .split('\n')
          .filter(Boolean);

        if (containers.length === 0) {
          spinner.info('No RuVector containers found');
          return;
        }

        spinner.succeed(`Found ${containers.length} container(s)`);

        for (const name of containers) {
          const stopSpinner = ora(`Stopping ${name}...`).start();
          try {
            if (options.removeData) {
              removeContainer(name, true);
              stopSpinner.succeed(`Removed ${name} with data`);
            } else if (options.remove) {
              removeContainer(name, false);
              stopSpinner.succeed(`Removed ${name}`);
            } else {
              stopContainer(name);
              stopSpinner.succeed(`Stopped ${name}`);
            }
          } catch (e: any) {
            stopSpinner.fail(`Failed to stop ${name}: ${e.message}`);
          }
        }
      } catch (e: any) {
        spinner.fail('Failed to list containers');
      }
      return;
    }

    // Check if container is running
    const info = getContainerInfo(containerName);
    if (!info) {
      console.log(chalk.yellow('No RuVector container found.'));
      return;
    }

    if (!isContainerRunning(containerName)) {
      console.log(chalk.yellow(`Container ${containerName} is not running.`));
      console.log(chalk.gray(`Status: ${info.status}`));

      if (options.remove || options.removeData) {
        const spinner = ora('Removing container...').start();
        try {
          removeContainer(containerName, options.removeData);
          spinner.succeed(
            options.removeData
              ? 'Container and data removed'
              : 'Container removed'
          );
        } catch (e: any) {
          spinner.fail(`Failed to remove: ${e.message}`);
        }
      }
      return;
    }

    // Stop the container
    const spinner = ora('Stopping PostgreSQL...').start();

    try {
      // Use docker-compose if available
      try {
        execSync('docker-compose down', {
          stdio: 'pipe',
          cwd: process.cwd(),
        });
      } catch {
        // Fall back to docker stop
        stopContainer(containerName);
      }

      if (options.removeData) {
        spinner.text = 'Removing container and data...';
        removeContainer(containerName, true);
        // Remove volumes
        try {
          execSync(`docker volume rm ${config.docker?.dataVolume || 'ruvector_data'}`, {
            stdio: 'pipe',
          });
        } catch {
          // Volume may not exist
        }
        spinner.succeed('Container and data removed');
      } else if (options.remove) {
        spinner.text = 'Removing container...';
        removeContainer(containerName, false);
        spinner.succeed('Container removed');
      } else {
        spinner.succeed('PostgreSQL stopped');
      }

      console.log('');

      if (options.removeData) {
        console.log(chalk.yellow('⚠  All data has been removed.'));
        console.log(chalk.gray('   Run "ruvector-pg start" to create a fresh database.'));
      } else {
        console.log(chalk.gray('Data is preserved. Use "ruvector-pg start" to resume.'));
        console.log('');
        console.log('To remove all data:');
        console.log(chalk.gray('  ruvector-pg stop --remove-data'));
      }
      console.log('');
    } catch (error: any) {
      spinner.fail('Failed to stop PostgreSQL');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });
