/**
 * Vector Commands
 * CLI commands for vector operations
 */

import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { readFileSync } from 'fs';
import type { RuVectorClient } from '../client.js';

export interface VectorCreateOptions {
  dim: string;
  index: 'hnsw' | 'ivfflat';
}

export interface VectorInsertOptions {
  file?: string;
  text?: string;
}

export interface VectorSearchOptions {
  query?: string;
  text?: string;
  topK: string;
  metric: 'cosine' | 'l2' | 'ip';
}

export class VectorCommands {
  static async create(
    client: RuVectorClient,
    name: string,
    options: VectorCreateOptions
  ): Promise<void> {
    const spinner = ora(`Creating vector table '${name}'...`).start();

    try {
      await client.connect();
      await client.createVectorTable(
        name,
        parseInt(options.dim),
        options.index
      );

      spinner.succeed(chalk.green(`Vector table '${name}' created successfully`));
      console.log(`  ${chalk.gray('Dimensions:')} ${options.dim}`);
      console.log(`  ${chalk.gray('Index Type:')} ${options.index.toUpperCase()}`);
    } catch (err) {
      spinner.fail(chalk.red('Failed to create vector table'));
      console.error(chalk.red((err as Error).message));
    } finally {
      await client.disconnect();
    }
  }

  static async insert(
    client: RuVectorClient,
    table: string,
    options: VectorInsertOptions
  ): Promise<void> {
    const spinner = ora(`Inserting vectors into '${table}'...`).start();

    try {
      await client.connect();

      let vectors: { vector: number[]; metadata?: Record<string, unknown> }[] = [];

      if (options.file) {
        const content = readFileSync(options.file, 'utf-8');
        const data = JSON.parse(content);
        vectors = Array.isArray(data) ? data : [data];
      } else if (options.text) {
        // For text, we'd need an embedding model
        // For now, just show a placeholder
        console.log(chalk.yellow('Note: Text embedding requires an embedding model'));
        console.log(chalk.gray('Using placeholder embedding...'));
        vectors = [{
          vector: Array(384).fill(0).map(() => Math.random()),
          metadata: { text: options.text }
        }];
      }

      let inserted = 0;
      for (const item of vectors) {
        await client.insertVector(table, item.vector, item.metadata);
        inserted++;
      }

      spinner.succeed(chalk.green(`Inserted ${inserted} vector(s) into '${table}'`));
    } catch (err) {
      spinner.fail(chalk.red('Failed to insert vectors'));
      console.error(chalk.red((err as Error).message));
    } finally {
      await client.disconnect();
    }
  }

  static async search(
    client: RuVectorClient,
    table: string,
    options: VectorSearchOptions
  ): Promise<void> {
    const spinner = ora(`Searching vectors in '${table}'...`).start();

    try {
      await client.connect();

      let queryVector: number[];

      if (options.query) {
        queryVector = JSON.parse(options.query);
      } else if (options.text) {
        console.log(chalk.yellow('Note: Text embedding requires an embedding model'));
        console.log(chalk.gray('Using placeholder embedding...'));
        queryVector = Array(384).fill(0).map(() => Math.random());
      } else {
        throw new Error('Either --query or --text is required');
      }

      const results = await client.searchVectors(
        table,
        queryVector,
        parseInt(options.topK),
        options.metric
      );

      spinner.stop();

      if (results.length === 0) {
        console.log(chalk.yellow('No results found'));
        return;
      }

      const resultTable = new Table({
        head: [
          chalk.cyan('ID'),
          chalk.cyan('Distance'),
          chalk.cyan('Metadata')
        ],
        colWidths: [10, 15, 50]
      });

      for (const result of results) {
        resultTable.push([
          String(result.id),
          result.distance.toFixed(6),
          result.metadata ? JSON.stringify(result.metadata).slice(0, 45) + '...' : '-'
        ]);
      }

      console.log(chalk.bold.blue(`\nSearch Results (${results.length} matches)`));
      console.log(resultTable.toString());
    } catch (err) {
      spinner.fail(chalk.red('Search failed'));
      console.error(chalk.red((err as Error).message));
    } finally {
      await client.disconnect();
    }
  }
}

export default VectorCommands;
