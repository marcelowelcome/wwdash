#!/usr/bin/env node
// Valida Board Mensal v2: modos coorte/evento + linha Leads (6 pipelines)
// + nova fórmula Conv SDR→Closer (contratos/qualif) + Conv Lead→MQL + Close Rate + Win Rate.

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

const now = new Date();
const months = [];
for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        isCurrent: i === 0,
        key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
        label: ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][d.getUTCMonth()] + "/" + String(d.getUTCFullYear()).slice(-2),
    });
}

// Convenção dashboard:
const LEAD_PIPELINES = new Set(["SDR Weddings","Closer Weddings","Planejamento Weddings","WW - Internacional","Outros Desqualificados | Wedding","Elopment Wedding"]);
const MQL_PIPELINES = new Set(["SDR Weddings","Closer Weddings","Planejamento Weddings"]);
const REUNIAO_EXCLUDE = new Set(["Não teve reunião",""]);

// Fetcha range largo: 6 meses antes do primeiro mês + último mês
const fetchStart = `${months[0].year}-${String(months[0].month).padStart(2,"0")}-01T00:00:00`;
const last = months[months.length-1];
const lastDay = new Date(Date.UTC(last.year, last.month, 0)).getUTCDate();
const fetchEnd = `${last.year}-${String(last.month).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}T23:59:59`;

const allDeals = [];
let from = 0;
while (true) {
    const { data, error } = await supabase
        .from("deals")
        .select("id,pipeline,is_elopement,title,created_at,data_qualificado,data_closer,data_fechamento,ww_como_foi_feita_reuni_o_closer,tipo_da_reuni_o_com_a_closer")
        .or(`created_at.gte.${fetchStart},data_qualificado.gte.${fetchStart},data_closer.gte.${fetchStart},data_fechamento.gte.${fetchStart}`)
        .or(`created_at.lte.${fetchEnd},data_qualificado.lte.${fetchEnd},data_closer.lte.${fetchEnd},data_fechamento.lte.${fetchEnd}`)
        .in("pipeline", [...LEAD_PIPELINES])
        .range(from, from + 999);
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    allDeals.push(...data);
    if (data.length < 1000) break;
    from += 1000;
}

console.log(`Fetched ${allDeals.length} deals em pipelines WW para a janela.\n`);

const inRange = (s, year, month) => {
    if (!s) return false;
    const startStr = `${year}-${String(month).padStart(2,"0")}-01T00:00:00+00:00`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const endStr = `${year}-${String(month).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}T23:59:59+00:00`;
    const t = new Date(s).getTime();
    return t >= new Date(startStr).getTime() && t <= new Date(endStr).getTime();
};

const realizouCloser = (d) => {
    const sinais = [d.ww_como_foi_feita_reuni_o_closer, d.tipo_da_reuni_o_com_a_closer];
    return sinais.some(s => s != null && !REUNIAO_EXCLUDE.has(String(s).trim()));
};

function countEvento(year, month) {
    let leads = 0, mql = 0, qualif = 0, reun = 0, contratos = 0;
    for (const d of allDeals) {
        const isLead = LEAD_PIPELINES.has(d.pipeline);
        const isMql = MQL_PIPELINES.has(d.pipeline) && d.is_elopement !== true;
        if (!isLead && !isMql) continue;
        const inC = inRange(d.created_at, year, month);
        if (isLead && inC) leads++;
        if (!isMql) continue;
        if (inC) mql++;
        if (inRange(d.data_qualificado, year, month)) qualif++;
        if (inRange(d.data_closer, year, month) && realizouCloser(d)) reun++;
        if (inRange(d.data_fechamento, year, month)) contratos++;
    }
    return { leads, mql, qualif, reun, contratos };
}

function countCoorte(year, month) {
    let leads = 0, mql = 0, qualif = 0, reun = 0, contratos = 0;
    for (const d of allDeals) {
        if (!inRange(d.created_at, year, month)) continue;
        if (LEAD_PIPELINES.has(d.pipeline)) leads++;
        if (!MQL_PIPELINES.has(d.pipeline) || d.is_elopement === true) continue;
        mql++;
        if (d.data_qualificado) qualif++;
        if (d.data_closer && realizouCloser(d)) reun++;
        if (d.data_fechamento) contratos++;
    }
    return { leads, mql, qualif, reun, contratos };
}

function pct(num, den) {
    if (!den) return "—";
    return ((num / den) * 100).toFixed(1) + "%";
}

function printTable(label, counter) {
    console.log(`\n${"=".repeat(80)}\n${label}\n${"=".repeat(80)}`);
    const data = months.map(m => ({ m, ...counter(m.year, m.month) }));
    console.log("KPI               |" + data.map(d => ` ${d.m.label.padEnd(8)} `).join("|"));
    console.log("-".repeat(18) + "|" + data.map(() => "-".repeat(10)).join("|"));
    const row = (lbl, get) => console.log(`${lbl.padEnd(17)} |` + data.map(d => ` ${String(get(d)).padEnd(8)} `).join("|"));
    row("Leads (6 pipes)", d => d.leads);
    row("MQL (3 pipes)", d => d.mql);
    row("Qualif SDR", d => d.qualif);
    row("Reun Closer", d => d.reun);
    row("Contratos", d => d.contratos);
    row("Lead→MQL", d => pct(d.mql, d.leads));
    row("Conv SDR→Closer*", d => pct(d.contratos, d.qualif));
    row("Close Rate", d => pct(d.contratos, d.reun));
    row("Win Rate", d => pct(d.contratos, d.mql));
    console.log("\n* Conv SDR→Closer = contratos / qualif (nova definição)");
}

printTable("Modo EVENTO (timestamp do evento no mês)", countEvento);
printTable("Modo COORTE (created_at no mês, etapas any-time)", countCoorte);
