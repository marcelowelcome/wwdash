import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  FIELD_MAP, STATUS_MAP,
  parseDate, coerceFieldValue,
  resolveDestino, resolveConvidados, resolveOrcamento,
} from '@/lib/ac-field-map'

const AC_API_URL = process.env.AC_API_URL
const AC_API_KEY = process.env.AC_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const SYNC_WINDOW_MS = 3 * 60 * 60 * 1000

const ELOPEMENT_PIPELINES = new Set(['Elopment Wedding'])

const PIPELINE_GROUP: Record<string, string> = {
  "SDR Weddings": "1", "Closer Weddings": "3", "Planejamento Weddings": "4",
  "Convidados": "5", "Consultoras TRIPS": "6", "SDR - Trips": "8",
  "Convidados - Marcella": "9", "Convidados - Michelly": "10",
  "Convidados - Mariana Rosales": "11", "Elopment Wedding": "12",
  "Presentes Weddings": "14", "WT - Weex Pass": "16", "WW - Internacional": "17",
  "WW - Gestão Casamento ": "18", "WW - Gestão Convidados": "19",
  "Extras Viagem": "20", "WW - Atendimento ao Convidado": "21",
  "Produção": "22", "Controle de Qualidade": "23", "Concierge (+50k)": "24",
  "Coordenação Pós Venda (-50k)": "25", "WT - Expedição NYC - FerStall": "30",
  "Outros Desqualificados | Wedding": "31", "WTN - Desqualificados": "34",
  "WelConnect": "37",
}

async function fetchWithRetry(url: string, headers: Record<string, string>, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const resp = await fetch(url, { headers })
    if (resp.status === 429) {
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000))
      continue
    }
    return resp
  }
  return fetch(url, { headers })
}

async function loadMap(endpoint: string, key: string, headers: Record<string, string>): Promise<Record<string, string>> {
  const resp = await fetchWithRetry(`${AC_API_URL}/api/3/${endpoint}?limit=100`, headers)
  if (!resp.ok) return {}
  const data = await resp.json()
  const map: Record<string, string> = {}
  for (const item of data[key] || []) map[item.id] = item.title
  return map
}

function buildRecord(
  deal: Record<string, unknown>,
  fields: Array<Record<string, unknown>>,
  pipelineMap: Record<string, string>,
  stageMap: Record<string, string>,
): Record<string, unknown> {
  const pipelineTitle = pipelineMap[String(deal.group)] || String(deal.group)
  const stageTitle = stageMap[String(deal.stage)] || String(deal.stage)
  const statusCode = String(deal.status || '')

  const record: Record<string, unknown> = {
    id: parseInt(String(deal.id)),
    title: deal.title,
    status: STATUS_MAP[statusCode] || statusCode,
    pipeline: pipelineTitle,
    stage: stageTitle,
    group_id: deal.group,
    stage_id: deal.stage,
    owner_id: deal.owner,
    is_elopement: ELOPEMENT_PIPELINES.has(pipelineTitle),
    created_at: parseDate(String(deal.cdate || '')),
    updated_at: parseDate(String(deal.mdate || '')),
    raw_data: deal,
  }

  const gid = PIPELINE_GROUP[pipelineTitle]
  if (gid) record.group_id = gid

  const rawById: Record<string, string> = {}
  for (const field of fields) {
    const fieldId = String(field.custom_field_id || field.customFieldId || '')
    const val = String(
      field.custom_field_text_value || field.custom_field_text_blob ||
      field.custom_field_date_value || field.custom_field_number_value ||
      field.custom_field_currency_value || field.fieldValue || ''
    ).trim()

    if (!val) continue
    rawById[fieldId] = val

    const col = FIELD_MAP[fieldId]
    if (!col) continue

    const coerced = coerceFieldValue(col, val)
    if (coerced !== null && coerced !== undefined) record[col] = coerced
  }

  if (!record.destino) {
    const d = resolveDestino(rawById)
    if (d) record.destino = d
  }
  if (!record.num_convidados) {
    const n = resolveConvidados(rawById)
    if (n !== undefined) record.num_convidados = n
  }
  if (!record.orcamento) {
    const o = resolveOrcamento(rawById)
    if (o !== undefined) record.orcamento = o
  }

  return record
}

export async function POST() {
  if (!AC_API_URL || !AC_API_KEY) {
    return NextResponse.json({ error: 'AC_API_URL or AC_API_KEY not configured' }, { status: 500 })
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: 'Supabase service role not configured' }, { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const acHeaders = { 'Api-Token': AC_API_KEY }

  try {
    const [pipelineMap, stageMap] = await Promise.all([
      loadMap('dealGroups', 'dealGroups', acHeaders),
      loadMap('dealStages', 'dealStages', acHeaders),
    ])

    const since = new Date(Date.now() - SYNC_WINDOW_MS)
    const sinceISO = since.toISOString().replace('T', ' ').slice(0, 19)

    let offset = 0
    const limit = 100
    let synced = 0
    let pages = 0
    const errors: string[] = []

    while (true) {
      pages++
      const url = `${AC_API_URL}/api/3/deals?limit=${limit}&offset=${offset}` +
        `&filters[updated_timestamp][gte]=${encodeURIComponent(sinceISO)}` +
        `&include=dealCustomFieldData&orders[mdate]=DESC`

      const resp = await fetchWithRetry(url, acHeaders)
      if (!resp.ok) {
        const text = await resp.text()
        errors.push(`AC API error page ${pages}: ${resp.status} ${text.slice(0, 200)}`)
        break
      }

      const data = await resp.json()
      const deals = (data.deals || []) as Array<Record<string, unknown>>
      if (deals.length === 0) break

      const allFields = (data.dealCustomFieldData || []) as Array<Record<string, unknown>>

      const records: Record<string, unknown>[] = []
      for (const deal of deals) {
        const dealId = String(deal.id)
        const dealFields = allFields.filter((f) => String(f.deal_id || f.deal) === dealId)
        records.push(buildRecord(deal, dealFields, pipelineMap, stageMap))
      }

      const { error } = await supabase.from('deals').upsert(records, { onConflict: 'id' })
      if (error) {
        errors.push(`Supabase upsert error page ${pages}: ${error.message}`)
      } else {
        synced += records.length
      }

      if (deals.length < limit) break
      offset += limit
      await new Promise(r => setTimeout(r, 200))
    }

    return NextResponse.json({
      success: true,
      syncedAt: new Date().toISOString(),
      window: `${sinceISO} → now`,
      synced,
      pages,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json({ error: 'Sync failed', details: String(error) }, { status: 500 })
  }
}
