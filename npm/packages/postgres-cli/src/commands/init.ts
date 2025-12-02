/**
 * Init command - Initialize a new RuVector PostgreSQL project
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import {
  defaultConfig,
  generateConfigContent,
  isInProject,
  saveProjectConfig,
  RuvectorConfig,
} from '../utils/config';
import { getSystemInfo, getRecommendedSimdMode, formatSystemInfo } from '../utils/system';
import { isDockerAvailable, generateDockerCompose, generateInitSql } from '../utils/docker';

export const initCommand = new Command('init')
  .description('Initialize a new RuVector PostgreSQL project')
  .option('-y, --yes', 'Accept all defaults without prompting')
  .option('--name <name>', 'Project name')
  .option('--pg-version <version>', 'PostgreSQL version (14, 15, 16, 17)', '16')
  .option('--docker', 'Use Docker for local development')
  .option('--no-docker', 'Install directly without Docker')
  .option('--with-examples', 'Include example files')
  .action(async (options) => {
    console.log('');
    console.log(chalk.bold.cyan('RuVector PostgreSQL Project Initialization'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log('');

    // Check if already in a project
    if (isInProject()) {
      console.log(chalk.yellow('A RuVector project already exists in this directory.'));
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: 'Do you want to reinitialize?',
          default: false,
        },
      ]);
      if (!overwrite) {
        console.log(chalk.gray('Initialization cancelled.'));
        return;
      }
    }

    // Detect system info
    const spinner = ora('Detecting system capabilities...').start();
    const sysInfo = getSystemInfo();
    spinner.succeed('System capabilities detected');

    console.log('');
    console.log(chalk.bold('System Information:'));
    console.log(chalk.gray(formatSystemInfo(sysInfo)));
    console.log('');

    // Get configuration from user or defaults
    let config: Partial<RuvectorConfig>;

    if (options.yes) {
      // Use defaults
      config = {
        projectName: options.name || path.basename(process.cwd()),
        postgres: {
          ...defaultConfig.postgres,
          version: parseInt(options.pgVersion, 10),
        },
        extension: {
          ...defaultConfig.extension,
          simdMode: getRecommendedSimdMode(),
        },
        docker: {
          ...defaultConfig.docker,
          enabled: options.docker !== false,
        },
      };
    } else {
      // Interactive prompts
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'projectName',
          message: 'Project name:',
          default: options.name || path.basename(process.cwd()),
        },
        {
          type: 'list',
          name: 'pgVersion',
          message: 'PostgreSQL version:',
          choices: ['17', '16', '15', '14'],
          default: options.pgVersion || '16',
        },
        {
          type: 'list',
          name: 'simdMode',
          message: 'SIMD optimization mode:',
          choices: [
            { name: `Auto-detect (recommended: ${getRecommendedSimdMode()})`, value: 'auto' },
            { name: 'AVX-512 (Intel/AMD, highest performance)', value: 'avx512', disabled: !sysInfo.simd.avx512 && 'Not available' },
            { name: 'AVX2 (Intel/AMD, high performance)', value: 'avx2', disabled: !sysInfo.simd.avx2 && 'Not available' },
            { name: 'NEON (ARM, Apple Silicon)', value: 'neon', disabled: !sysInfo.simd.neon && 'Not available' },
            { name: 'Scalar (fallback, no SIMD)', value: 'scalar' },
          ],
          default: 'auto',
        },
        {
          type: 'confirm',
          name: 'useDocker',
          message: 'Use Docker for local development?',
          default: isDockerAvailable(),
        },
        {
          type: 'input',
          name: 'port',
          message: 'PostgreSQL port:',
          default: '5432',
          when: (answers) => answers.useDocker,
        },
        {
          type: 'input',
          name: 'database',
          message: 'Default database name:',
          default: 'ruvector',
        },
        {
          type: 'confirm',
          name: 'enableHnsw',
          message: 'Enable HNSW indexes (high recall)?',
          default: true,
        },
        {
          type: 'confirm',
          name: 'enableIvfflat',
          message: 'Enable IVFFlat indexes (memory efficient)?',
          default: true,
        },
        {
          type: 'confirm',
          name: 'enableQuantization',
          message: 'Enable quantization (32x memory reduction)?',
          default: true,
        },
        {
          type: 'confirm',
          name: 'withExamples',
          message: 'Include example files?',
          default: true,
        },
      ]);

      config = {
        projectName: answers.projectName,
        postgres: {
          version: parseInt(answers.pgVersion, 10),
          host: 'localhost',
          port: parseInt(answers.port || '5432', 10),
          database: answers.database,
          user: 'postgres',
        },
        extension: {
          version: '0.1.0',
          simdMode: answers.simdMode,
          hnswEfConstruction: 64,
          hnswM: 16,
          ivfflatLists: 100,
        },
        docker: {
          enabled: answers.useDocker,
          containerName: 'ruvector-postgres',
          image: 'ruvector/postgres:latest',
          dataVolume: 'ruvector_data',
        },
        dev: {
          autoReload: true,
          logLevel: 'info',
        },
      };

      options.withExamples = answers.withExamples;
    }

    // Create project files
    console.log('');
    const createSpinner = ora('Creating project files...').start();

    try {
      // Create ruvector.yaml
      fs.writeFileSync('ruvector.yaml', generateConfigContent(config));
      createSpinner.text = 'Created ruvector.yaml';

      // Create directories
      fs.ensureDirSync('migrations');
      fs.ensureDirSync('sql');

      if (config.docker?.enabled) {
        fs.ensureDirSync('docker');
        fs.ensureDirSync('docker/init');

        // Create docker-compose.yml
        fs.writeFileSync(
          'docker-compose.yml',
          generateDockerCompose({
            containerName: config.docker.containerName || 'ruvector-postgres',
            image: config.docker.image || 'postgres:16',
            pgVersion: config.postgres?.version || 16,
            port: config.postgres?.port || 5432,
            password: 'ruvector_dev',
            database: config.postgres?.database || 'ruvector',
            dataVolume: config.docker.dataVolume || 'ruvector_data',
            simdMode: config.extension?.simdMode || 'auto',
            enableHnsw: true,
            enableIvfflat: true,
            enableQuantization: true,
          })
        );

        // Create init SQL
        fs.writeFileSync(
          'docker/init/01-init-ruvector.sql',
          generateInitSql({
            containerName: config.docker.containerName || 'ruvector-postgres',
            image: config.docker.image || 'postgres:16',
            pgVersion: config.postgres?.version || 16,
            port: config.postgres?.port || 5432,
            password: 'ruvector_dev',
            database: config.postgres?.database || 'ruvector',
            dataVolume: config.docker.dataVolume || 'ruvector_data',
            simdMode: config.extension?.simdMode || 'auto',
            enableHnsw: true,
            enableIvfflat: true,
            enableQuantization: true,
          })
        );
      }

      // Create .env.example
      fs.writeFileSync(
        '.env.example',
        `# RuVector PostgreSQL Environment Variables

# PostgreSQL Connection
POSTGRES_HOST=localhost
POSTGRES_PORT=${config.postgres?.port || 5432}
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=${config.postgres?.database || 'ruvector'}

# RuVector Configuration
RUVECTOR_SIMD_MODE=${config.extension?.simdMode || 'auto'}
RUVECTOR_HNSW_EF_SEARCH=40
RUVECTOR_IVFFLAT_PROBES=10

# Development
NODE_ENV=development
`
      );

      // Create .gitignore
      const gitignoreContent = `# Dependencies
node_modules/

# Build output
dist/
target/

# Environment
.env
.env.local
.env.*.local

# Docker
docker/data/

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/
`;

      if (!fs.existsSync('.gitignore')) {
        fs.writeFileSync('.gitignore', gitignoreContent);
      }

      // Create example files
      if (options.withExamples) {
        fs.ensureDirSync('examples');

        // Python example
        fs.writeFileSync(
          'examples/python_example.py',
          `"""
RuVector PostgreSQL Python Example
High-performance vector similarity search
"""

import psycopg2
import numpy as np

# Connect to PostgreSQL with RuVector
conn = psycopg2.connect(
    host="localhost",
    port=${config.postgres?.port || 5432},
    database="${config.postgres?.database || 'ruvector'}",
    user="postgres",
    password="your_password"
)

cursor = conn.cursor()

# Create extension (if not exists)
cursor.execute("CREATE EXTENSION IF NOT EXISTS ruvector;")

# Create table with vector column
cursor.execute("""
    CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        title TEXT,
        embedding ruvector(1536)
    )
""")

# Create HNSW index for fast similarity search
cursor.execute("""
    CREATE INDEX IF NOT EXISTS documents_embedding_idx
    ON documents USING ruhnsw (embedding ruvector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
""")

# Insert example vectors
def insert_document(title: str, embedding: list):
    cursor.execute(
        "INSERT INTO documents (title, embedding) VALUES (%s, %s)",
        (title, str(embedding))
    )

# Generate random embeddings for demo
for i in range(10):
    embedding = np.random.randn(1536).tolist()
    insert_document(f"Document {i}", embedding)

conn.commit()

# Search for similar documents
query_embedding = np.random.randn(1536).tolist()
cursor.execute("""
    SELECT id, title, embedding <=> %s::ruvector AS distance
    FROM documents
    ORDER BY embedding <=> %s::ruvector
    LIMIT 5
""", (str(query_embedding), str(query_embedding)))

print("\\nTop 5 similar documents:")
for row in cursor.fetchall():
    print(f"  ID: {row[0]}, Title: {row[1]}, Distance: {row[2]:.4f}")

cursor.close()
conn.close()
`
        );

        // Node.js example
        fs.writeFileSync(
          'examples/node_example.js',
          `/**
 * RuVector PostgreSQL Node.js Example
 * High-performance vector similarity search
 */

const { Client } = require('pg');

async function main() {
  // Connect to PostgreSQL with RuVector
  const client = new Client({
    host: 'localhost',
    port: ${config.postgres?.port || 5432},
    database: '${config.postgres?.database || 'ruvector'}',
    user: 'postgres',
    password: 'your_password'
  });

  await client.connect();

  // Create extension
  await client.query('CREATE EXTENSION IF NOT EXISTS ruvector;');

  // Create table with vector column
  await client.query(\`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name TEXT,
      embedding ruvector(384)
    )
  \`);

  // Create HNSW index
  await client.query(\`
    CREATE INDEX IF NOT EXISTS items_embedding_idx
    ON items USING ruhnsw (embedding ruvector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  \`);

  // Insert vectors
  function randomVector(dim) {
    return Array.from({ length: dim }, () => Math.random() * 2 - 1);
  }

  for (let i = 0; i < 10; i++) {
    const embedding = randomVector(384);
    await client.query(
      'INSERT INTO items (name, embedding) VALUES ($1, $2)',
      [\`Item \${i}\`, \`[\${embedding.join(',')}]\`]
    );
  }

  // Search for similar items
  const queryVector = randomVector(384);
  const result = await client.query(\`
    SELECT id, name, embedding <=> $1::ruvector AS distance
    FROM items
    ORDER BY embedding <=> $1::ruvector
    LIMIT 5
  \`, [\`[\${queryVector.join(',')}]\`]);

  console.log('\\nTop 5 similar items:');
  result.rows.forEach(row => {
    console.log(\`  ID: \${row.id}, Name: \${row.name}, Distance: \${parseFloat(row.distance).toFixed(4)}\`);
  });

  await client.end();
}

main().catch(console.error);
`
        );

        // SQL examples
        fs.writeFileSync(
          'sql/examples.sql',
          `-- RuVector PostgreSQL SQL Examples
-- High-performance vector similarity search

-- ============================================================================
-- SETUP
-- ============================================================================

-- Create the extension
CREATE EXTENSION IF NOT EXISTS ruvector;

-- Create a table with vector columns
CREATE TABLE embeddings (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding ruvector(1536),           -- Dense vector (OpenAI ada-002)
    embedding_half halfvec(1536),       -- Half-precision (50% memory)
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- HNSW index for high recall (cosine distance)
CREATE INDEX embeddings_hnsw_cosine_idx
ON embeddings USING ruhnsw (embedding ruvector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- HNSW index for L2 distance
CREATE INDEX embeddings_hnsw_l2_idx
ON embeddings USING ruhnsw (embedding ruvector_l2_ops)
WITH (m = 16, ef_construction = 64);

-- IVFFlat index for memory efficiency
CREATE INDEX embeddings_ivfflat_idx
ON embeddings USING ruivfflat (embedding ruvector_l2_ops)
WITH (lists = 100);

-- ============================================================================
-- INSERT VECTORS
-- ============================================================================

-- Insert a single vector
INSERT INTO embeddings (content, embedding)
VALUES ('Hello world', '[0.1, 0.2, 0.3, ...]');

-- Insert with half-precision
INSERT INTO embeddings (content, embedding_half)
VALUES ('Hello world', '[0.1, 0.2, 0.3, ...]'::halfvec);

-- ============================================================================
-- SIMILARITY SEARCH
-- ============================================================================

-- Find top 10 most similar (cosine)
SELECT id, content, embedding <=> '[0.1, 0.2, 0.3, ...]'::ruvector AS distance
FROM embeddings
ORDER BY embedding <=> '[0.1, 0.2, 0.3, ...]'::ruvector
LIMIT 10;

-- Find top 10 most similar (L2/Euclidean)
SELECT id, content, embedding <-> '[0.1, 0.2, 0.3, ...]'::ruvector AS distance
FROM embeddings
ORDER BY embedding <-> '[0.1, 0.2, 0.3, ...]'::ruvector
LIMIT 10;

-- Find top 10 with inner product
SELECT id, content, embedding <#> '[0.1, 0.2, 0.3, ...]'::ruvector AS distance
FROM embeddings
ORDER BY embedding <#> '[0.1, 0.2, 0.3, ...]'::ruvector
LIMIT 10;

-- ============================================================================
-- FILTERED SEARCH
-- ============================================================================

-- Search with metadata filter
SELECT id, content, embedding <=> $query::ruvector AS distance
FROM embeddings
WHERE metadata->>'category' = 'science'
ORDER BY embedding <=> $query::ruvector
LIMIT 10;

-- Search with date filter
SELECT id, content
FROM embeddings
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY embedding <=> $query::ruvector
LIMIT 10;

-- ============================================================================
-- TUNING
-- ============================================================================

-- Tune HNSW search quality (higher = better recall, slower)
SET ruvector.ef_search = 100;

-- Tune IVFFlat probes (higher = better recall, slower)
SET ruvector.ivfflat_probes = 20;

-- ============================================================================
-- VECTOR OPERATIONS
-- ============================================================================

-- Get vector dimensions
SELECT ruvector_dims(embedding) FROM embeddings LIMIT 1;

-- Get vector L2 norm
SELECT ruvector_norm(embedding) FROM embeddings LIMIT 1;

-- Normalize a vector
SELECT ruvector_normalize('[3, 4]'::ruvector);  -- Returns [0.6, 0.8]
`
        );
      }

      createSpinner.succeed('Project files created');

      // Save configuration
      saveProjectConfig(config);

      // Print success message
      console.log('');
      console.log(chalk.green.bold('✓ RuVector PostgreSQL project initialized!'));
      console.log('');
      console.log(chalk.bold('Project structure:'));
      console.log(chalk.gray('  ruvector.yaml        - Project configuration'));
      if (config.docker?.enabled) {
        console.log(chalk.gray('  docker-compose.yml   - Docker configuration'));
        console.log(chalk.gray('  docker/init/         - Database initialization scripts'));
      }
      console.log(chalk.gray('  migrations/          - Database migrations'));
      console.log(chalk.gray('  sql/                 - SQL scripts'));
      if (options.withExamples) {
        console.log(chalk.gray('  examples/            - Example code'));
      }
      console.log('');
      console.log(chalk.bold('Next steps:'));

      if (config.docker?.enabled) {
        console.log('');
        console.log('  ' + chalk.cyan('1. Start the local environment:'));
        console.log('     ' + chalk.white('ruvector-pg start'));
        console.log('');
        console.log('  ' + chalk.cyan('2. Check status:'));
        console.log('     ' + chalk.white('ruvector-pg status'));
      } else {
        console.log('');
        console.log('  ' + chalk.cyan('1. Install the extension:'));
        console.log('     ' + chalk.white('ruvector-pg install'));
        console.log('');
        console.log('  ' + chalk.cyan('2. Create the extension in your database:'));
        console.log('     ' + chalk.white('psql -c "CREATE EXTENSION ruvector;"'));
      }

      console.log('');
      console.log('  ' + chalk.cyan('3. Run examples:'));
      console.log('     ' + chalk.white('node examples/node_example.js'));
      console.log('');
      console.log(chalk.gray('Documentation: https://github.com/ruvnet/ruvector'));
      console.log('');
    } catch (error: any) {
      createSpinner.fail('Failed to create project files');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });
