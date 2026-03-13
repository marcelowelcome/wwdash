import { NextResponse } from 'next/server'

const DASH_WEBHOOK_URL = process.env.DASH_WEBHOOK_URL
const CRON_SECRET = process.env.CRON_SECRET

export async function POST() {
  if (!DASH_WEBHOOK_URL || !CRON_SECRET) {
    return NextResponse.json(
      { error: 'DASH_WEBHOOK_URL or CRON_SECRET not configured' },
      { status: 500 },
    )
  }

  try {
    const resp = await fetch(`${DASH_WEBHOOK_URL}/api/deals/sync`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    })

    const data = await resp.json()

    if (!resp.ok) {
      return NextResponse.json(data, { status: resp.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Sync proxy error:', error)
    return NextResponse.json(
      { error: 'Failed to reach sync endpoint' },
      { status: 502 },
    )
  }
}
