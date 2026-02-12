import { NextResponse } from 'next/server'

const LYZR_API_KEY = process.env.LYZR_API_KEY || ''

// GET - Returns the Lyzr API key for client-side WebSocket connections
// Used by activity stream (manager-subagent pattern) to connect to
// wss://metrics.studio.lyzr.ai/ws/{session_id}?x-api-key={key}
export async function GET() {
  if (!LYZR_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'LYZR_API_KEY not configured on server' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    apiKey: LYZR_API_KEY,
  })
}
