/**
 * Diagnostics endpoint
 * 
 * Shows environment variable configuration for debugging.
 * Sensitive values (API keys) are redacted.
 */

import { NextResponse } from 'next/server';
import { getProviderMetadata } from '@/lib/ai';

interface VarStatus {
  key: string;
  is_set: boolean;
  value?: string;
}

function checkVar(key: string, redact: boolean = false): VarStatus {
  const value = process.env[key];
  const isSet = value !== undefined && value.trim() !== '';
  
  const result: VarStatus = {
    key,
    is_set: isSet,
  };

  if (isSet && value) {
    if (redact) {
      // Redact sensitive values
      if (value.length > 11) {
        result.value = `${value.substring(0, 7)}...${value.substring(value.length - 4)}`;
      } else {
        result.value = '***REDACTED***';
      }
    } else {
      result.value = value;
    }
  }

  return result;
}

export async function GET() {
  const requiredVars: [string, boolean][] = [
    ['OPENAI_API_KEY', true],
    ['OPENAI_MODEL', false],
    ['OPENAI_API_BASE', false],
    ['POSTGRES_URL', true],
  ];

  const optionalVars: [string, boolean][] = [
    ['DATABASE_URL', true], // Check DATABASE_URL as well (used by Prisma integrations)
    ['VERCEL_ENV', false],
    ['VERCEL_URL', false],
    ['VERCEL_AI_GATEWAY_ENABLED', false], // AI Gateway flag
    ['NORMALIZATION_PROVIDER', false], // Budget normalization provider
  ];

  const requiredStatus = Object.fromEntries(
    requiredVars.map(([key, redact]) => [key, checkVar(key, redact)])
  );

  const optionalStatus = Object.fromEntries(
    optionalVars.map(([key, redact]) => [key, checkVar(key, redact)])
  );

  const issues: string[] = [];
  
  if (!requiredStatus['OPENAI_API_KEY'].is_set) {
    issues.push('OPENAI_API_KEY is not set - AI features will be disabled');
  }
  if (!requiredStatus['OPENAI_MODEL'].is_set) {
    issues.push('OPENAI_MODEL is not set - will default to gpt-4o');
  }
  
  // Check for database connection - support both POSTGRES_URL and DATABASE_URL
  const hasPostgresUrl = requiredStatus['POSTGRES_URL'].is_set;
  const hasDatabaseUrl = optionalStatus['DATABASE_URL'].is_set;
  
  if (!hasPostgresUrl && !hasDatabaseUrl) {
    issues.push('Neither POSTGRES_URL nor DATABASE_URL is set - using in-memory storage');
  } else if (hasDatabaseUrl && !hasPostgresUrl) {
    issues.push('DATABASE_URL is set but POSTGRES_URL is not - app will use DATABASE_URL');
  }

  return NextResponse.json({
    status: issues.length === 0 ? 'ok' : 'issues_found',
    issues,
    required_variables: requiredStatus,
    optional_variables: optionalStatus,
    provider_metadata: getProviderMetadata(),
    runtime: 'vercel',
    architecture: 'serverless',
  });
}

