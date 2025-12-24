#!/usr/bin/env npx ts-node
/**
 * Vercel AI Gateway Configuration Script
 * 
 * This script configures Vercel AI Gateway for the LifePath Planner project
 * by setting the OPENAI_API_BASE environment variable via the Vercel REST API.
 * 
 * Usage:
 *   npx ts-node scripts/setup-vercel-ai-gateway.ts --token=<VERCEL_TOKEN> --project=<PROJECT_ID>
 * 
 * Or with environment variables:
 *   VERCEL_TOKEN=xxx VERCEL_PROJECT_ID=xxx npx ts-node scripts/setup-vercel-ai-gateway.ts
 * 
 * Options:
 *   --token       Vercel API token (or VERCEL_TOKEN env var)
 *   --project     Vercel project ID (or VERCEL_PROJECT_ID env var)
 *   --gateway-url AI Gateway URL (default: Vercel AI Gateway)
 *   --dry-run     Show what would be done without making changes
 */

interface VercelEnvVar {
  key: string;
  value: string;
  type: 'encrypted' | 'plain' | 'secret' | 'sensitive';
  target: ('production' | 'preview' | 'development')[];
}

interface VercelProject {
  id: string;
  name: string;
  framework: string | null;
}

interface VercelEnvVarResponse {
  created: VercelEnvVar[];
  updated?: VercelEnvVar[];
  failed?: { key: string; error: string }[];
}

// Vercel AI Gateway URL
const VERCEL_AI_GATEWAY_URL = 'https://gateway.ai.vercel.sh/v1';

// Parse command line arguments
function parseArgs(): { token: string; projectId: string; gatewayUrl: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let token = process.env.VERCEL_TOKEN || '';
  let projectId = process.env.VERCEL_PROJECT_ID || '';
  let gatewayUrl = VERCEL_AI_GATEWAY_URL;
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith('--token=')) {
      token = arg.split('=')[1];
    } else if (arg.startsWith('--project=')) {
      projectId = arg.split('=')[1];
    } else if (arg.startsWith('--gateway-url=')) {
      gatewayUrl = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Vercel AI Gateway Configuration Script

Usage:
  npx ts-node scripts/setup-vercel-ai-gateway.ts --token=<VERCEL_TOKEN> --project=<PROJECT_ID>

Options:
  --token=<token>         Vercel API token (or set VERCEL_TOKEN env var)
  --project=<project_id>  Vercel project ID (or set VERCEL_PROJECT_ID env var)
  --gateway-url=<url>     AI Gateway URL (default: ${VERCEL_AI_GATEWAY_URL})
  --dry-run               Show what would be done without making changes
  --help, -h              Show this help message
`);
      process.exit(0);
    }
  }

  if (!token) {
    console.error('Error: Vercel API token is required. Use --token=<token> or set VERCEL_TOKEN environment variable.');
    process.exit(1);
  }

  if (!projectId) {
    console.error('Error: Vercel project ID is required. Use --project=<project_id> or set VERCEL_PROJECT_ID environment variable.');
    process.exit(1);
  }

  return { token, projectId, gatewayUrl, dryRun };
}

// Verify project exists
async function verifyProject(token: string, projectId: string): Promise<VercelProject> {
  console.log(`\n🔍 Verifying project ${projectId}...`);
  
  const response = await fetch(`https://api.vercel.com/v9/projects/${projectId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to verify project: ${response.status} ${response.statusText}\n${error}`);
  }

  const project = await response.json() as VercelProject;
  console.log(`✅ Found project: ${project.name} (${project.id})`);
  return project;
}

// Get existing environment variables
async function getEnvVars(token: string, projectId: string): Promise<VercelEnvVar[]> {
  console.log('\n📋 Fetching existing environment variables...');
  
  const response = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch env vars: ${response.status} ${response.statusText}\n${error}`);
  }

  const data = await response.json() as { envs: VercelEnvVar[] };
  return data.envs || [];
}

// Create or update environment variable
async function upsertEnvVar(
  token: string,
  projectId: string,
  envVar: VercelEnvVar,
  existingEnvVars: VercelEnvVar[],
  dryRun: boolean
): Promise<void> {
  const existing = existingEnvVars.find(e => e.key === envVar.key);
  
  if (dryRun) {
    if (existing) {
      console.log(`  [DRY RUN] Would update ${envVar.key}`);
    } else {
      console.log(`  [DRY RUN] Would create ${envVar.key}`);
    }
    return;
  }

  if (existing) {
    // Update existing variable - need to delete and recreate
    console.log(`  Updating ${envVar.key}...`);
    
    // First, delete the existing variable
    const deleteResponse = await fetch(
      `https://api.vercel.com/v10/projects/${projectId}/env/${envVar.key}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      const error = await deleteResponse.text();
      throw new Error(`Failed to delete ${envVar.key}: ${deleteResponse.status}\n${error}`);
    }
  } else {
    console.log(`  Creating ${envVar.key}...`);
  }

  // Create the variable
  const createResponse = await fetch(
    `https://api.vercel.com/v10/projects/${projectId}/env`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envVar),
    }
  );

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Failed to create ${envVar.key}: ${createResponse.status}\n${error}`);
  }

  console.log(`  ✅ ${envVar.key} configured`);
}

// Main function
async function main() {
  console.log('🚀 Vercel AI Gateway Configuration');
  console.log('===================================');

  const { token, projectId, gatewayUrl, dryRun } = parseArgs();

  if (dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made\n');
  }

  try {
    // Verify project exists
    const project = await verifyProject(token, projectId);

    // Get existing env vars
    const existingEnvVars = await getEnvVars(token, projectId);
    
    console.log(`\n📊 Found ${existingEnvVars.length} existing environment variables`);
    
    // Check for existing OpenAI config
    const existingApiBase = existingEnvVars.find(e => e.key === 'OPENAI_API_BASE');
    const existingApiKey = existingEnvVars.find(e => e.key === 'OPENAI_API_KEY');
    
    if (existingApiBase) {
      console.log(`  Current OPENAI_API_BASE: [configured]`);
    }
    if (existingApiKey) {
      console.log(`  Current OPENAI_API_KEY: [configured]`);
    }

    // Environment variables to set
    const envVarsToSet: VercelEnvVar[] = [
      {
        key: 'OPENAI_API_BASE',
        value: gatewayUrl,
        type: 'plain',
        target: ['production', 'preview', 'development'],
      },
      {
        key: 'VERCEL_AI_GATEWAY_ENABLED',
        value: 'true',
        type: 'plain',
        target: ['production', 'preview', 'development'],
      },
    ];

    // Optionally set OPENAI_MODEL if not already set
    const existingModel = existingEnvVars.find(e => e.key === 'OPENAI_MODEL');
    if (!existingModel) {
      envVarsToSet.push({
        key: 'OPENAI_MODEL',
        value: 'gpt-4o-mini',
        type: 'plain',
        target: ['production', 'preview', 'development'],
      });
    }

    console.log('\n🔧 Configuring AI Gateway environment variables...');
    console.log(`  Gateway URL: ${gatewayUrl}`);

    for (const envVar of envVarsToSet) {
      await upsertEnvVar(token, projectId, envVar, existingEnvVars, dryRun);
    }

    console.log('\n✅ AI Gateway configuration complete!');
    console.log('\n📝 Next steps:');
    console.log('  1. Make sure OPENAI_API_KEY is set in your Vercel project');
    console.log('  2. Redeploy your application to apply the changes');
    console.log('  3. Visit /api/diagnostics/env to verify configuration');
    
    if (!existingApiKey) {
      console.log('\n⚠️  WARNING: OPENAI_API_KEY is not configured!');
      console.log('  Set it in Vercel Dashboard → Project Settings → Environment Variables');
    }

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();

