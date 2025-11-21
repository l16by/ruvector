export interface VectorEntry {
  id?: string;
  vector: Float32Array | number[];
}

export interface SearchQuery {
  vector: Float32Array | number[];
  k: number;
  efSearch?: number;
}

export interface SearchResult {
  id: string;
  score: number;
}

export class VectorDB {
  static withDimensions(dimensions: number): VectorDB;
  insert(entry: VectorEntry): Promise<string>;
  insertBatch(entries: VectorEntry[]): Promise<string[]>;
  search(query: SearchQuery): Promise<SearchResult[]>;
  delete(id: string): Promise<boolean>;
  get(id: string): Promise<VectorEntry | null>;
  len(): Promise<number>;
  isEmpty(): Promise<boolean>;
}
