#!/usr/bin/env node
// Valida que Lead != MQL: simula o que o Dashboard faz.
// Roda com: node scripts/validate-sdr-funnel.mjs [days]
// Default: 30 dias.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carrega .env.local
const envText = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
const env = {};
for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2];
}

const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
);

const days = parseInt(process.argv[2] || "30", 10);
const end = new Date();
const start = new Date();
start.setDate(start.getDate() - days);

const GROUP_TO_PIPELINE = {
    "1": "SDR Weddings",
    "3": "Closer Weddings",
    "4": "Planejamento Weddings",
    "17": "WW - Internacional",
    "31": "Outros Desqualificados | Wedding",
};

const WW_PIPELINE_NAMES = new Set([
    "SDR Weddings", "Closer Weddings", "Planejamento Weddings",
    "WW - Internacional", "Outros Desqualificados | Wedding",
]);
const WW_MQL_PIPELINE_NAMES = new Set([
    "SDR Weddings", "Closer Weddings", "Planejamento Weddings",
]);

async function fetchGroup(groupId) {
    const pipelineName = GROUP_TO_PIPELINE[groupId];
    const filter = `group_id.eq.${groupId},pipeline.eq.${pipelineName}`;
    let all = [];
    let from = 0;
    const pageSize = 1000;
    for (let p = 0; p < 20; p++) {
        const { data, error } = await supabase
            .from("deals")
            .select("id, title, pipeline, group_id, created_at, data_reuniao_1, como_reuniao_1, data_qualificado, data_closer, is_elopement, status")
            .or(filter)
            .gte("created_at", start.toISOString())
            .lte("created_at", end.toISOString())
            .order("created_at", { ascending: false })
            .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
    }
    return all;
}

console.log(`Período: ${start.toISOString().slice(0,10)} → ${end.toISOString().slice(0,10)} (${days}d)\n`);

const groups = ["1", "3", "4", "17", "31"];
const results = await Promise.all(groups.map(fetchGroup));
for (let i = 0; i < groups.length; i++) {
    console.log(`  group ${groups[i].padStart(2)} (${GROUP_TO_PIPELINE[groups[i]]}): ${results[i].length} deals`);
}

// Dedup por id
const seen = new Set();
const all = [];
for (const arr of results) {
    for (const d of arr) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        all.push(d);
    }
}
console.log(`\n  TOTAL deduplicado: ${all.length} deals\n`);

// Filtros do motor SDR
const isLead = (d) => d.is_elopement !== true && WW_PIPELINE_NAMES.has(d.pipeline);
const isMql = (d) => isLead(d) && WW_MQL_PIPELINE_NAMES.has(d.pipeline);

const inRange = (s) => {
    if (!s) return false;
    const t = new Date(s).getTime();
    return t >= start.getTime() && t <= end.getTime();
};

// Modo Evento (default)
const lead = all.filter(d => isLead(d) && inRange(d.created_at));
const mql = all.filter(d => isMql(d) && inRange(d.created_at));
const agendamento = all.filter(d => isMql(d) && inRange(d.data_reuniao_1));
const realizada = agendamento.filter(d => d.como_reuniao_1 && d.como_reuniao_1 !== "" && d.como_reuniao_1 !== "Não teve reunião");
const qualificado = all.filter(d => isMql(d) && inRange(d.data_qualificado));
const closer = all.filter(d => isMql(d) && inRange(d.data_closer));

console.log(`FUNIL (modo Evento, último ${days}d):\n`);
console.log(`  Lead:               ${lead.length}`);
console.log(`  MQL:                ${mql.length}   (Δ Lead-MQL: ${lead.length - mql.length})`);
console.log(`  Agendamento:        ${agendamento.length}`);
console.log(`  Reunião realizada:  ${realizada.length}`);
console.log(`  Qualificação SDR:   ${qualificado.length}`);
console.log(`  Agendamento Closer: ${closer.length}`);

if (lead.length === mql.length) {
    console.log(`\n  ⚠️  Lead == MQL — bug não foi corrigido!`);
} else {
    console.log(`\n  ✅ Lead > MQL como esperado.`);
}

// Breakdown dos leads que NÃO são MQL
const naoMql = lead.filter(d => !isMql(d));
if (naoMql.length > 0) {
    console.log(`\n  Leads que não são MQL (${naoMql.length}):`);
    const byPipe = {};
    for (const d of naoMql) byPipe[d.pipeline] = (byPipe[d.pipeline] || 0) + 1;
    for (const [p, n] of Object.entries(byPipe).sort((a,b)=>b[1]-a[1])) {
        console.log(`    ${p}: ${n}`);
    }
}

// Sanity check Agendamento Closer
console.log(`\n  Agendamento Closer no período (${closer.length} deals):`);
for (const d of closer.sort((a,b)=>new Date(a.data_closer)-new Date(b.data_closer))) {
    console.log(`    ${d.data_closer.slice(0,10)} ${d.pipeline.padEnd(22)} ${d.title}`);
}
