# rUvector

High-performance vector database with native Rust bindings and WebAssembly fallback. Fast, efficient, and easy to use.

## Features

- 🚀 **Blazing Fast**: Native Rust performance with SIMD optimizations
- 🌐 **Universal**: Works everywhere with WASM fallback
- 🧠 **Smart Loading**: Automatically uses best available backend
- 📦 **Zero Config**: Works out of the box
- 🎯 **HNSW Index**: State-of-the-art approximate nearest neighbor search
- 💾 **Persistent**: Save and load indices from disk
- 🔍 **Flexible Search**: Multiple distance metrics (cosine, euclidean, dot product)
- 📊 **Rich Metadata**: Store arbitrary metadata with vectors
- 🛠️ **CLI Tools**: Beautiful command-line interface included

## Installation

```bash
npm install ruvector
```

For best performance, install the native bindings:

```bash
npm install ruvector @ruvector/core
```

The package will automatically fall back to WASM if native bindings aren't available.

## Quick Start

```javascript
const { VectorIndex, Utils } = require('ruvector');

// Create an index
const index = new VectorIndex({
  dimension: 384,
  metric: 'cosine',
  indexType: 'hnsw'
});

// Insert vectors
await index.insert({
  id: 'doc1',
  values: [0.1, 0.2, 0.3, ...], // 384-dimensional vector
  metadata: { title: 'My Document', category: 'tech' }
});

// Search
const results = await index.search(queryVector, { k: 10 });
console.log(results); // Top 10 similar vectors
```

## CLI Usage

```bash
# Show backend info
npx ruvector info

# Initialize index
npx ruvector init my-index.bin --dimension 384 --type hnsw

# Insert vectors from JSON
npx ruvector insert my-index.bin vectors.json

# Search
npx ruvector search my-index.bin --query "[0.1, 0.2, ...]" -k 10

# Show statistics
npx ruvector stats my-index.bin

# Run benchmarks
npx ruvector benchmark --dimension 384 --num-vectors 10000
```

## API Reference

### VectorIndex

```typescript
class VectorIndex {
  constructor(options: CreateIndexOptions);

  // Insert a single vector
  async insert(vector: Vector): Promise<void>;

  // Insert multiple vectors in batches
  async insertBatch(vectors: Vector[], options?: BatchInsertOptions): Promise<void>;

  // Search for k nearest neighbors
  async search(query: number[], options?: SearchOptions): Promise<SearchResult[]>;

  // Get vector by ID
  async get(id: string): Promise<Vector | null>;

  // Delete vector by ID
  async delete(id: string): Promise<boolean>;

  // Get statistics
  async stats(): Promise<IndexStats>;

  // Save to disk
  async save(path: string): Promise<void>;

  // Load from disk
  static async load(path: string): Promise<VectorIndex>;

  // Clear all vectors
  async clear(): Promise<void>;

  // Optimize index
  async optimize(): Promise<void>;
}
```

### Types

```typescript
interface CreateIndexOptions {
  dimension: number;
  metric?: 'cosine' | 'euclidean' | 'dot';
  indexType?: 'flat' | 'hnsw';
  hnswConfig?: {
    m?: number;              // Default: 16
    efConstruction?: number; // Default: 200
  };
}

interface Vector {
  id: string;
  values: number[];
  metadata?: Record<string, any>;
}

interface SearchOptions {
  k?: number;           // Number of results (default: 10)
  ef?: number;          // HNSW search parameter (default: efConstruction)
  filter?: Record<string, any>;
}

interface SearchResult {
  id: string;
  score: number;
  metadata?: Record<string, any>;
}
```

### Utils

```typescript
// Calculate cosine similarity
Utils.cosineSimilarity(a: number[], b: number[]): number

// Calculate euclidean distance
Utils.euclideanDistance(a: number[], b: number[]): number

// Normalize vector
Utils.normalize(vector: number[]): number[]

// Generate random vector for testing
Utils.randomVector(dimension: number): number[]
```

### Backend Info

```typescript
// Get backend information
getBackendInfo(): { type: 'native' | 'wasm', version: string, features: string[] }

// Check if native bindings are available
isNativeAvailable(): boolean
```

## Examples

See the [examples](./examples) directory for complete examples:

- [basic-usage.js](./examples/basic-usage.js) - Basic operations
- [advanced-search.js](./examples/advanced-search.js) - Advanced search features
- [benchmark.js](./examples/benchmark.js) - Performance benchmarks

## Performance

With native bindings:
- **Insert**: 50,000+ vectors/sec (dim=384)
- **Search**: 10,000+ queries/sec (k=10)
- **Latency**: <1ms per query (HNSW)

Performance varies by:
- Vector dimension
- Dataset size
- Hardware (CPU, SIMD support)
- Backend (native vs WASM)

Run your own benchmarks:
```bash
npx ruvector benchmark --dimension 384 --num-vectors 10000
```

## Architecture

```
┌─────────────┐
│  ruvector   │  (This package - smart loader)
└─────────────┘
       │
       ├─────────────┐
       │             │
┌──────▼─────┐ ┌────▼────────┐
│ @ruvector/ │ │ @ruvector/  │
│   core     │ │    wasm     │
│  (Native)  │ │   (WASM)    │
└────────────┘ └─────────────┘
```

The main package automatically selects the best available backend.

## License

MIT

## Links

- [GitHub Repository](https://github.com/ruvnet/ruvector)
- [Documentation](https://github.com/ruvnet/ruvector/tree/main/docs)
- [Issues](https://github.com/ruvnet/ruvector/issues)
