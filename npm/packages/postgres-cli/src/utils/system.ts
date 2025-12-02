/**
 * System detection utilities for RuVector PostgreSQL CLI
 */

import { execSync, exec } from 'child_process';
import os from 'os';
import fs from 'fs';

export interface SystemInfo {
  os: 'linux' | 'darwin' | 'win32' | 'unknown';
  arch: 'x64' | 'arm64' | 'unknown';
  distro?: string;
  distroVersion?: string;
  simd: {
    avx512: boolean;
    avx2: boolean;
    neon: boolean;
  };
  docker: boolean;
  postgres: PostgresInfo | null;
  rust: RustInfo | null;
}

export interface PostgresInfo {
  version: number;
  fullVersion: string;
  binDir: string;
  libDir: string;
  shareDir: string;
  pgConfig: string;
}

export interface RustInfo {
  version: string;
  pgrxVersion?: string;
}

/**
 * Execute command and return output
 */
function execCommand(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

/**
 * Check if command exists
 */
export function commandExists(cmd: string): boolean {
  try {
    execSync(os.platform() === 'win32' ? `where ${cmd}` : `which ${cmd}`, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect operating system
 */
export function detectOS(): 'linux' | 'darwin' | 'win32' | 'unknown' {
  const platform = os.platform();
  if (platform === 'linux' || platform === 'darwin' || platform === 'win32') {
    return platform;
  }
  return 'unknown';
}

/**
 * Detect CPU architecture
 */
export function detectArch(): 'x64' | 'arm64' | 'unknown' {
  const arch = os.arch();
  if (arch === 'x64' || arch === 'arm64') {
    return arch;
  }
  return 'unknown';
}

/**
 * Detect Linux distribution
 */
export function detectDistro(): { name?: string; version?: string } {
  if (os.platform() !== 'linux') {
    return {};
  }

  try {
    if (fs.existsSync('/etc/os-release')) {
      const content = fs.readFileSync('/etc/os-release', 'utf8');
      const lines = content.split('\n');
      const info: Record<string, string> = {};

      for (const line of lines) {
        const [key, value] = line.split('=');
        if (key && value) {
          info[key] = value.replace(/"/g, '');
        }
      }

      return {
        name: info.ID,
        version: info.VERSION_ID,
      };
    }
  } catch {
    // Ignore
  }

  return {};
}

/**
 * Detect SIMD capabilities
 */
export function detectSimd(): { avx512: boolean; avx2: boolean; neon: boolean } {
  const arch = detectArch();
  const platform = detectOS();

  if (arch === 'arm64') {
    // ARM64 always has NEON
    return { avx512: false, avx2: false, neon: true };
  }

  if (arch === 'x64') {
    if (platform === 'linux') {
      const cpuInfo = execCommand('cat /proc/cpuinfo');
      if (cpuInfo) {
        return {
          avx512: cpuInfo.includes('avx512f'),
          avx2: cpuInfo.includes('avx2'),
          neon: false,
        };
      }
    } else if (platform === 'darwin') {
      const avx512 = execCommand('sysctl -n hw.optional.avx512f 2>/dev/null');
      const avx2 = execCommand('sysctl -n hw.optional.avx2_0 2>/dev/null');
      return {
        avx512: avx512 === '1',
        avx2: avx2 === '1',
        neon: false,
      };
    }
  }

  return { avx512: false, avx2: false, neon: false };
}

/**
 * Detect Docker installation
 */
export function detectDocker(): boolean {
  return commandExists('docker') && execCommand('docker info') !== null;
}

/**
 * Detect PostgreSQL installation
 */
export function detectPostgres(): PostgresInfo | null {
  // Try to find pg_config
  const pgConfigPaths = [
    'pg_config',
    '/usr/bin/pg_config',
    '/usr/local/bin/pg_config',
    '/usr/pgsql-17/bin/pg_config',
    '/usr/pgsql-16/bin/pg_config',
    '/usr/pgsql-15/bin/pg_config',
    '/usr/pgsql-14/bin/pg_config',
    '/usr/lib/postgresql/17/bin/pg_config',
    '/usr/lib/postgresql/16/bin/pg_config',
    '/usr/lib/postgresql/15/bin/pg_config',
    '/usr/lib/postgresql/14/bin/pg_config',
    '/opt/homebrew/opt/postgresql@17/bin/pg_config',
    '/opt/homebrew/opt/postgresql@16/bin/pg_config',
    '/opt/homebrew/opt/postgresql@15/bin/pg_config',
    '/opt/homebrew/opt/postgresql@14/bin/pg_config',
  ];

  for (const pgConfig of pgConfigPaths) {
    if (commandExists(pgConfig) || fs.existsSync(pgConfig)) {
      const fullVersion = execCommand(`${pgConfig} --version`);
      const binDir = execCommand(`${pgConfig} --bindir`);
      const libDir = execCommand(`${pgConfig} --pkglibdir`);
      const shareDir = execCommand(`${pgConfig} --sharedir`);

      if (fullVersion && binDir && libDir && shareDir) {
        const versionMatch = fullVersion.match(/\d+/);
        const version = versionMatch ? parseInt(versionMatch[0], 10) : 0;

        return {
          version,
          fullVersion,
          binDir,
          libDir,
          shareDir,
          pgConfig,
        };
      }
    }
  }

  return null;
}

/**
 * Detect Rust installation
 */
export function detectRust(): RustInfo | null {
  if (!commandExists('rustc')) {
    return null;
  }

  const version = execCommand('rustc --version');
  if (!version) {
    return null;
  }

  const versionMatch = version.match(/rustc\s+(\S+)/);
  const rustVersion = versionMatch ? versionMatch[1] : version;

  // Check for pgrx
  let pgrxVersion: string | undefined;
  const pgrxList = execCommand('cargo install --list 2>/dev/null | grep cargo-pgrx');
  if (pgrxList) {
    const pgrxMatch = pgrxList.match(/v?([\d.]+)/);
    pgrxVersion = pgrxMatch ? pgrxMatch[1] : undefined;
  }

  return {
    version: rustVersion,
    pgrxVersion,
  };
}

/**
 * Get complete system information
 */
export function getSystemInfo(): SystemInfo {
  const distro = detectDistro();

  return {
    os: detectOS(),
    arch: detectArch(),
    distro: distro.name,
    distroVersion: distro.version,
    simd: detectSimd(),
    docker: detectDocker(),
    postgres: detectPostgres(),
    rust: detectRust(),
  };
}

/**
 * Get recommended SIMD mode based on system
 */
export function getRecommendedSimdMode(): 'avx512' | 'avx2' | 'neon' | 'scalar' {
  const simd = detectSimd();

  if (simd.avx512) return 'avx512';
  if (simd.avx2) return 'avx2';
  if (simd.neon) return 'neon';
  return 'scalar';
}

/**
 * Format system info for display
 */
export function formatSystemInfo(info: SystemInfo): string {
  const lines: string[] = [];

  lines.push(`OS: ${info.os} (${info.arch})`);
  if (info.distro) {
    lines.push(`Distro: ${info.distro} ${info.distroVersion || ''}`);
  }

  const simdModes: string[] = [];
  if (info.simd.avx512) simdModes.push('AVX-512');
  if (info.simd.avx2) simdModes.push('AVX2');
  if (info.simd.neon) simdModes.push('NEON');
  lines.push(`SIMD: ${simdModes.length > 0 ? simdModes.join(', ') : 'None'}`);

  lines.push(`Docker: ${info.docker ? 'Available' : 'Not found'}`);

  if (info.postgres) {
    lines.push(`PostgreSQL: ${info.postgres.fullVersion}`);
    lines.push(`  pg_config: ${info.postgres.pgConfig}`);
  } else {
    lines.push('PostgreSQL: Not found');
  }

  if (info.rust) {
    lines.push(`Rust: ${info.rust.version}`);
    if (info.rust.pgrxVersion) {
      lines.push(`  cargo-pgrx: ${info.rust.pgrxVersion}`);
    }
  } else {
    lines.push('Rust: Not found');
  }

  return lines.join('\n');
}
