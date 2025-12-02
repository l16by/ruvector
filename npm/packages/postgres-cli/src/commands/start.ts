/**
 * Start command - Start RuVector PostgreSQL local development environment
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Listr } from 'listr2';
import { loadProjectConfig, isInProject } from '../utils/config';
import {
  isDockerAvailable,
  isContainerRunning,
  containerExists,
  startContainer,
  waitForPostgres,
  execSqlInContainer,
  getContainerInfo,
} from '../utils/docker';
import { execSync } from 'child_process';

export const startCommand = new Command('start')
  .description('Start RuVector PostgreSQL local development environment')
  .option('--no-docker', 'Start without Docker (use existing PostgreSQL)')
  .option('--build', 'Force rebuild of Docker image')
  .option('--detach', 'Run in background', true)
  .option('-p, --port <port>', 'Override PostgreSQL port')
  .action(async (options) => {
    console.log('');
    console.log(chalk.bold.cyan('Starting RuVector PostgreSQL'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log('');

    // Check if in project
    if (!isInProject()) {
      console.log(chalk.yellow('Not in a RuVector project directory.'));
      console.log(chalk.gray('Run "ruvector-pg init" first to create a project.'));
      console.log('');
      console.log(chalk.gray('Or use --no-docker to connect to existing PostgreSQL.'));
      return;
    }

    const config = loadProjectConfig();

    if (!config.docker.enabled || options.docker === false) {
      console.log(chalk.yellow('Docker mode is disabled.'));
      console.log(chalk.gray('Please start your PostgreSQL server manually.'));
      console.log('');
      console.log('To enable Docker mode, update ruvector.yaml:');
      console.log(chalk.gray('  docker:'));
      console.log(chalk.gray('    enabled: true'));
      return;
    }

    // Check Docker availability
    if (!isDockerAvailable()) {
      console.log(chalk.red('Docker is not available.'));
      console.log('');
      console.log('Please install Docker:');
      console.log(chalk.gray('  https://docs.docker.com/get-docker/'));
      console.log('');
      console.log('Or disable Docker mode in ruvector.yaml');
      process.exit(1);
    }

    const containerName = config.docker.containerName || 'ruvector-postgres';
    const port = options.port || config.postgres.port || 5432;

    // Check if already running
    if (isContainerRunning(containerName)) {
      const info = getContainerInfo(containerName);
      console.log(chalk.green('RuVector PostgreSQL is already running.'));
      console.log('');
      console.log(chalk.bold('Container Info:'));
      console.log(chalk.gray(`  Name:   ${info?.name}`));
      console.log(chalk.gray(`  Status: ${info?.status}`));
      console.log(chalk.gray(`  Ports:  ${info?.ports}`));
      console.log('');
      console.log(chalk.bold('Connection:'));
      console.log(chalk.gray(`  Host:     localhost`));
      console.log(chalk.gray(`  Port:     ${port}`));
      console.log(chalk.gray(`  Database: ${config.postgres.database}`));
      console.log(chalk.gray(`  User:     ${config.postgres.user}`));
      console.log('');
      console.log('Use ' + chalk.cyan('ruvector-pg status') + ' for more details.');
      return;
    }

    // Start services using Listr for nice progress display
    const tasks = new Listr([
      {
        title: 'Checking Docker setup',
        task: async () => {
          if (!isDockerAvailable()) {
            throw new Error('Docker is not running');
          }
        },
      },
      {
        title: 'Building Docker image',
        enabled: () => options.build || !containerExists(containerName),
        task: async (ctx, task) => {
          try {
            task.title = 'Building Docker image (this may take a few minutes)...';
            execSync('docker-compose build', {
              stdio: 'pipe',
              cwd: process.cwd(),
            });
          } catch (e: any) {
            // Fall back to pulling pre-built image
            task.title = 'Pulling pre-built image...';
            try {
              execSync(`docker pull ${config.docker.image}`, { stdio: 'pipe' });
            } catch {
              throw new Error('Failed to build or pull Docker image');
            }
          }
        },
      },
      {
        title: 'Starting PostgreSQL container',
        task: async (ctx, task) => {
          if (containerExists(containerName) && !isContainerRunning(containerName)) {
            // Start existing container
            task.title = 'Starting existing container...';
            execSync(`docker start ${containerName}`, { stdio: 'pipe' });
          } else if (!containerExists(containerName)) {
            // Start with docker-compose
            task.title = 'Creating and starting container...';
            try {
              execSync('docker-compose up -d', {
                stdio: 'pipe',
                cwd: process.cwd(),
                env: {
                  ...process.env,
                  POSTGRES_PASSWORD: config.postgres.password || 'ruvector_dev',
                },
              });
            } catch {
              // Fallback: run directly
              const dockerRun = [
                'docker run -d',
                `--name ${containerName}`,
                `-p ${port}:5432`,
                `-e POSTGRES_PASSWORD=${config.postgres.password || 'ruvector_dev'}`,
                `-e POSTGRES_DB=${config.postgres.database}`,
                `-v ${config.docker.dataVolume}:/var/lib/postgresql/data`,
                `postgres:${config.postgres.version}`,
              ].join(' ');
              execSync(dockerRun, { stdio: 'pipe' });
            }
          }
        },
      },
      {
        title: 'Waiting for PostgreSQL to be ready',
        task: async (ctx, task) => {
          const ready = await waitForPostgres(containerName, 60000);
          if (!ready) {
            throw new Error('PostgreSQL failed to start within 60 seconds');
          }
        },
      },
      {
        title: 'Installing RuVector extension',
        task: async (ctx, task) => {
          try {
            execSqlInContainer(
              containerName,
              'CREATE EXTENSION IF NOT EXISTS ruvector;',
              config.postgres.database
            );
          } catch {
            task.title = 'RuVector extension not yet installed (build from source required)';
            // This is okay - extension may need to be installed manually
          }
        },
      },
      {
        title: 'Running initialization scripts',
        task: async () => {
          // Run any init scripts from docker/init/
          // These are automatically run by PostgreSQL on first start
        },
      },
    ]);

    try {
      await tasks.run();

      console.log('');
      console.log(chalk.green.bold('✓ RuVector PostgreSQL is running!'));
      console.log('');
      console.log(chalk.bold('Connection Details:'));
      console.log(chalk.gray(`  Host:     localhost`));
      console.log(chalk.gray(`  Port:     ${port}`));
      console.log(chalk.gray(`  Database: ${config.postgres.database}`));
      console.log(chalk.gray(`  User:     ${config.postgres.user}`));
      console.log(chalk.gray(`  Password: (see .env or ruvector.yaml)`));
      console.log('');
      console.log(chalk.bold('Connection String:'));
      console.log(
        chalk.cyan(
          `  postgresql://${config.postgres.user}@localhost:${port}/${config.postgres.database}`
        )
      );
      console.log('');
      console.log(chalk.bold('Quick Commands:'));
      console.log(chalk.gray('  Check status:    ruvector-pg status'));
      console.log(chalk.gray('  View logs:       docker logs -f ' + containerName));
      console.log(chalk.gray('  Connect psql:    docker exec -it ' + containerName + ' psql -U postgres'));
      console.log(chalk.gray('  Stop:            ruvector-pg stop'));
      console.log('');
    } catch (error: any) {
      console.log('');
      console.log(chalk.red('Failed to start RuVector PostgreSQL'));
      console.log(chalk.gray(error.message));
      console.log('');
      console.log('Try running with --build to rebuild the image:');
      console.log(chalk.gray('  ruvector-pg start --build'));
      process.exit(1);
    }
  });
