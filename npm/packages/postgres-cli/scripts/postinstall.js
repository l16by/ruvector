#!/usr/bin/env node

/**
 * RuVector PostgreSQL CLI - Post-install script
 *
 * This script runs after npm install to:
 * 1. Display welcome message
 * 2. Check for system requirements
 * 3. Provide quick start guidance
 */

const os = require('os');
const { execSync } = require('child_process');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
};

function log(msg) {
  console.log(msg);
}

function logColor(color, msg) {
  console.log(`${color}${msg}${colors.reset}`);
}

function commandExists(cmd) {
  try {
    execSync(os.platform() === 'win32' ? `where ${cmd}` : `which ${cmd}`, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

function main() {
  log('');
  logColor(colors.cyan, '╔═══════════════════════════════════════════════════════════════╗');
  logColor(colors.cyan, '║  RuVector PostgreSQL - Vector Similarity Search Extension     ║');
  logColor(colors.cyan, '╚═══════════════════════════════════════════════════════════════╝');
  log('');

  // Check requirements
  const checks = [];

  // Docker check
  const hasDocker = commandExists('docker');
  checks.push({
    name: 'Docker',
    status: hasDocker,
    message: hasDocker
      ? 'Docker available for local development'
      : 'Install Docker for local development: https://docs.docker.com/get-docker/',
  });

  // PostgreSQL check
  const hasPostgres = commandExists('psql') || commandExists('pg_config');
  checks.push({
    name: 'PostgreSQL',
    status: hasPostgres,
    message: hasPostgres
      ? 'PostgreSQL client available'
      : 'PostgreSQL not found (optional for Docker-based development)',
  });

  // Rust check (for building from source)
  const hasRust = commandExists('rustc');
  checks.push({
    name: 'Rust',
    status: hasRust,
    message: hasRust
      ? 'Rust available for building from source'
      : 'Rust not installed (needed to build from source): https://rustup.rs',
  });

  // Display checks
  logColor(colors.bold, 'System Requirements:');
  log('');
  for (const check of checks) {
    const icon = check.status ? colors.green + '✓' : colors.yellow + '○';
    const color = check.status ? colors.gray : colors.yellow;
    log(`  ${icon}${colors.reset} ${check.name}: ${color}${check.message}${colors.reset}`);
  }
  log('');

  // Quick start
  logColor(colors.bold, 'Quick Start:');
  log('');
  log(`  ${colors.gray}# Initialize a new project${colors.reset}`);
  log(`  ${colors.cyan}npx @ruvector/postgres init${colors.reset}`);
  log('');
  log(`  ${colors.gray}# Start local development environment${colors.reset}`);
  log(`  ${colors.cyan}npx @ruvector/postgres start${colors.reset}`);
  log('');
  log(`  ${colors.gray}# Or install to existing PostgreSQL${colors.reset}`);
  log(`  ${colors.cyan}npx @ruvector/postgres install --pg-version 16${colors.reset}`);
  log('');

  // Help
  logColor(colors.bold, 'Documentation:');
  log(`  ${colors.gray}https://github.com/ruvnet/ruvector${colors.reset}`);
  log('');
}

// Run post-install
try {
  main();
} catch (e) {
  // Ignore errors in post-install to not break npm install
}
