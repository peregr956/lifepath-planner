/**
 * Health check endpoint
 * 
 * Returns API status and service information.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'lifepath-api',
    version: '2.0.0',
    runtime: 'vercel',
  });
}


