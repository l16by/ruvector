# @ruvector/postgres

**Supabase-style CLI for RuVector PostgreSQL** - High-performance vector similarity search extension for PostgreSQL.

[![npm version](https://img.shields.io/npm/v/@ruvector/postgres.svg)](https://www.npmjs.com/package/@ruvector/postgres)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

`@ruvector/postgres` provides a complete CLI for managing the RuVector PostgreSQL extension, offering a developer experience similar to Supabase CLI. It handles:

- **Local Development** - Docker-based PostgreSQL with RuVector pre-installed
- **Extension Installation** - Install RuVector to existing PostgreSQL instances
- **Database Management** - Migrations, dumps, schema management
- **Configuration** - YAML-based project configuration
- **Performance Benchmarking** - Built-in vector search benchmarks
- **Migration Tools** - Migrate from pgvector to RuVector

## Installation

```bash
# Global installation
npm install -g @ruvector/postgres

# Or use with npx
npx @ruvector/postgres --help
```

## Quick Start

### 1. Initialize a Project

```bash
# Create a new RuVector project
npx @ruvector/postgres init

# Follow the prompts to configure:
# - PostgreSQL version (14-17)
# - SIMD optimization (AVX-512, AVX2, NEON)
# - Docker or direct installation
# - Database settings
```

### 2. Start Local Development

```bash
# Start PostgreSQL with RuVector (Docker)
npx @ruvector/postgres start

# Check status
npx @ruvector/postgres status

# Connect to database
npx @ruvector/postgres db shell
```

### 3. Use RuVector

```sql
-- Create extension
CREATE EXTENSION ruvector;

-- Create table with vector column
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    content TEXT,
    embedding ruvector(1536)  -- OpenAI ada-002 dimensions
);

-- Create HNSW index for fast similarity search
CREATE INDEX ON documents USING ruhnsw (embedding ruvector_cosine_ops);

-- Insert vectors
INSERT INTO documents (content, embedding)
VALUES ('Hello world', '[0.1, 0.2, 0.3, ...]');

-- Similarity search
SELECT content, embedding <=> '[0.1, 0.2, ...]'::ruvector AS distance
FROM documents
ORDER BY distance
LIMIT 10;
```

## Commands

### Project Management

| Command | Description |
|---------|-------------|
| `init` | Initialize a new RuVector project |
| `start` | Start local PostgreSQL with RuVector |
| `stop` | Stop local PostgreSQL |
| `status` | Show project and database status |

### Extension Management

| Command | Description |
|---------|-------------|
| `install` | Install RuVector extension to PostgreSQL |
| `upgrade` | Upgrade to latest RuVector version |
| `migrate` | Migrate from pgvector to RuVector |

### Database Commands

| Command | Description |
|---------|-------------|
| `db migrate` | Run database migrations |
| `db dump` | Export database to SQL file |
| `db push` | Push schema changes |
| `db reset` | Reset database (destructive) |
| `db stats` | Show vector statistics |
| `db shell` | Open PostgreSQL shell |

### Configuration

| Command | Description |
|---------|-------------|
| `config show` | Display current configuration |
| `config set <key> <value>` | Set configuration value |
| `config get <key>` | Get configuration value |
| `config edit` | Open config in editor |
| `config optimize` | Auto-optimize for system |

### Benchmarking

```bash
# Run performance benchmark
npx @ruvector/postgres bench --dimensions 1536 --vectors 10000

# Quick benchmark
npx @ruvector/postgres bench --quick

# Full benchmark suite
npx @ruvector/postgres bench --full
```

## Project Configuration

RuVector projects use a `ruvector.yaml` configuration file:

```yaml
# Project name
projectName: my-vector-app

# PostgreSQL settings
postgres:
  version: 16
  host: localhost
  port: 5432
  database: ruvector
  user: postgres

# Extension settings
extension:
  version: "0.1.0"
  simdMode: auto  # auto, avx512, avx2, neon, scalar
  hnswEfConstruction: 64
  hnswM: 16
  ivfflatLists: 100

# Docker settings
docker:
  enabled: true
  containerName: ruvector-postgres
  image: ruvector/postgres:latest
  dataVolume: ruvector_data
```

## Features

### SIMD Optimization

RuVector automatically detects and uses the best SIMD instructions:

- **AVX-512** - Intel/AMD, highest performance (3.7x faster)
- **AVX2** - Intel/AMD, high performance
- **NEON** - ARM64, Apple Silicon
- **Scalar** - Fallback for all platforms

### Index Types

- **HNSW** - High recall, fast queries (recommended)
- **IVFFlat** - Memory efficient, good for large datasets

### Distance Metrics

| Operator | Distance | Use Case |
|----------|----------|----------|
| `<->` | L2 (Euclidean) | General similarity |
| `<=>` | Cosine | Text embeddings |
| `<#>` | Inner Product | Normalized vectors |
| `<+>` | Manhattan (L1) | Sparse features |

### Vector Types

- `ruvector(n)` - Dense 32-bit vectors
- `halfvec(n)` - Half-precision (50% memory)
- `sparsevec(n)` - Sparse vectors

## Migration from pgvector

RuVector is API-compatible with pgvector:

```bash
# Analyze current pgvector setup
npx @ruvector/postgres migrate --analyze

# Perform migration
npx @ruvector/postgres migrate --from pgvector
```

Most queries work without modification:
```sql
-- Same syntax works for both
SELECT * FROM items ORDER BY embedding <-> '[1,2,3]' LIMIT 10;
```

## Requirements

- **Node.js** 18+ (for CLI)
- **Docker** (for local development)
- **PostgreSQL** 14-17 (for direct installation)
- **Rust** (for building from source)

## Platform Support

| Platform | Architecture | SIMD |
|----------|--------------|------|
| Linux | x64 | AVX-512, AVX2 |
| Linux | ARM64 | NEON |
| macOS | Intel | AVX2 |
| macOS | Apple Silicon | NEON |
| Windows | x64 | AVX2 |

## Related Packages

- [@ruvector/core](https://www.npmjs.com/package/@ruvector/core) - Native Node.js bindings
- [ruvector](https://www.npmjs.com/package/ruvector) - Full RuVector SDK

## Documentation

- [RuVector Documentation](https://github.com/ruvnet/ruvector)
- [PostgreSQL Extension Guide](https://github.com/ruvnet/ruvector/tree/main/crates/ruvector-postgres)
- [Migration Guide](https://github.com/ruvnet/ruvector/blob/main/crates/ruvector-postgres/docs/MIGRATION.md)

## License

MIT License - see [LICENSE](https://github.com/ruvnet/ruvector/blob/main/LICENSE)

## Contributing

Contributions welcome! See [CONTRIBUTING.md](https://github.com/ruvnet/ruvector/blob/main/CONTRIBUTING.md)
