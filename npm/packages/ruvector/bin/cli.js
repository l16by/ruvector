#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs');
const path = require('path');

// Import ruvector
let VectorDB, getVersion, getImplementationType;
try {
  const ruvector = require('../dist/index.js');
  VectorDB = ruvector.VectorDB;
  getVersion = ruvector.getVersion;
  getImplementationType = ruvector.getImplementationType;
} catch (e) {
  console.error(chalk.red('Error: Failed to load ruvector. Please run: npm run build'));
  process.exit(1);
}

const program = new Command();

// Version and description
const versionInfo = getVersion();
program
  .name('ruvector')
  .description(`${chalk.cyan('ruvector')} - High-performance vector database CLI\nUsing: ${chalk.yellow(versionInfo.implementation)} implementation`)
  .version(versionInfo.version);

// Create database
program
  .command('create <path>')
  .description('Create a new vector database')
  .option('-d, --dimension <number>', 'Vector dimension', '384')
  .option('-m, --metric <type>', 'Distance metric (cosine|euclidean|dot)', 'cosine')
  .action((dbPath, options) => {
    const spinner = ora('Creating database...').start();

    try {
      const dimension = parseInt(options.dimension);
      const db = new VectorDB({
        dimension,
        metric: options.metric,
        path: dbPath,
        autoPersist: true
      });

      db.save(dbPath);
      spinner.succeed(chalk.green(`Database created: ${dbPath}`));
      console.log(chalk.gray(`  Dimension: ${dimension}`));
      console.log(chalk.gray(`  Metric: ${options.metric}`));
      console.log(chalk.gray(`  Implementation: ${getImplementationType()}`));
    } catch (error) {
      spinner.fail(chalk.red('Failed to create database'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Insert vectors
program
  .command('insert <database> <file>')
  .description('Insert vectors from JSON file')
  .option('-b, --batch-size <number>', 'Batch size for insertion', '1000')
  .action((dbPath, file, options) => {
    const spinner = ora('Loading database...').start();

    try {
      // Read database metadata to get dimension
      let dimension = 384; // default
      if (fs.existsSync(dbPath)) {
        const dbData = fs.readFileSync(dbPath, 'utf8');
        const parsed = JSON.parse(dbData);
        dimension = parsed.dimension || 384;
      }

      const db = new VectorDB({ dimension });

      if (fs.existsSync(dbPath)) {
        db.load(dbPath);
      }

      spinner.text = 'Reading vectors...';
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const vectors = Array.isArray(data) ? data : [data];

      spinner.text = `Inserting ${vectors.length} vectors...`;
      const batchSize = parseInt(options.batchSize);

      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        db.insertBatch(batch);
        spinner.text = `Inserted ${Math.min(i + batchSize, vectors.length)}/${vectors.length} vectors...`;
      }

      db.save(dbPath);
      spinner.succeed(chalk.green(`Inserted ${vectors.length} vectors`));

      const stats = db.stats();
      console.log(chalk.gray(`  Total vectors: ${stats.count}`));
    } catch (error) {
      spinner.fail(chalk.red('Failed to insert vectors'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Search vectors
program
  .command('search <database>')
  .description('Search for similar vectors')
  .requiredOption('-v, --vector <json>', 'Query vector as JSON array')
  .option('-k, --top-k <number>', 'Number of results', '10')
  .option('-t, --threshold <number>', 'Similarity threshold', '0.0')
  .option('-f, --filter <json>', 'Metadata filter as JSON')
  .action((dbPath, options) => {
    const spinner = ora('Loading database...').start();

    try {
      // Read database metadata
      const dbData = fs.readFileSync(dbPath, 'utf8');
      const parsed = JSON.parse(dbData);
      const dimension = parsed.dimension || 384;

      const db = new VectorDB({ dimension });
      db.load(dbPath);

      spinner.text = 'Searching...';

      const vector = JSON.parse(options.vector);
      const query = {
        vector,
        k: parseInt(options.topK),
        threshold: parseFloat(options.threshold)
      };

      if (options.filter) {
        query.filter = JSON.parse(options.filter);
      }

      const results = db.search(query);
      spinner.succeed(chalk.green(`Found ${results.length} results`));

      console.log(chalk.cyan('\nSearch Results:'));
      results.forEach((result, i) => {
        console.log(chalk.white(`\n${i + 1}. ID: ${result.id}`));
        console.log(chalk.yellow(`   Score: ${result.score.toFixed(4)}`));
        if (result.metadata) {
          console.log(chalk.gray(`   Metadata: ${JSON.stringify(result.metadata)}`));
        }
      });
    } catch (error) {
      spinner.fail(chalk.red('Failed to search'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Show stats
program
  .command('stats <database>')
  .description('Show database statistics')
  .action((dbPath) => {
    const spinner = ora('Loading database...').start();

    try {
      const dbData = fs.readFileSync(dbPath, 'utf8');
      const parsed = JSON.parse(dbData);
      const dimension = parsed.dimension || 384;

      const db = new VectorDB({ dimension });
      db.load(dbPath);

      const stats = db.stats();
      spinner.succeed(chalk.green('Database statistics'));

      console.log(chalk.cyan('\nDatabase Stats:'));
      console.log(chalk.white(`  Vector Count: ${chalk.yellow(stats.count)}`));
      console.log(chalk.white(`  Dimension: ${chalk.yellow(stats.dimension)}`));
      console.log(chalk.white(`  Metric: ${chalk.yellow(stats.metric)}`));
      console.log(chalk.white(`  Implementation: ${chalk.yellow(getImplementationType())}`));

      if (stats.memoryUsage) {
        const mb = (stats.memoryUsage / (1024 * 1024)).toFixed(2);
        console.log(chalk.white(`  Memory Usage: ${chalk.yellow(mb + ' MB')}`));
      }

      const fileStats = fs.statSync(dbPath);
      const fileMb = (fileStats.size / (1024 * 1024)).toFixed(2);
      console.log(chalk.white(`  File Size: ${chalk.yellow(fileMb + ' MB')}`));
    } catch (error) {
      spinner.fail(chalk.red('Failed to load database'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Benchmark
program
  .command('benchmark')
  .description('Run performance benchmarks')
  .option('-d, --dimension <number>', 'Vector dimension', '384')
  .option('-n, --num-vectors <number>', 'Number of vectors', '10000')
  .option('-q, --num-queries <number>', 'Number of queries', '1000')
  .action((options) => {
    console.log(chalk.cyan('\nruvector Performance Benchmark'));
    console.log(chalk.gray(`Implementation: ${getImplementationType()}\n`));

    const dimension = parseInt(options.dimension);
    const numVectors = parseInt(options.numVectors);
    const numQueries = parseInt(options.numQueries);

    let spinner = ora('Creating database...').start();

    try {
      const db = new VectorDB({ dimension, metric: 'cosine' });
      spinner.succeed();

      // Insert benchmark
      spinner = ora(`Inserting ${numVectors} vectors...`).start();
      const insertStart = Date.now();

      const vectors = [];
      for (let i = 0; i < numVectors; i++) {
        vectors.push({
          id: `vec_${i}`,
          vector: Array.from({ length: dimension }, () => Math.random()),
          metadata: { index: i, batch: Math.floor(i / 1000) }
        });
      }

      db.insertBatch(vectors);
      const insertTime = Date.now() - insertStart;
      const insertRate = (numVectors / (insertTime / 1000)).toFixed(0);

      spinner.succeed(chalk.green(`Inserted ${numVectors} vectors in ${insertTime}ms`));
      console.log(chalk.gray(`  Rate: ${chalk.yellow(insertRate)} vectors/sec`));

      // Search benchmark
      spinner = ora(`Running ${numQueries} searches...`).start();
      const searchStart = Date.now();

      for (let i = 0; i < numQueries; i++) {
        const query = {
          vector: Array.from({ length: dimension }, () => Math.random()),
          k: 10
        };
        db.search(query);
      }

      const searchTime = Date.now() - searchStart;
      const searchRate = (numQueries / (searchTime / 1000)).toFixed(0);
      const avgLatency = (searchTime / numQueries).toFixed(2);

      spinner.succeed(chalk.green(`Completed ${numQueries} searches in ${searchTime}ms`));
      console.log(chalk.gray(`  Rate: ${chalk.yellow(searchRate)} queries/sec`));
      console.log(chalk.gray(`  Avg Latency: ${chalk.yellow(avgLatency)}ms`));

      // Stats
      const stats = db.stats();
      console.log(chalk.cyan('\nFinal Stats:'));
      console.log(chalk.white(`  Vector Count: ${chalk.yellow(stats.count)}`));
      console.log(chalk.white(`  Dimension: ${chalk.yellow(stats.dimension)}`));
      console.log(chalk.white(`  Implementation: ${chalk.yellow(getImplementationType())}`));

    } catch (error) {
      spinner.fail(chalk.red('Benchmark failed'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Info command
program
  .command('info')
  .description('Show ruvector information')
  .action(() => {
    const info = getVersion();
    console.log(chalk.cyan('\nruvector Information'));
    console.log(chalk.white(`  Version: ${chalk.yellow(info.version)}`));
    console.log(chalk.white(`  Implementation: ${chalk.yellow(info.implementation)}`));
    console.log(chalk.white(`  Node Version: ${chalk.yellow(process.version)}`));
    console.log(chalk.white(`  Platform: ${chalk.yellow(process.platform)}`));
    console.log(chalk.white(`  Architecture: ${chalk.yellow(process.arch)}`));
  });

program.parse();
