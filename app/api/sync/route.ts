import { NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function POST() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 500 },
    )
  }

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/functions/v1/sync-deals`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      },
    )

    if (!resp.ok) {
      const text = await resp.text()
      return NextResponse.json(
        { error: `Edge Function error: ${resp.status}`, details: text },
        { status: resp.status },
      )
    }

    const data = await resp.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json(
      { error: 'Sync failed', details: String(error) },
      { status: 500 },
    )
  }
}
