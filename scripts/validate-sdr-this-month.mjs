#!/usr/bin/env node
// Valida AG. CLOSER no preset "Este mês" com fetch estendido (90d buffer + endOfMonth).
// Esperado: 6+ deals (Mariana, Ana, Cristiane, Camila, Nathalia, Tiago).

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

// "Este mês" estendido (modo calendário).
const today = new Date();
const startOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
const endOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0, 23, 59, 59));
const fetchStart = new Date(startOfMonth.getTime() - 90 * 24 * 60 * 60 * 1000);

console.log(`SDR fetch range:    ${fetchStart.toISOString().slice(0,10)} → ${endOfMonth.toISOString().slice(0,10)}`);
console.log(`SDR cálculo range:  ${startOfMonth.toISOString().slice(0,10)} → ${endOfMonth.toISOString().slice(0,10)}\n`);

const GROUP_TO_PIPELINE = {
    "1": "SDR Weddings",
    "3": "Closer Weddings",
    "4": "Planejamento Weddings",
    "17": "WW - Internacional",
    "31": "Outros Desqualificados | Wedding",
};
const WW_PIPELINE_NAMES = new Set(Object.values(GROUP_TO_PIPELINE));
const WW_MQL_PIPELINE_NAMES = new Set(["SDR Weddings", "Closer Weddings", "Planejamento Weddings"]);

async function fetchGroup(groupId) {
    const filter = `group_id.eq.${groupId},pipeline.eq.${GROUP_TO_PIPELINE[groupId]}`;
    let all = [];
    let from = 0;
    for (let p = 0; p < 20; p++) {
        const { data, error } = await supabase
            .from("deals")
            .select("id, title, pipeline, group_id, created_at, data_reuniao_1, como_reuniao_1, data_qualificado, data_closer, is_elopement")
            .or(filter)
            .gte("created_at", fetchStart.toISOString())
            .lte("created_at", endOfMonth.toISOString())
            .order("created_at", { ascending: false })
            .range(from, from + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < 1000) break;
        from += 1000;
    }
    return all;
}

const groups = ["1", "3", "4", "17", "31"];
const results = await Promise.all(groups.map(fetchGroup));
for (let i = 0; i < groups.length; i++) {
    console.log(`  group ${groups[i].padStart(2)}: ${results[i].length} deals (após buffer 90d)`);
}

const seen = new Set();
const all = [];
for (const arr of results) for (const d of arr) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    all.push(d);
}
console.log(`\n  TOTAL deduplicado: ${all.length} deals\n`);

const isLead = (d) => d.is_elopement !== true && WW_PIPELINE_NAMES.has(d.pipeline);
const isMql = (d) => isLead(d) && WW_MQL_PIPELINE_NAMES.has(d.pipeline);
const inRange = (s, start, end) => {
    if (!s) return false;
    const t = new Date(s).getTime();
    return t >= start.getTime() && t <= end.getTime();
};

// "Este mês" estendido — eventos contam até endOfMonth.
const lead = all.filter(d => isLead(d) && inRange(d.created_at, startOfMonth, endOfMonth));
const mql = all.filter(d => isMql(d) && inRange(d.created_at, startOfMonth, endOfMonth));
const ag = all.filter(d => isMql(d) && inRange(d.data_reuniao_1, startOfMonth, endOfMonth));
const real = ag.filter(d => d.como_reuniao_1 && d.como_reuniao_1 !== "" && d.como_reuniao_1 !== "Não teve reunião");
const qual = all.filter(d => isMql(d) && inRange(d.data_qualificado, startOfMonth, endOfMonth));
const closer = all.filter(d => isMql(d) && inRange(d.data_closer, startOfMonth, endOfMonth));

console.log("FUNIL Este mês (modo calendário):\n");
console.log(`  Lead:               ${lead.length}`);
console.log(`  MQL:                ${mql.length}`);
console.log(`  Agendamento:        ${ag.length}`);
console.log(`  Reunião realizada:  ${real.length}`);
console.log(`  Qualificação SDR:   ${qual.length}`);
console.log(`  Agendamento Closer: ${closer.length}`);

console.log(`\n  Agendamento Closer detalhe:`);
for (const d of closer.sort((a, b) => new Date(a.data_closer) - new Date(b.data_closer))) {
    console.log(`    ${d.data_closer.slice(0,10)} ${d.pipeline.padEnd(22)} ${d.title}`);
}
