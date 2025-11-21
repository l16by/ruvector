# Ruvector Tiny Dancer Node.js

[![npm version](https://img.shields.io/npm/v/ruvector-tiny-dancer.svg)](https://www.npmjs.com/package/ruvector-tiny-dancer)
[![Documentation](https://img.shields.io/badge/docs-typescript-blue)](https://github.com/ruvnet/ruvector)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/ruvnet/ruvector/workflows/CI/badge.svg)](https://github.com/ruvnet/ruvector/actions)
[![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org)

Native Node.js bindings for Tiny Dancer neural routing via NAPI-RS - **zero-copy, maximum performance**.

## 🚀 Introduction

Tiny Dancer for Node.js delivers production-grade AI routing with **native performance**. Built with NAPI-RS, it provides zero-copy buffer sharing, async/await support, and complete TypeScript definitions for seamless integration into your Node.js applications.

Achieve **70-85% LLM cost reduction** with:
- ⚡ Zero-copy buffer sharing
- 🔄 Async/await native promises
- 📘 Complete TypeScript definitions
- 🚀 Native performance (6-12µs inference)
- 🔧 Hot model reloading
- 💾 Built-in SQLite persistence

## ✨ Features

- ⚡ **Native Performance**: 7.5µs inference time (Rust-level speed)
- 🔄 **Async/Await**: Native promise-based API
- 📘 **TypeScript**: Full type definitions included
- 💾 **Zero-Copy**: Direct buffer sharing with Rust
- 🔥 **Hot Reload**: Update models without restart
- 🔒 **Thread-Safe**: Safe concurrent access
- 📊 **Built-in Metrics**: Performance monitoring
- 🗄️ **SQLite Storage**: Optional persistence

## 📦 Installation

### NPM

```bash
npm install ruvector-tiny-dancer
```

### Yarn

```bash
yarn add ruvector-tiny-dancer
```

### PNPM

```bash
pnpm add ruvector-tiny-dancer
```

## 🚀 Quick Start

### TypeScript

```typescript
import { Router, RouterConfig } from 'ruvector-tiny-dancer';

// Create router
const router = new Router({
  modelPath: './models/fastgrnn.safetensors',
  confidenceThreshold: 0.85,
  maxUncertainty: 0.15,
  enableCircuitBreaker: true
});

// Prepare request
const request = {
  queryEmbedding: new Float32Array([0.5, 0.5, /* ... */]),
  candidates: [
    {
      id: 'candidate-1',
      embedding: new Float32Array([0.5, 0.5, /* ... */]),
      metadata: JSON.stringify({ category: 'search' }),
      createdAt: Math.floor(Date.now() / 1000),
      accessCount: 10,
      successRate: 0.95
    }
  ]
};

// Route request (async)
const response = await router.route(request);

console.log(`Inference time: ${response.inferenceTimeUs}µs`);
response.decisions.forEach(decision => {
  console.log(`${decision.candidateId}: ${decision.confidence.toFixed(2)}`);
  console.log(`Route to: ${decision.useLightweight ? 'Lightweight' : 'Powerful'}`);
});
```

### JavaScript

```javascript
const { Router } = require('ruvector-tiny-dancer');

async function main() {
  const router = new Router({
    modelPath: './models/fastgrnn.safetensors',
    confidenceThreshold: 0.85
  });

  const response = await router.route({
    queryEmbedding: new Float32Array(384).fill(0.5),
    candidates: [{
      id: 'test-1',
      embedding: new Float32Array(384).fill(0.6),
      accessCount: 10,
      successRate: 0.95
    }]
  });

  console.log('Routed in', response.inferenceTimeUs, 'µs');
}

main();
```

## 📚 Tutorials

### Tutorial 1: Express.js Integration

```typescript
import express from 'express';
import { Router } from 'ruvector-tiny-dancer';

const app = express();
const router = new Router({ modelPath: './models/fastgrnn.safetensors' });

app.use(express.json());

app.post('/route', async (req, res) => {
  try {
    const response = await router.route(req.body);
    res.json({
      decisions: response.decisions,
      inferenceTimeUs: response.inferenceTimeUs,
      candidatesProcessed: response.candidatesProcessed
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('✅ Router API running on port 3000');
});
```

### Tutorial 2: Fastify Integration

```typescript
import Fastify from 'fastify';
import { Router } from 'ruvector-tiny-dancer';

const fastify = Fastify({ logger: true });
const router = new Router({ modelPath: './models/fastgrnn.safetensors' });

// Decorate Fastify with router
fastify.decorate('router', router);

fastify.post('/route', async (request, reply) => {
  const response = await fastify.router.route(request.body);
  return response;
});

// Hot reload endpoint
fastify.post('/reload', async (request, reply) => {
  await fastify.router.reloadModel();
  return { status: 'Model reloaded' };
});

await fastify.listen({ port: 3000 });
```

### Tutorial 3: Next.js API Route

```typescript
// pages/api/route.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Router } from 'ruvector-tiny-dancer';

// Initialize router once
let router: Router | null = null;

function getRouter() {
  if (!router) {
    router = new Router({
      modelPath: './models/fastgrnn.safetensors',
      confidenceThreshold: 0.85
    });
  }
  return router;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const router = getRouter();
    const response = await router.route(req.body);

    res.status(200).json({
      decisions: response.decisions,
      inferenceTimeUs: response.inferenceTimeUs
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
```

### Tutorial 4: Batch Processing

```typescript
import { Router } from 'ruvector-tiny-dancer';
import { promisify } from 'util';
import { readFile } from 'fs';

const readFileAsync = promisify(readFile);

async function processBatch() {
  const router = new Router({ modelPath: './models/fastgrnn.safetensors' });

  // Load batch of requests
  const requests = JSON.parse(
    await readFileAsync('./requests.json', 'utf-8')
  );

  // Process in parallel with concurrency limit
  const concurrency = 10;
  const results = [];

  for (let i = 0; i < requests.length; i += concurrency) {
    const batch = requests.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(req => router.route(req))
    );
    results.push(...batchResults);
  }

  // Aggregate metrics
  const totalTime = results.reduce((sum, r) => sum + r.inferenceTimeUs, 0);
  const avgTime = totalTime / results.length;

  console.log(`Processed ${results.length} requests`);
  console.log(`Average inference time: ${avgTime.toFixed(2)}µs`);

  return results;
}

processBatch();
```

### Tutorial 5: Worker Threads

```typescript
// router-worker.ts
import { Router } from 'ruvector-tiny-dancer';
import { parentPort } from 'worker_threads';

const router = new Router({ modelPath: './models/fastgrnn.safetensors' });

parentPort?.on('message', async (request) => {
  try {
    const response = await router.route(request);
    parentPort?.postMessage({ success: true, response });
  } catch (error) {
    parentPort?.postMessage({ success: false, error: error.message });
  }
});

// main.ts
import { Worker } from 'worker_threads';

class RouterPool {
  private workers: Worker[] = [];

  constructor(size: number) {
    for (let i = 0; i < size; i++) {
      this.workers.push(new Worker('./router-worker.ts'));
    }
  }

  async route(request: any): Promise<any> {
    const worker = this.workers[Math.floor(Math.random() * this.workers.length)];

    return new Promise((resolve, reject) => {
      worker.once('message', (result) => {
        if (result.success) {
          resolve(result.response);
        } else {
          reject(new Error(result.error));
        }
      });
      worker.postMessage(request);
    });
  }
}

// Usage
const pool = new RouterPool(4);
const response = await pool.route(request);
```

### Tutorial 6: Monitoring & Metrics

```typescript
import { Router } from 'ruvector-tiny-dancer';
import { performance } from 'perf_hooks';

class MonitoredRouter {
  private router: Router;
  private metrics = {
    totalRequests: 0,
    totalInferenceTime: 0,
    errors: 0,
    circuitBreakerTrips: 0
  };

  constructor(config: any) {
    this.router = new Router(config);
  }

  async route(request: any) {
    const start = performance.now();
    this.metrics.totalRequests++;

    try {
      const response = await this.router.route(request);
      this.metrics.totalInferenceTime += response.inferenceTimeUs;

      // Check circuit breaker
      const cbStatus = this.router.circuitBreakerStatus();
      if (cbStatus === false) {
        this.metrics.circuitBreakerTrips++;
      }

      return response;
    } catch (error) {
      this.metrics.errors++;
      throw error;
    } finally {
      console.log(`Request took ${(performance.now() - start).toFixed(2)}ms`);
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      avgInferenceTimeUs: this.metrics.totalInferenceTime / this.metrics.totalRequests,
      errorRate: this.metrics.errors / this.metrics.totalRequests
    };
  }
}

// Usage
const router = new MonitoredRouter({ modelPath: './models/fastgrnn.safetensors' });

setInterval(() => {
  const metrics = router.getMetrics();
  console.log('Metrics:', metrics);
}, 10000); // Log every 10 seconds
```

## 🎯 Advanced Usage

### Hot Model Reloading

```typescript
// Reload model without restart
await router.reloadModel();

// Watch for model file changes
import { watch } from 'fs';

watch('./models/fastgrnn.safetensors', async (event) => {
  if (event === 'change') {
    console.log('Model changed, reloading...');
    await router.reloadModel();
    console.log('✅ Model reloaded');
  }
});
```

### Circuit Breaker Monitoring

```typescript
const status = router.circuitBreakerStatus();
if (status === false) {
  console.warn('⚠️ Circuit breaker is open, using fallback');
  // Use fallback routing logic
} else {
  // Normal routing
}
```

### Custom Configuration

```typescript
const router = new Router({
  modelPath: './models/custom.safetensors',
  confidenceThreshold: 0.90,      // Higher threshold
  maxUncertainty: 0.10,            // Lower tolerance
  enableCircuitBreaker: true,
  circuitBreakerThreshold: 3,      // Faster circuit opening
  enableQuantization: true,
  databasePath: './data/routing.db' // Optional persistence
});
```

## 📊 Performance

| Operation | Latency | Throughput |
|-----------|---------|------------|
| Single inference | 7.5µs | 133K req/s |
| Batch 10 | 75µs | 133K req/s |
| Batch 100 | 735µs | 136K req/s |
| Complete routing (10 candidates) | 8.8µs | 113K req/s |
| Complete routing (100 candidates) | 92.9µs | 10.7K req/s |

*Benchmarked on Apple M1, Node.js 20*

## 🔧 TypeScript Types

```typescript
interface RouterConfig {
  modelPath: string;
  confidenceThreshold?: number;
  maxUncertainty?: number;
  enableCircuitBreaker?: boolean;
  circuitBreakerThreshold?: number;
  enableQuantization?: boolean;
  databasePath?: string;
}

interface Candidate {
  id: string;
  embedding: Float32Array;
  metadata?: string;
  createdAt?: number;
  accessCount?: number;
  successRate?: number;
}

interface RoutingRequest {
  queryEmbedding: Float32Array;
  candidates: Candidate[];
  metadata?: string;
}

interface RoutingDecision {
  candidateId: string;
  confidence: number;
  useLightweight: boolean;
  uncertainty: number;
}

interface RoutingResponse {
  decisions: RoutingDecision[];
  inferenceTimeUs: number;
  candidatesProcessed: number;
  featureTimeUs: number;
}
```

## 🔗 Related Projects

- **Core**: [ruvector-tiny-dancer-core](../ruvector-tiny-dancer-core) - Rust implementation
- **WASM**: [ruvector-tiny-dancer-wasm](../ruvector-tiny-dancer-wasm) - Browser bindings
- **Ruvector**: [ruvector](../..) - Vector database

## 📚 Resources

- **GitHub**: [github.com/ruvnet/ruvector](https://github.com/ruvnet/ruvector)
- **Website**: [ruv.io](https://ruv.io)
- **Examples**: [github.com/ruvnet/ruvector/tree/main/examples](https://github.com/ruvnet/ruvector/tree/main/examples)
- **NAPI-RS**: [napi.rs](https://napi.rs)

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](../../CONTRIBUTING.md).

## 📄 License

MIT License - see [LICENSE](../../LICENSE).

---

Built with ❤️ by the [Ruvector Team](https://github.com/ruvnet)
