#!/usr/bin/env node

/**
 * RuVector PostgreSQL CLI
 * Supabase-style command-line interface for managing RuVector PostgreSQL extension
 *
 * Usage:
 *   npx @ruvector/postgres init
 *   npx @ruvector/postgres start
 *   npx @ruvector/postgres db migrate
 */

const path = require('path');
const fs = require('fs');

// Check if we need to run the TypeScript version (development) or compiled version
const distPath = path.join(__dirname, '..', 'dist', 'cli.js');
const srcPath = path.join(__dirname, '..', 'src', 'cli.ts');

if (fs.existsSync(distPath)) {
  // Production: use compiled JavaScript
  require(distPath);
} else if (fs.existsSync(srcPath)) {
  // Development: use ts-node if available
  try {
    require('ts-node/register');
    require(srcPath);
  } catch (e) {
    console.error('Error: CLI not built. Please run: npm run build');
    console.error('Or install ts-node for development: npm install -D ts-node');
    process.exit(1);
  }
} else {
  console.error('Error: CLI source files not found.');
  console.error('Please ensure the package is installed correctly.');
  process.exit(1);
}
