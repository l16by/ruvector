/**
 * Vector database types compatible with both NAPI and WASM backends
 */

export interface Vector {
  id: string;
  values: number[];
  metadata?: Record<string, any>;
}

export interface SearchResult {
  id: string;
  score: number;
  metadata?: Record<string, any>;
}

export interface IndexStats {
  vectorCount: number;
  dimension: number;
  indexType: string;
  memoryUsage?: number;
}

export interface CreateIndexOptions {
  dimension: number;
  metric?: 'cosine' | 'euclidean' | 'dot';
  indexType?: 'flat' | 'hnsw';
  hnswConfig?: {
    m?: number;
    efConstruction?: number;
  };
}

export interface SearchOptions {
  k?: number;
  ef?: number;
  filter?: Record<string, any>;
}

export interface BatchInsertOptions {
  batchSize?: number;
  progressCallback?: (progress: number) => void;
}

export interface BenchmarkResult {
  operation: string;
  duration: number;
  throughput?: number;
  memoryUsage?: number;
}

export class VectorIndex {
  constructor(options: CreateIndexOptions);

  /**
   * Insert a single vector into the index
   */
  insert(vector: Vector): Promise<void>;

  /**
   * Insert multiple vectors in batches
   */
  insertBatch(vectors: Vector[], options?: BatchInsertOptions): Promise<void>;

  /**
   * Search for k nearest neighbors
   */
  search(query: number[], options?: SearchOptions): Promise<SearchResult[]>;

  /**
   * Get vector by ID
   */
  get(id: string): Promise<Vector | null>;

  /**
   * Delete vector by ID
   */
  delete(id: string): Promise<boolean>;

  /**
   * Get index statistics
   */
  stats(): Promise<IndexStats>;

  /**
   * Save index to file
   */
  save(path: string): Promise<void>;

  /**
   * Load index from file
   */
  static load(path: string): Promise<VectorIndex>;

  /**
   * Clear all vectors from index
   */
  clear(): Promise<void>;

  /**
   * Optimize index (rebuild HNSW, etc.)
   */
  optimize(): Promise<void>;
}

/**
 * Backend information
 */
export interface BackendInfo {
  type: 'native' | 'wasm';
  version: string;
  features: string[];
}

/**
 * Get information about the active backend
 */
export function getBackendInfo(): BackendInfo;

/**
 * Check if native bindings are available
 */
export function isNativeAvailable(): boolean;

/**
 * Utilities
 */
export namespace Utils {
  /**
   * Calculate cosine similarity between two vectors
   */
  export function cosineSimilarity(a: number[], b: number[]): number;

  /**
   * Calculate euclidean distance between two vectors
   */
  export function euclideanDistance(a: number[], b: number[]): number;

  /**
   * Normalize a vector
   */
  export function normalize(vector: number[]): number[];

  /**
   * Generate random vector for testing
   */
  export function randomVector(dimension: number): number[];
}

/**
 * Default exports
 */
export { VectorIndex as default };
