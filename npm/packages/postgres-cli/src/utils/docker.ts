/**
 * Docker utilities for RuVector PostgreSQL CLI
 */

import { execSync, spawn, ChildProcess } from 'child_process';
import { commandExists } from './system';
import chalk from 'chalk';

export interface DockerContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string;
  created: string;
}

export interface DockerConfig {
  containerName: string;
  image: string;
  pgVersion: number;
  port: number;
  password: string;
  database: string;
  dataVolume: string;
  simdMode: string;
  enableHnsw: boolean;
  enableIvfflat: boolean;
  enableQuantization: boolean;
}

/**
 * Check if Docker is available and running
 */
export function isDockerAvailable(): boolean {
  if (!commandExists('docker')) {
    return false;
  }

  try {
    execSync('docker info', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a container exists
 */
export function containerExists(name: string): boolean {
  try {
    execSync(`docker ps -a --filter name=^${name}$ --format "{{.Names}}"`, {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a container is running
 */
export function isContainerRunning(name: string): boolean {
  try {
    const output = execSync(
      `docker ps --filter name=^${name}$ --filter status=running --format "{{.Names}}"`,
      { encoding: 'utf8', stdio: 'pipe' }
    ).trim();
    return output === name;
  } catch {
    return false;
  }
}

/**
 * Get container info
 */
export function getContainerInfo(name: string): DockerContainerInfo | null {
  try {
    const output = execSync(
      `docker ps -a --filter name=^${name}$ --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.CreatedAt}}"`,
      { encoding: 'utf8', stdio: 'pipe' }
    ).trim();

    if (!output) return null;

    const [id, containerName, image, status, ports, created] = output.split('|');
    return { id, name: containerName, image, status, ports, created };
  } catch {
    return null;
  }
}

/**
 * Generate Dockerfile content for RuVector PostgreSQL
 */
export function generateDockerfile(config: DockerConfig): string {
  return `# RuVector PostgreSQL Docker Image
# High-performance vector similarity search with SIMD optimization

FROM postgres:${config.pgVersion}

LABEL maintainer="RuVector Team <info@ruv.io>"
LABEL description="PostgreSQL with RuVector vector similarity search extension"
LABEL org.opencontainers.image.source="https://github.com/ruvnet/ruvector"

# Install build dependencies
RUN apt-get update && apt-get install -y \\
    build-essential \\
    pkg-config \\
    libssl-dev \\
    libclang-dev \\
    clang \\
    cmake \\
    git \\
    curl \\
    ca-certificates \\
    postgresql-server-dev-${config.pgVersion} \\
    && rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:\${PATH}"

# Install pgrx
RUN cargo install cargo-pgrx --version "0.12.9" --locked
RUN cargo pgrx init --pg${config.pgVersion} /usr/bin/pg_config

# Copy and build RuVector extension
WORKDIR /build
COPY . .

# Build with appropriate SIMD mode
ARG SIMD_MODE=${config.simdMode}
ENV RUSTFLAGS="-C target-cpu=native"

RUN cd crates/ruvector-postgres && \\
    cargo pgrx package --pg-config /usr/bin/pg_config

# Install extension
RUN cp target/release/ruvector-pg${config.pgVersion}/usr/lib/postgresql/${config.pgVersion}/lib/ruvector.so \\
    /usr/lib/postgresql/${config.pgVersion}/lib/ && \\
    cp target/release/ruvector-pg${config.pgVersion}/usr/share/postgresql/${config.pgVersion}/extension/ruvector* \\
    /usr/share/postgresql/${config.pgVersion}/extension/

# Cleanup build artifacts
WORKDIR /
RUN rm -rf /build /root/.cargo /root/.rustup

# Add initialization script
COPY docker-entrypoint-initdb.d/ /docker-entrypoint-initdb.d/

# Set PostgreSQL configuration for vector workloads
RUN echo "shared_preload_libraries = 'ruvector'" >> /usr/share/postgresql/postgresql.conf.sample && \\
    echo "max_parallel_workers_per_gather = 4" >> /usr/share/postgresql/postgresql.conf.sample && \\
    echo "max_parallel_maintenance_workers = 4" >> /usr/share/postgresql/postgresql.conf.sample && \\
    echo "maintenance_work_mem = '2GB'" >> /usr/share/postgresql/postgresql.conf.sample

EXPOSE 5432
`;
}

/**
 * Generate docker-compose.yml content
 */
export function generateDockerCompose(config: DockerConfig): string {
  return `# RuVector PostgreSQL Docker Compose Configuration
# Usage: docker-compose up -d

version: '3.8'

services:
  postgres:
    container_name: ${config.containerName}
    image: ${config.image}
    build:
      context: .
      dockerfile: Dockerfile
      args:
        SIMD_MODE: ${config.simdMode}
    restart: unless-stopped
    ports:
      - "${config.port}:5432"
    environment:
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-${config.password}}
      POSTGRES_USER: postgres
      POSTGRES_DB: ${config.database}
      # RuVector configuration
      RUVECTOR_SIMD_MODE: ${config.simdMode}
      RUVECTOR_HNSW_EF_CONSTRUCTION: 64
      RUVECTOR_HNSW_M: 16
      RUVECTOR_IVFFLAT_LISTS: 100
    volumes:
      - ${config.dataVolume}:/var/lib/postgresql/data
      - ./init:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    command:
      - "postgres"
      - "-c"
      - "shared_preload_libraries=ruvector"
      - "-c"
      - "max_parallel_workers_per_gather=4"
      - "-c"
      - "max_parallel_maintenance_workers=4"

volumes:
  ${config.dataVolume}:
    driver: local

networks:
  default:
    name: ruvector-network
`;
}

/**
 * Generate init SQL script
 */
export function generateInitSql(config: DockerConfig): string {
  return `-- RuVector PostgreSQL Initialization Script
-- This script runs automatically when the container starts

-- Create the extension
CREATE EXTENSION IF NOT EXISTS ruvector;

-- Create example table with vector column
CREATE TABLE IF NOT EXISTS embeddings (
    id SERIAL PRIMARY KEY,
    content TEXT,
    embedding ruvector(1536),  -- OpenAI ada-002 dimensions
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for fast similarity search
${config.enableHnsw ? `
-- HNSW index for high recall
CREATE INDEX IF NOT EXISTS embeddings_hnsw_idx
ON embeddings USING ruhnsw (embedding ruvector_cosine_ops)
WITH (m = 16, ef_construction = 64);
` : ''}

${config.enableIvfflat ? `
-- IVFFlat index for memory efficiency
-- CREATE INDEX IF NOT EXISTS embeddings_ivfflat_idx
-- ON embeddings USING ruivfflat (embedding ruvector_l2_ops)
-- WITH (lists = 100);
` : ''}

-- Create function for similarity search
CREATE OR REPLACE FUNCTION search_similar(
    query_embedding ruvector,
    limit_count INTEGER DEFAULT 10,
    similarity_threshold FLOAT DEFAULT 0.0
)
RETURNS TABLE (
    id INTEGER,
    content TEXT,
    similarity FLOAT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.content,
        1 - (e.embedding <=> query_embedding) AS similarity,
        e.metadata
    FROM embeddings e
    WHERE 1 - (e.embedding <=> query_embedding) >= similarity_threshold
    ORDER BY e.embedding <=> query_embedding
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Log success
DO $$
BEGIN
    RAISE NOTICE 'RuVector PostgreSQL initialized successfully!';
    RAISE NOTICE 'Extension version: %', (SELECT extversion FROM pg_extension WHERE extname = 'ruvector');
END $$;
`;
}

/**
 * Start a Docker container
 */
export async function startContainer(config: DockerConfig): Promise<void> {
  const { containerName, port, password, database, dataVolume } = config;

  // Check if container already exists
  if (isContainerRunning(containerName)) {
    console.log(chalk.yellow(`Container ${containerName} is already running`));
    return;
  }

  // If container exists but stopped, start it
  if (containerExists(containerName)) {
    execSync(`docker start ${containerName}`, { stdio: 'inherit' });
    return;
  }

  // Create and start new container
  const dockerRun = [
    'docker run -d',
    `--name ${containerName}`,
    `-p ${port}:5432`,
    `-e POSTGRES_PASSWORD=${password}`,
    `-e POSTGRES_DB=${database}`,
    `-v ${dataVolume}:/var/lib/postgresql/data`,
    config.image,
  ].join(' ');

  execSync(dockerRun, { stdio: 'inherit' });
}

/**
 * Stop a Docker container
 */
export function stopContainer(name: string): void {
  if (isContainerRunning(name)) {
    execSync(`docker stop ${name}`, { stdio: 'inherit' });
  }
}

/**
 * Remove a Docker container
 */
export function removeContainer(name: string, removeVolumes = false): void {
  if (containerExists(name)) {
    stopContainer(name);
    const cmd = removeVolumes ? `docker rm -v ${name}` : `docker rm ${name}`;
    execSync(cmd, { stdio: 'inherit' });
  }
}

/**
 * Get container logs
 */
export function getContainerLogs(name: string, lines = 100): string {
  try {
    return execSync(`docker logs --tail ${lines} ${name}`, {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch {
    return '';
  }
}

/**
 * Execute SQL in container
 */
export function execSqlInContainer(
  containerName: string,
  sql: string,
  database = 'postgres'
): string {
  try {
    return execSync(
      `docker exec ${containerName} psql -U postgres -d ${database} -c "${sql.replace(/"/g, '\\"')}"`,
      { encoding: 'utf8', stdio: 'pipe' }
    );
  } catch (e: any) {
    throw new Error(`SQL execution failed: ${e.message}`);
  }
}

/**
 * Wait for PostgreSQL to be ready
 */
export async function waitForPostgres(
  containerName: string,
  timeout = 60000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      execSync(`docker exec ${containerName} pg_isready -U postgres`, {
        stdio: 'pipe',
      });
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return false;
}
