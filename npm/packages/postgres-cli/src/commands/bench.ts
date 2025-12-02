/**
 * Bench command - Run performance benchmarks
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { table } from 'table';
import { loadProjectConfig, isInProject } from '../utils/config';
import { isContainerRunning, execSqlInContainer } from '../utils/docker';
import { getSystemInfo, getRecommendedSimdMode } from '../utils/system';

export const benchCommand = new Command('bench')
  .description('Run performance benchmarks')
  .option('-d, --dimensions <number>', 'Vector dimensions', '1536')
  .option('-n, --vectors <number>', 'Number of vectors', '10000')
  .option('-k, --top-k <number>', 'Number of results to retrieve', '10')
  .option('--metric <type>', 'Distance metric (cosine, l2, ip)', 'cosine')
  .option('--index <type>', 'Index type (hnsw, ivfflat, none)', 'hnsw')
  .option('--quick', 'Quick benchmark (fewer iterations)')
  .option('--full', 'Full benchmark suite')
  .option('--output <format>', 'Output format (table, json, csv)', 'table')
  .action(async (options) => {
    console.log('');
    console.log(chalk.bold.cyan('RuVector Performance Benchmark'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log('');

    const dimensions = parseInt(options.dimensions, 10);
    const numVectors = parseInt(options.vectors, 10);
    const topK = parseInt(options.topK, 10);

    console.log(chalk.bold('Configuration:'));
    console.log(chalk.gray(`  Dimensions:  ${dimensions}`));
    console.log(chalk.gray(`  Vectors:     ${numVectors.toLocaleString()}`));
    console.log(chalk.gray(`  Top-K:       ${topK}`));
    console.log(chalk.gray(`  Metric:      ${options.metric}`));
    console.log(chalk.gray(`  Index:       ${options.index}`));
    console.log('');

    // System info
    const sysInfo = getSystemInfo();
    console.log(chalk.bold('System:'));
    console.log(chalk.gray(`  Platform:    ${sysInfo.os} (${sysInfo.arch})`));
    console.log(chalk.gray(`  SIMD:        ${getRecommendedSimdMode()}`));
    console.log('');

    // Check if we have a running database
    let runInDb = false;
    if (isInProject()) {
      const config = loadProjectConfig();
      const containerName = config.docker?.containerName || 'ruvector-postgres';
      if (config.docker?.enabled && isContainerRunning(containerName)) {
        runInDb = true;
      }
    }

    if (runInDb) {
      await runDatabaseBenchmark(options, dimensions, numVectors, topK);
    } else {
      // Run synthetic benchmark
      await runSyntheticBenchmark(options, dimensions, numVectors, topK);
    }
  });

async function runDatabaseBenchmark(
  options: any,
  dimensions: number,
  numVectors: number,
  topK: number
) {
  const config = loadProjectConfig();
  const containerName = config.docker?.containerName || 'ruvector-postgres';

  console.log(chalk.bold('Running database benchmark...'));
  console.log('');

  const results: any[] = [];

  try {
    // Create benchmark table
    const setupSpinner = ora('Setting up benchmark table...').start();

    execSqlInContainer(
      containerName,
      `
      DROP TABLE IF EXISTS bench_vectors;
      CREATE TABLE bench_vectors (
        id SERIAL PRIMARY KEY,
        embedding ruvector(${dimensions})
      );
    `,
      config.postgres.database
    );

    setupSpinner.succeed('Benchmark table created');

    // Insert vectors
    const insertSpinner = ora(`Inserting ${numVectors} vectors...`).start();
    const insertStart = Date.now();

    // Insert in batches
    const batchSize = 1000;
    for (let i = 0; i < numVectors; i += batchSize) {
      const batch = Math.min(batchSize, numVectors - i);
      execSqlInContainer(
        containerName,
        `
        INSERT INTO bench_vectors (embedding)
        SELECT ARRAY(SELECT random() FROM generate_series(1, ${dimensions}))::ruvector
        FROM generate_series(1, ${batch});
      `,
        config.postgres.database
      );
      insertSpinner.text = `Inserted ${Math.min(i + batch, numVectors)}/${numVectors} vectors...`;
    }

    const insertTime = Date.now() - insertStart;
    insertSpinner.succeed(`Inserted ${numVectors} vectors in ${insertTime}ms`);

    results.push({
      operation: 'Insert',
      count: numVectors,
      time: insertTime,
      throughput: Math.round((numVectors / insertTime) * 1000),
      unit: 'vectors/sec',
    });

    // Create index
    if (options.index !== 'none') {
      const indexSpinner = ora(`Creating ${options.index.toUpperCase()} index...`).start();
      const indexStart = Date.now();

      const indexType = options.index === 'hnsw' ? 'ruhnsw' : 'ruivfflat';
      const opsType =
        options.metric === 'cosine'
          ? 'ruvector_cosine_ops'
          : options.metric === 'ip'
          ? 'ruvector_ip_ops'
          : 'ruvector_l2_ops';

      const indexOptions =
        options.index === 'hnsw'
          ? 'WITH (m = 16, ef_construction = 64)'
          : 'WITH (lists = 100)';

      execSqlInContainer(
        containerName,
        `CREATE INDEX bench_idx ON bench_vectors USING ${indexType} (embedding ${opsType}) ${indexOptions};`,
        config.postgres.database
      );

      const indexTime = Date.now() - indexStart;
      indexSpinner.succeed(`${options.index.toUpperCase()} index created in ${indexTime}ms`);

      results.push({
        operation: 'Index Build',
        count: numVectors,
        time: indexTime,
        throughput: Math.round((numVectors / indexTime) * 1000),
        unit: 'vectors/sec',
      });
    }

    // Search benchmark
    const searchIterations = options.quick ? 10 : 100;
    const searchSpinner = ora(`Running ${searchIterations} search queries...`).start();
    const searchStart = Date.now();

    const distOp =
      options.metric === 'cosine' ? '<=>' : options.metric === 'ip' ? '<#>' : '<->';

    for (let i = 0; i < searchIterations; i++) {
      execSqlInContainer(
        containerName,
        `
        SELECT id, embedding ${distOp} (SELECT embedding FROM bench_vectors ORDER BY random() LIMIT 1) AS distance
        FROM bench_vectors
        ORDER BY embedding ${distOp} (SELECT embedding FROM bench_vectors ORDER BY random() LIMIT 1)
        LIMIT ${topK};
      `,
        config.postgres.database
      );
    }

    const searchTime = Date.now() - searchStart;
    const avgSearchTime = searchTime / searchIterations;
    searchSpinner.succeed(
      `Completed ${searchIterations} searches in ${searchTime}ms (avg: ${avgSearchTime.toFixed(2)}ms)`
    );

    results.push({
      operation: 'Search',
      count: searchIterations,
      time: searchTime,
      throughput: Math.round((searchIterations / searchTime) * 1000),
      unit: 'queries/sec',
    });

    // Cleanup
    execSqlInContainer(containerName, 'DROP TABLE bench_vectors;', config.postgres.database);

    // Output results
    console.log('');
    console.log(chalk.bold('Results:'));
    console.log('');

    if (options.output === 'json') {
      console.log(JSON.stringify(results, null, 2));
    } else if (options.output === 'csv') {
      console.log('operation,count,time_ms,throughput,unit');
      for (const r of results) {
        console.log(`${r.operation},${r.count},${r.time},${r.throughput},${r.unit}`);
      }
    } else {
      const tableData = [
        ['Operation', 'Count', 'Time (ms)', 'Throughput'],
        ...results.map((r) => [r.operation, r.count.toLocaleString(), r.time, `${r.throughput.toLocaleString()} ${r.unit}`]),
      ];
      console.log(table(tableData));
    }
  } catch (error: any) {
    console.log(chalk.red('Benchmark failed'));
    console.log(chalk.gray(error.message));
    process.exit(1);
  }
}

async function runSyntheticBenchmark(
  options: any,
  dimensions: number,
  numVectors: number,
  topK: number
) {
  console.log(chalk.yellow('No running database found. Running synthetic benchmark...'));
  console.log('');
  console.log(chalk.gray('Start a database with "ruvector-pg start" for real benchmarks.'));
  console.log('');

  const results: any[] = [];

  // Generate random vectors
  const genSpinner = ora(`Generating ${numVectors} random vectors...`).start();
  const genStart = Date.now();

  const vectors: number[][] = [];
  for (let i = 0; i < numVectors; i++) {
    const vec = new Array(dimensions);
    for (let j = 0; j < dimensions; j++) {
      vec[j] = Math.random() * 2 - 1;
    }
    vectors.push(vec);
  }

  const genTime = Date.now() - genStart;
  genSpinner.succeed(`Generated ${numVectors} vectors in ${genTime}ms`);

  results.push({
    operation: 'Generate',
    count: numVectors,
    time: genTime,
    throughput: Math.round((numVectors / genTime) * 1000),
    unit: 'vectors/sec',
  });

  // Distance calculation benchmark
  const iterations = options.quick ? 100 : 1000;
  const distSpinner = ora(`Running ${iterations} distance calculations...`).start();
  const distStart = Date.now();

  const queryVec = vectors[0];
  for (let i = 0; i < iterations; i++) {
    const targetVec = vectors[Math.floor(Math.random() * numVectors)];

    if (options.metric === 'cosine') {
      cosineSimilarity(queryVec, targetVec);
    } else if (options.metric === 'ip') {
      innerProduct(queryVec, targetVec);
    } else {
      euclideanDistance(queryVec, targetVec);
    }
  }

  const distTime = Date.now() - distStart;
  distSpinner.succeed(`Completed ${iterations} distance calculations in ${distTime}ms`);

  results.push({
    operation: 'Distance',
    count: iterations,
    time: distTime,
    throughput: Math.round((iterations / distTime) * 1000),
    unit: 'ops/sec',
  });

  // Brute force search
  const searchIterations = options.quick ? 10 : 50;
  const searchSpinner = ora(`Running ${searchIterations} brute-force searches...`).start();
  const searchStart = Date.now();

  for (let i = 0; i < searchIterations; i++) {
    const query = vectors[Math.floor(Math.random() * numVectors)];
    bruteForcesearch(vectors, query, topK, options.metric);
  }

  const searchTime = Date.now() - searchStart;
  searchSpinner.succeed(
    `Completed ${searchIterations} searches in ${searchTime}ms (avg: ${(searchTime / searchIterations).toFixed(2)}ms)`
  );

  results.push({
    operation: 'Search',
    count: searchIterations,
    time: searchTime,
    throughput: Math.round((searchIterations / searchTime) * 1000),
    unit: 'queries/sec',
  });

  // Output results
  console.log('');
  console.log(chalk.bold('Results (JavaScript baseline):'));
  console.log('');

  if (options.output === 'json') {
    console.log(JSON.stringify(results, null, 2));
  } else {
    const tableData = [
      ['Operation', 'Count', 'Time (ms)', 'Throughput'],
      ...results.map((r) => [r.operation, r.count.toLocaleString(), r.time, `${r.throughput.toLocaleString()} ${r.unit}`]),
    ];
    console.log(table(tableData));
  }

  console.log(chalk.gray('Note: RuVector with SIMD is typically 3-10x faster than JavaScript.'));
  console.log('');
}

// Helper functions
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function innerProduct(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function bruteForcesearch(
  vectors: number[][],
  query: number[],
  k: number,
  metric: string
): number[] {
  const distances = vectors.map((v, i) => ({
    index: i,
    distance:
      metric === 'cosine'
        ? 1 - cosineSimilarity(query, v)
        : metric === 'ip'
        ? -innerProduct(query, v)
        : euclideanDistance(query, v),
  }));
  distances.sort((a, b) => a.distance - b.distance);
  return distances.slice(0, k).map((d) => d.index);
}
