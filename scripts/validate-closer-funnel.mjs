#!/usr/bin/env node
// Valida o funil Closer contra Supabase. Usa "Mês passado" (abril/2026) e "Este mês" (maio/2026).
// Mimica o fetch do Dashboard (5 grupos WW + Elopment, com buffer 90d) e aplica
// os filtros do motor pra confirmar que o que o dashboard mostraria bate com a fonte.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
const env = {};
for (const line of envText.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2];
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const GROUP_TO_PIPELINE = {
    "1": "SDR Weddings",
    "3": "Closer Weddings",
    "4": "Planejamento Weddings",
    "12": "Elopment Wedding",
    "17": "WW - Internacional",
    "31": "Outros Desqualificados | Wedding",
};
const WW_LEADS_PIPELINE_NAMES = new Set(Object.values(GROUP_TO_PIPELINE));
const WW_MQL_PIPELINE_NAMES = new Set(["SDR Weddings", "Closer Weddings", "Planejamento Weddings"]);

function isLead(d) {
    return WW_LEADS_PIPELINE_NAMES.has(d.pipeline);
}
function isMql(d) {
    return WW_MQL_PIPELINE_NAMES.has(d.pipeline);
}
function realizouCloser(d) {
    const v = (d.ww_como_foi_feita_reuni_o_closer || d.tipo_da_reuni_o_com_a_closer || "").trim();
    return v !== "" && v !== "Não teve reunião";
}
function inRange(s, start, end) {
    if (!s) return false;
    const t = new Date(s).getTime();
    return !Number.isNaN(t) && t >= start.getTime() && t <= end.getTime();
}

async function fetchAll(start, end) {
    let all = [];
    for (const [groupId, pipelineName] of Object.entries(GROUP_TO_PIPELINE)) {
        const filter = `group_id.eq.${groupId},pipeline.eq.${pipelineName}`;
        let from = 0;
        for (let p = 0; p < 20; p++) {
            const { data, error } = await supabase
                .from("deals")
                .select("id, title, pipeline, group_id, status, created_at, data_reuniao_1, data_qualificado, data_closer, data_fechamento, ww_closer_data_hora_ganho, ww_como_foi_feita_reuni_o_closer, tipo_da_reuni_o_com_a_closer, ww_closer_motivo_de_perda, is_elopement")
                .or(filter)
                .gte("created_at", start.toISOString())
                .lte("created_at", end.toISOString())
                .order("created_at", { ascending: false })
                .range(from, from + 999);
            if (error) throw error;
            if (!data || data.length === 0) break;
            all = all.concat(data);
            if (data.length < 1000) break;
            from += 1000;
        }
    }
    // dedup por id
    const seen = new Set();
    return all.filter(d => seen.has(d.id) ? false : (seen.add(d.id), true));
}

async function reportFor(label, periodStart, periodEnd, fetchStart) {
    const all = await fetchAll(fetchStart, periodEnd);
    const fechamento = (d) => d.ww_closer_data_hora_ganho || d.data_fechamento;

    const mqlInPeriod = all.filter(d => isMql(d) && inRange(d.created_at, periodStart, periodEnd));
    const leadInPeriod = all.filter(d => isLead(d) && inRange(d.created_at, periodStart, periodEnd));
    const agendadas = all.filter(d => isMql(d) && inRange(d.data_closer, periodStart, periodEnd));
    const realizadas = agendadas.filter(realizouCloser);
    const contratos = all.filter(d => isMql(d) && inRange(fechamento(d), periodStart, periodEnd));

    // Cohort de fechamento (leads criados no período)
    const cohort = all.filter(d => isLead(d) && inRange(d.created_at, periodStart, periodEnd));
    const cFechou = cohort.filter(d => !!fechamento(d));
    const cPerdeu = cohort.filter(d => !fechamento(d) && d.status === "Lost");
    const cAberto = cohort.filter(d => !fechamento(d) && d.status !== "Lost");

    // Tempo até fechamento (média em dias dos contratos do período)
    let totDias = 0, n = 0;
    for (const d of contratos) {
        const t1 = new Date(d.created_at).getTime();
        const t2 = new Date(fechamento(d)).getTime();
        if (!Number.isNaN(t1) && !Number.isNaN(t2) && t2 > t1) {
            totDias += (t2 - t1) / (24 * 60 * 60 * 1000);
            n++;
        }
    }
    const tempoMedio = n > 0 ? Math.round(totDias / n) : null;

    // Motivos de perda no período
    const lost = all.filter(d => isMql(d) && d.status === "Lost" && !fechamento(d) && inRange(d.created_at, periodStart, periodEnd));
    const motivos = {};
    for (const d of lost) {
        const m = (d.ww_closer_motivo_de_perda || "").trim();
        if (!m) continue;
        motivos[m] = (motivos[m] || 0) + 1;
    }
    const topMotivos = Object.entries(motivos).sort((a, b) => b[1] - a[1]).slice(0, 5);

    console.log(`\n══ ${label} ${periodStart.toISOString().slice(0, 10)} → ${periodEnd.toISOString().slice(0, 10)} ══`);
    console.log(`  Total deals (após buffer 90d): ${all.length}`);
    console.log(`  Lead:                ${leadInPeriod.length}`);
    console.log(`  MQL:                 ${mqlInPeriod.length}`);
    console.log(`  R. Agendada:         ${agendadas.length}`);
    console.log(`  R. Realizada:        ${realizadas.length}`);
    console.log(`  Contrato Fechado:    ${contratos.length}`);
    console.log(`  Comparecimento:      ${agendadas.length > 0 ? ((realizadas.length / agendadas.length) * 100).toFixed(1) : "—"}%`);
    console.log(`  Close rate:          ${realizadas.length > 0 ? ((contratos.length / realizadas.length) * 100).toFixed(1) : "—"}%`);
    console.log(`  Conv. MQL→Contrato:  ${mqlInPeriod.length > 0 ? ((contratos.length / mqlInPeriod.length) * 100).toFixed(1) : "—"}%`);
    console.log(`  Tempo até fechamento: ${tempoMedio == null ? "—" : `${tempoMedio} dias (n=${n})`}`);

    console.log(`\n  Cohort de fechamento (${cohort.length} leads):`);
    const pct = (x) => cohort.length > 0 ? ((x / cohort.length) * 100).toFixed(1) : "—";
    console.log(`    ✓ Fecharam:   ${cFechou.length} (${pct(cFechou.length)}%)`);
    console.log(`    … Em aberto: ${cAberto.length} (${pct(cAberto.length)}%)`);
    console.log(`    ✗ Perderam:  ${cPerdeu.length} (${pct(cPerdeu.length)}%)`);

    if (topMotivos.length > 0) {
        console.log(`\n  Top motivos de perda no período:`);
        for (const [m, n] of topMotivos) {
            console.log(`    - ${m}: ${n}`);
        }
    }
}

const today = new Date();
const startMaio = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
const endMaio = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0, 23, 59, 59));
const startAbril = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
const endAbril = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0, 23, 59, 59));
const buffer = (start) => new Date(start.getTime() - 90 * 24 * 60 * 60 * 1000);

await reportFor("Mês passado (abril/2026)", startAbril, endAbril, buffer(startAbril));
await reportFor("Este mês (maio/2026, modo calendário)", startMaio, endMaio, buffer(startMaio));
