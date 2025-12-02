/**
 * Status command - Show RuVector PostgreSQL status and system information
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { table } from 'table';
import { loadProjectConfig, isInProject, findProjectRoot } from '../utils/config';
import {
  getSystemInfo,
  formatSystemInfo,
  detectPostgres,
  getRecommendedSimdMode,
} from '../utils/system';
import {
  isDockerAvailable,
  isContainerRunning,
  getContainerInfo,
  getContainerLogs,
  execSqlInContainer,
} from '../utils/docker';

export const statusCommand = new Command('status')
  .description('Show RuVector PostgreSQL status and system information')
  .option('--json', 'Output as JSON')
  .option('--logs', 'Show recent container logs')
  .option('--system', 'Show detailed system information')
  .action(async (options) => {
    const projectRoot = findProjectRoot();
    const inProject = isInProject();
    const config = inProject ? loadProjectConfig() : null;

    // Gather status information
    const status: any = {
      project: null,
      container: null,
      extension: null,
      system: getSystemInfo(),
    };

    // Project information
    if (inProject && config) {
      status.project = {
        root: projectRoot,
        name: config.projectName || 'Unnamed',
        pgVersion: config.postgres.version,
        simdMode: config.extension.simdMode,
        dockerEnabled: config.docker.enabled,
      };

      // Container status
      if (config.docker.enabled) {
        const containerName = config.docker.containerName || 'ruvector-postgres';
        const containerInfo = getContainerInfo(containerName);

        if (containerInfo) {
          status.container = {
            name: containerInfo.name,
            status: containerInfo.status,
            running: isContainerRunning(containerName),
            ports: containerInfo.ports,
            created: containerInfo.created,
          };

          // Extension status (if container is running)
          if (isContainerRunning(containerName)) {
            try {
              const extResult = execSqlInContainer(
                containerName,
                "SELECT extname, extversion FROM pg_extension WHERE extname = 'ruvector';",
                config.postgres.database
              );
              if (extResult.includes('ruvector')) {
                const versionMatch = extResult.match(/\d+\.\d+\.\d+/);
                status.extension = {
                  installed: true,
                  version: versionMatch ? versionMatch[0] : 'unknown',
                };
              } else {
                status.extension = { installed: false };
              }
            } catch {
              status.extension = { installed: false, error: 'Could not query extension' };
            }
          }
        }
      }
    }

    // JSON output
    if (options.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }

    // Pretty output
    console.log('');
    console.log(chalk.bold.cyan('RuVector PostgreSQL Status'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log('');

    // Project Status
    if (status.project) {
      console.log(chalk.bold('Project'));
      console.log(chalk.gray(`  Root:        ${status.project.root}`));
      console.log(chalk.gray(`  Name:        ${status.project.name}`));
      console.log(chalk.gray(`  PostgreSQL:  ${status.project.pgVersion}`));
      console.log(chalk.gray(`  SIMD Mode:   ${status.project.simdMode}`));
      console.log(
        chalk.gray(`  Docker:      ${status.project.dockerEnabled ? 'Enabled' : 'Disabled'}`)
      );
      console.log('');
    } else {
      console.log(chalk.yellow('Not in a RuVector project directory'));
      console.log(chalk.gray('Run "ruvector-pg init" to create a project.'));
      console.log('');
    }

    // Container Status
    if (status.container) {
      const isRunning = status.container.running;
      const statusColor = isRunning ? chalk.green : chalk.yellow;

      console.log(chalk.bold('Container'));
      console.log(chalk.gray(`  Name:    ${status.container.name}`));
      console.log(statusColor(`  Status:  ${status.container.status}`));
      console.log(chalk.gray(`  Ports:   ${status.container.ports || 'None'}`));
      console.log('');

      if (isRunning && config) {
        console.log(chalk.bold('Connection'));
        console.log(chalk.gray(`  Host:     localhost`));
        console.log(chalk.gray(`  Port:     ${config.postgres.port}`));
        console.log(chalk.gray(`  Database: ${config.postgres.database}`));
        console.log(chalk.gray(`  User:     ${config.postgres.user}`));
        console.log(
          chalk.cyan(
            `  URI:      postgresql://${config.postgres.user}@localhost:${config.postgres.port}/${config.postgres.database}`
          )
        );
        console.log('');
      }
    } else if (inProject && config?.docker.enabled) {
      console.log(chalk.bold('Container'));
      console.log(chalk.yellow('  Not running'));
      console.log(chalk.gray('  Run "ruvector-pg start" to start the container.'));
      console.log('');
    }

    // Extension Status
    if (status.extension) {
      console.log(chalk.bold('Extension'));
      if (status.extension.installed) {
        console.log(chalk.green(`  Status:  Installed`));
        console.log(chalk.gray(`  Version: ${status.extension.version}`));
      } else {
        console.log(chalk.yellow(`  Status:  Not installed`));
        if (status.extension.error) {
          console.log(chalk.gray(`  Error:   ${status.extension.error}`));
        }
      }
      console.log('');
    }

    // System Information
    if (options.system) {
      console.log(chalk.bold('System Information'));
      console.log(chalk.gray(formatSystemInfo(status.system)));
      console.log('');

      // Recommendations
      console.log(chalk.bold('Recommendations'));
      const recommended = getRecommendedSimdMode();
      console.log(chalk.gray(`  Optimal SIMD: ${recommended}`));

      if (!status.system.docker) {
        console.log(chalk.yellow('  Docker not available - install for local development'));
      }

      if (!status.system.rust) {
        console.log(chalk.yellow('  Rust not installed - required to build from source'));
      }
      console.log('');
    }

    // Container Logs
    if (options.logs && status.container) {
      console.log(chalk.bold('Recent Logs'));
      console.log(chalk.gray('─'.repeat(60)));
      const logs = getContainerLogs(status.container.name, 20);
      console.log(chalk.gray(logs || 'No logs available'));
      console.log('');
    }

    // Quick commands
    if (!options.json) {
      console.log(chalk.bold('Quick Commands'));
      if (!inProject) {
        console.log(chalk.gray('  ruvector-pg init        Initialize a new project'));
      } else if (!status.container?.running) {
        console.log(chalk.gray('  ruvector-pg start       Start the database'));
      } else {
        console.log(chalk.gray('  ruvector-pg stop        Stop the database'));
        console.log(chalk.gray('  ruvector-pg db migrate  Run migrations'));
        console.log(chalk.gray('  ruvector-pg bench       Run benchmarks'));
      }
      console.log('');
    }
  });
