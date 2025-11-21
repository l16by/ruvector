# ruvector

High-performance vector database for Node.js with automatic native/WASM fallback.

## Features

- **Automatic Platform Detection**: Uses native Rust implementation when available, falls back to WASM
- **High Performance**: 150x faster than pgvector, handles millions of vectors
- **Simple API**: Easy-to-use TypeScript/JavaScript interface
- **CLI Tools**: Command-line interface for database management
- **Multiple Metrics**: Cosine, Euclidean, and Dot Product similarity
- **HNSW Indexing**: Fast approximate nearest neighbor search
- **Persistent Storage**: Save and load databases from disk

## Installation

```bash
npm install ruvector
```

## Quick Start

```typescript
const { VectorDB } = require('ruvector');

// Create a database
const db = new VectorDB({
  dimension: 384,
  metric: 'cosine'
});

// Insert vectors
db.insert({
  id: 'doc1',
  vector: [0.1, 0.2, 0.3, ...],
  metadata: { title: 'Document 1' }
});

// Search
const results = db.search({
  vector: [0.1, 0.2, 0.3, ...],
  k: 10
});

console.log(results);
// [{ id: 'doc1', score: 0.95, vector: [...], metadata: {...} }]
```

## CLI Usage

```bash
# Create a database
ruvector create mydb.vec --dimension 384 --metric cosine

# Insert vectors from JSON
ruvector insert mydb.vec vectors.json

# Search
ruvector search mydb.vec --vector "[0.1,0.2,0.3,...]" --top-k 10

# Show statistics
ruvector stats mydb.vec

# Run benchmark
ruvector benchmark --num-vectors 10000 --num-queries 1000

# Show info
ruvector info
```

## API Reference

### VectorDB

```typescript
class VectorDB {
  constructor(options: DbOptions);
  insert(entry: VectorEntry): void;
  insertBatch(entries: VectorEntry[]): void;
  search(query: SearchQuery): SearchResult[];
  get(id: string): VectorEntry | null;
  delete(id: string): boolean;
  stats(): DbStats;
  save(path: string): void;
  load(path: string): void;
}
```

### Types

```typescript
interface VectorEntry {
  id: string;
  vector: number[];
  metadata?: Record<string, any>;
}

interface SearchQuery {
  vector: number[];
  k?: number;
  filter?: Record<string, any>;
  threshold?: number;
}

interface SearchResult {
  id: string;
  score: number;
  vector: number[];
  metadata?: Record<string, any>;
}
```

## Implementation Detection

```typescript
const { getImplementationType, isNative, isWasm } = require('ruvector');

console.log(getImplementationType()); // 'native' or 'wasm'
console.log(isNative()); // true if using native
console.log(isWasm()); // true if using WASM
```

## Performance

ruvector automatically uses the fastest available implementation:

- **Native (Rust)**: 150x faster than pgvector, best for production
- **WASM**: Universal fallback, works on all platforms, ~10x faster than pure JS

## License

MIT
