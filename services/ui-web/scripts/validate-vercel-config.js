#!/usr/bin/env node
/**
 * Vercel Configuration Validation Script
 * 
 * Validates the vercel.json configuration file to ensure it follows
 * best practices and contains required fields.
 * 
 * Usage: node scripts/validate-vercel-config.js
 * Exit codes:
 *   0 - Validation passed
 *   1 - Validation failed
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectDir = dirname(__dirname);

const VERCEL_CONFIG_PATH = join(projectDir, 'vercel.json');

// Required security headers
const REQUIRED_HEADERS = [
  { key: 'X-Content-Type-Options', expectedValue: 'nosniff' },
  { key: 'X-Frame-Options', expectedValues: ['DENY', 'SAMEORIGIN'] },
  { key: 'X-XSS-Protection', expectedValue: '1; mode=block' },
];

// Recommended headers
const RECOMMENDED_HEADERS = [
  { key: 'Referrer-Policy' },
  { key: 'Strict-Transport-Security' },
  { key: 'Content-Security-Policy' },
];

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

function log(message, level = 'info') {
  const prefix = {
    info: 'ℹ️ ',
    success: '✅ ',
    warning: '⚠️ ',
    error: '❌ ',
  }[level] || '';
  
  console.log(`${prefix}${message}`);
}

function loadConfig() {
  if (!existsSync(VERCEL_CONFIG_PATH)) {
    throw new ValidationError(`vercel.json not found at ${VERCEL_CONFIG_PATH}`);
  }
  
  try {
    const content = readFileSync(VERCEL_CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ValidationError(`Invalid JSON in vercel.json: ${error.message}`);
    }
    throw error;
  }
}

function validateSchema(config) {
  const errors = [];
  
  // Check for $schema field
  if (!config.$schema) {
    log('Missing $schema field (recommended for IDE support)', 'warning');
  }
  
  // Validate framework
  if (!config.framework) {
    log('No framework specified (Vercel will auto-detect)', 'warning');
  } else if (config.framework !== 'nextjs') {
    errors.push(`Expected framework "nextjs", got "${config.framework}"`);
  }
  
  // Validate build command
  if (config.buildCommand && typeof config.buildCommand !== 'string') {
    errors.push('buildCommand must be a string');
  }
  
  // Validate install command
  if (config.installCommand && typeof config.installCommand !== 'string') {
    errors.push('installCommand must be a string');
  }
  
  // Validate output directory
  if (config.outputDirectory && config.outputDirectory !== '.next') {
    log(`Non-standard output directory: ${config.outputDirectory}`, 'warning');
  }
  
  return errors;
}

function validateHeaders(config) {
  const errors = [];
  const warnings = [];
  
  if (!config.headers || !Array.isArray(config.headers)) {
    errors.push('No headers configuration found');
    return { errors, warnings };
  }
  
  // Find headers that apply to all routes
  const globalHeaders = config.headers.find(h => 
    h.source === '(.*)' || 
    h.source === '/(.*)'  ||
    h.source === '/**'
  );
  
  if (!globalHeaders) {
    warnings.push('No global headers configuration found (recommended to apply security headers to all routes)');
    return { errors, warnings };
  }
  
  const configuredHeaders = new Map(
    globalHeaders.headers.map(h => [h.key, h.value])
  );
  
  // Check required headers
  for (const required of REQUIRED_HEADERS) {
    if (!configuredHeaders.has(required.key)) {
      errors.push(`Missing required security header: ${required.key}`);
    } else {
      const value = configuredHeaders.get(required.key);
      
      if (required.expectedValue && value !== required.expectedValue) {
        warnings.push(
          `${required.key} is set to "${value}", expected "${required.expectedValue}"`
        );
      }
      
      if (required.expectedValues && !required.expectedValues.includes(value)) {
        warnings.push(
          `${required.key} is set to "${value}", expected one of: ${required.expectedValues.join(', ')}`
        );
      }
    }
  }
  
  // Check recommended headers
  for (const recommended of RECOMMENDED_HEADERS) {
    if (!configuredHeaders.has(recommended.key)) {
      warnings.push(`Missing recommended header: ${recommended.key}`);
    }
  }
  
  return { errors, warnings };
}

function validateRoutes(config) {
  const errors = [];
  const warnings = [];
  
  if (config.rewrites) {
    if (!Array.isArray(config.rewrites)) {
      errors.push('rewrites must be an array');
    }
  }
  
  if (config.redirects) {
    if (!Array.isArray(config.redirects)) {
      errors.push('redirects must be an array');
    }
  }
  
  return { errors, warnings };
}

function validateEnvironmentVariables(config) {
  const warnings = [];
  
  // Check if there are any environment configurations
  if (config.env) {
    warnings.push(
      'Environment variables in vercel.json are visible in the repository. ' +
      'Consider using Vercel dashboard for sensitive values.'
    );
  }
  
  return { errors: [], warnings };
}

async function main() {
  console.log('============================================');
  console.log('  Vercel Configuration Validation');
  console.log('============================================\n');
  
  let allErrors = [];
  let allWarnings = [];
  
  try {
    const config = loadConfig();
    log('Loaded vercel.json successfully', 'success');
    
    // Run validations
    const schemaErrors = validateSchema(config);
    allErrors.push(...schemaErrors);
    
    const headerResults = validateHeaders(config);
    allErrors.push(...headerResults.errors);
    allWarnings.push(...headerResults.warnings);
    
    const routeResults = validateRoutes(config);
    allErrors.push(...routeResults.errors);
    allWarnings.push(...routeResults.warnings);
    
    const envResults = validateEnvironmentVariables(config);
    allErrors.push(...envResults.errors);
    allWarnings.push(...envResults.warnings);
    
  } catch (error) {
    if (error instanceof ValidationError) {
      allErrors.push(error.message);
    } else {
      throw error;
    }
  }
  
  // Report results
  console.log('\n--- Results ---\n');
  
  if (allWarnings.length > 0) {
    console.log('Warnings:');
    allWarnings.forEach(w => log(w, 'warning'));
    console.log('');
  }
  
  if (allErrors.length > 0) {
    console.log('Errors:');
    allErrors.forEach(e => log(e, 'error'));
    console.log('\n============================================');
    console.log('  ❌ Validation Failed');
    console.log('============================================\n');
    process.exit(1);
  }
  
  console.log('============================================');
  console.log('  ✅ Validation Passed');
  console.log('============================================\n');
  
  if (allWarnings.length > 0) {
    console.log(`  ${allWarnings.length} warning(s) - consider addressing these for better security`);
  }
  
  process.exit(0);
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

