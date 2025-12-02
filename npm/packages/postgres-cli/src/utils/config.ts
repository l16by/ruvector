/**
 * Configuration management for RuVector PostgreSQL CLI
 */

import Conf from 'conf';
import path from 'path';
import fs from 'fs-extra';
import yaml from 'yaml';

export interface RuvectorConfig {
  // Project settings
  projectId?: string;
  projectName?: string;

  // PostgreSQL settings
  postgres: {
    version: number;
    host: string;
    port: number;
    database: string;
    user: string;
    password?: string;
  };

  // Extension settings
  extension: {
    version: string;
    simdMode: 'auto' | 'avx512' | 'avx2' | 'neon' | 'scalar';
    hnswEfConstruction: number;
    hnswM: number;
    ivfflatLists: number;
  };

  // Docker settings (for local development)
  docker: {
    enabled: boolean;
    containerName: string;
    image: string;
    dataVolume: string;
  };

  // Development settings
  dev: {
    autoReload: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
}

export const defaultConfig: RuvectorConfig = {
  postgres: {
    version: 16,
    host: 'localhost',
    port: 5432,
    database: 'ruvector',
    user: 'postgres',
  },
  extension: {
    version: '0.1.0',
    simdMode: 'auto',
    hnswEfConstruction: 64,
    hnswM: 16,
    ivfflatLists: 100,
  },
  docker: {
    enabled: true,
    containerName: 'ruvector-postgres',
    image: 'ruvector/postgres:latest',
    dataVolume: 'ruvector_data',
  },
  dev: {
    autoReload: true,
    logLevel: 'info',
  },
};

// Global config store
const globalStore = new Conf<Partial<RuvectorConfig>>({
  projectName: 'ruvector-postgres',
  projectVersion: '0.1.0',
});

// Project config file name
const PROJECT_CONFIG_FILE = 'ruvector.yaml';

/**
 * Get project root directory (where ruvector.yaml exists)
 */
export function findProjectRoot(): string | null {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, PROJECT_CONFIG_FILE))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Check if we're in a RuVector project
 */
export function isInProject(): boolean {
  return findProjectRoot() !== null;
}

/**
 * Get project config path
 */
export function getProjectConfigPath(): string {
  const projectRoot = findProjectRoot() || process.cwd();
  return path.join(projectRoot, PROJECT_CONFIG_FILE);
}

/**
 * Load project configuration
 */
export function loadProjectConfig(): RuvectorConfig {
  const configPath = getProjectConfigPath();

  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const parsed = yaml.parse(content);
      return { ...defaultConfig, ...parsed };
    } catch (e) {
      console.warn(`Warning: Failed to parse ${configPath}, using defaults`);
    }
  }

  return defaultConfig;
}

/**
 * Save project configuration
 */
export function saveProjectConfig(config: Partial<RuvectorConfig>): void {
  const configPath = getProjectConfigPath();
  const merged = { ...loadProjectConfig(), ...config };
  const content = yaml.stringify(merged);
  fs.writeFileSync(configPath, content, 'utf8');
}

/**
 * Get global config value
 */
export function getGlobalConfig<K extends keyof RuvectorConfig>(
  key: K
): RuvectorConfig[K] | undefined {
  return globalStore.get(key) as RuvectorConfig[K] | undefined;
}

/**
 * Set global config value
 */
export function setGlobalConfig<K extends keyof RuvectorConfig>(
  key: K,
  value: RuvectorConfig[K]
): void {
  globalStore.set(key, value);
}

/**
 * Get effective config (project overrides global)
 */
export function getConfig(): RuvectorConfig {
  const projectConfig = loadProjectConfig();
  const globalConfig = globalStore.store;
  return { ...defaultConfig, ...globalConfig, ...projectConfig };
}

/**
 * Generate config file content
 */
export function generateConfigContent(config: Partial<RuvectorConfig>): string {
  const fullConfig = { ...defaultConfig, ...config };

  return `# RuVector PostgreSQL Configuration
# Documentation: https://github.com/ruvnet/ruvector

# Project identification
projectName: ${fullConfig.projectName || 'my-ruvector-project'}

# PostgreSQL Configuration
postgres:
  version: ${fullConfig.postgres.version}
  host: ${fullConfig.postgres.host}
  port: ${fullConfig.postgres.port}
  database: ${fullConfig.postgres.database}
  user: ${fullConfig.postgres.user}
  # password: \${POSTGRES_PASSWORD}  # Use environment variable

# Extension Configuration
extension:
  version: "${fullConfig.extension.version}"
  simdMode: ${fullConfig.extension.simdMode}  # auto, avx512, avx2, neon, scalar

  # HNSW Index Defaults
  hnswEfConstruction: ${fullConfig.extension.hnswEfConstruction}
  hnswM: ${fullConfig.extension.hnswM}

  # IVFFlat Index Defaults
  ivfflatLists: ${fullConfig.extension.ivfflatLists}

# Docker Configuration (for local development)
docker:
  enabled: ${fullConfig.docker.enabled}
  containerName: ${fullConfig.docker.containerName}
  image: ${fullConfig.docker.image}
  dataVolume: ${fullConfig.docker.dataVolume}

# Development Settings
dev:
  autoReload: ${fullConfig.dev.autoReload}
  logLevel: ${fullConfig.dev.logLevel}
`;
}
