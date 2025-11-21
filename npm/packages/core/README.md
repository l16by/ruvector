# @ruvector/core

Native NAPI bindings for Ruvector vector database.

## Platform Support

This package automatically installs the correct native module for your platform:

- **Linux**: x64, ARM64
- **macOS**: x64 (Intel), ARM64 (Apple Silicon)
- **Windows**: x64

## Installation

```bash
npm install @ruvector/core
```

The correct platform-specific package will be automatically installed as an optional dependency.

## Usage

```javascript
const { VectorDB } = require('@ruvector/core');

async function example() {
  // Create database with 128 dimensions
  const db = VectorDB.withDimensions(128);

  // Insert a vector
  const id = await db.insert({
    vector: new Float32Array(128).fill(0.5)
  });

  // Search for similar vectors
  const results = await db.search({
    vector: new Float32Array(128).fill(0.5),
    k: 10
  });

  console.log('Search results:', results);
}
```

## TypeScript

Full TypeScript definitions are included:

```typescript
import { VectorDB, VectorEntry, SearchQuery } from '@ruvector/core';

const db = VectorDB.withDimensions(128);
```

## Building from Source

If you need to build from source:

```bash
npm run build:napi
```

This requires:
- Rust toolchain (install from https://rustup.rs/)
- Node.js 16 or later

## Platform-Specific Packages

The following platform packages are automatically installed:

- `@ruvector/core-linux-x64`
- `@ruvector/core-linux-arm64`
- `@ruvector/core-darwin-x64`
- `@ruvector/core-darwin-arm64`
- `@ruvector/core-win32-x64`

## Performance

Ruvector uses high-performance Rust implementation with:
- **HNSW indexing** for fast approximate nearest neighbor search
- **SIMD optimizations** for vector operations
- **Multi-threaded operations** with async support
- **Native performance** with zero-copy Float32Array handling

Benchmark (128-dim vectors):
- Insert: 50,000+ vectors/sec
- Search: 10,000+ queries/sec (k=10)
- Memory: ~50 bytes per vector

## License

MIT
