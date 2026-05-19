#!/usr/bin/env node
// Valida que o Board Mensal vai exibir números sensatos para os 7 meses.
// Roda contra Supabase de produção.

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

console.log(`7 meses: ${months.map(m => m.label).join(" → ")}\n`);

// Convenção do dashboard: MQL = 3 pipelines (SDR + Closer + Planejamento).
// Internacional + Desqualificados ficam fora.
const WW_PIPELINES = new Set(["SDR Weddings","Closer Weddings","Planejamento Weddings"]);

const REUNIAO_EXCLUDE = new Set(["Não teve reunião",""]);

async function fetchMonthDeals(monthKey, year, month) {
    const startStr = `${year}-${String(month).padStart(2,"0")}-01T00:00:00`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const endStr = `${year}-${String(month).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}T23:59:59`;

    // MQL (leads_gerados): pipeline WW + !elopement + !EW% + created_at no mês
    const { data: deals } = await supabase
        .from("deals")
        .select("id,pipeline,is_elopement,title,created_at,data_qualificado,data_closer,data_fechamento,reuniao_closer,ww_como_foi_feita_reuni_o_closer,tipo_da_reuni_o_com_a_closer")
        .or(`created_at.gte.${startStr},data_qualificado.gte.${startStr},data_closer.gte.${startStr},data_fechamento.gte.${startStr}`)
        .or(`created_at.lte.${endStr},data_qualificado.lte.${endStr},data_closer.lte.${endStr},data_fechamento.lte.${endStr}`)
        .in("pipeline", [...WW_PIPELINES])
        .limit(5000);

    if (!deals) return { mql: 0, qualif: 0, reun: 0, contratos: 0 };

    const inRange = (s) => {
        if (!s) return false;
        const t = new Date(s).getTime();
        return t >= new Date(startStr + "+00:00").getTime() && t <= new Date(endStr + "+00:00").getTime();
    };

    const qualified = (d) => {
        if (d.is_elopement === true) return false;
        if (d.title && /^EW/i.test(d.title)) return false;
        if (!WW_PIPELINES.has(d.pipeline)) return false;
        return true;
    };

    const reuniaoCounts = (d) => {
        const sinais = [d.ww_como_foi_feita_reuni_o_closer, d.tipo_da_reuni_o_com_a_closer];
        return sinais.some(s => s != null && !REUNIAO_EXCLUDE.has(String(s).trim()));
    };

    let mql = 0, qualif = 0, reun = 0, contratos = 0;
    for (const d of deals) {
        if (!qualified(d)) continue;
        if (inRange(d.created_at)) mql++;
        if (inRange(d.data_qualificado)) qualif++;
        if (inRange(d.data_closer) && reuniaoCounts(d)) reun++;
        if (inRange(d.data_fechamento)) contratos++;
    }
    return { mql, qualif, reun, contratos };
}

async function fetchMonthSpend(year, month) {
    const startStr = `${year}-${String(month).padStart(2,"0")}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const endStr = `${year}-${String(month).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;

    const { data } = await supabase
        .from("ads_spend_cache")
        .select("source,spend,date")
        .eq("pipeline", "wedding")
        .gte("date", startStr)
        .lte("date", endStr);
    if (!data) return { meta: 0, google: 0 };
    let meta = 0, google = 0;
    for (const r of data) {
        if (r.source === "meta") meta += Number(r.spend) || 0;
        else if (r.source === "google") google += Number(r.spend) || 0;
    }
    return { meta, google };
}

async function fetchTarget(year, month) {
    const monthStr = `${year}-${String(month).padStart(2,"0")}-01`;
    const { data } = await supabase
        .from("monthly_targets")
        .select("*")
        .eq("month", monthStr)
        .eq("pipeline_type", "wedding")
        .maybeSingle();
    return data;
}

console.log("KPI                 |" + months.map(m => ` ${m.label.padEnd(8)} `).join("|"));
console.log("-".repeat(20) + "|" + months.map(() => "-".repeat(10)).join("|"));

const allData = await Promise.all(months.map(async (m) => {
    const [funnel, spend, target] = await Promise.all([
        fetchMonthDeals(m.key, m.year, m.month),
        fetchMonthSpend(m.year, m.month),
        fetchTarget(m.year, m.month),
    ]);
    return { m, funnel, spend, target };
}));

function row(label, get) {
    const vals = allData.map(({m, funnel, spend, target}) => {
        const v = get(funnel, spend, target, m);
        return String(v).padEnd(8);
    });
    console.log(`${label.padEnd(20)} |` + vals.map(v => ` ${v} `).join("|"));
}

row("Invest (R$)", (_, s) => `${(s.meta + s.google).toFixed(0)}`);
row("MQL", (f) => f.mql);
row("Qualif SDR", (f) => f.qualif);
row("Reun Closer", (f) => f.reun);
row("Contratos", (f) => f.contratos);
row("CAC", (f, s) => f.contratos > 0 ? `${((s.meta+s.google)/f.contratos).toFixed(0)}` : "—");
row("Conv SDR→Closer", (f) => f.qualif > 0 ? `${((f.reun/f.qualif)*100).toFixed(1)}%` : "—");

console.log("\nMetas (monthly_targets · pipeline=wedding):");
console.log("Mês     | mql  qualif  reun  vendas  cpl");
for (const { m, target } of allData) {
    if (!target) {
        console.log(`${m.label.padEnd(8)} | (sem meta)`);
    } else {
        console.log(`${m.label.padEnd(8)} | ${String(target.mql).padEnd(5)} ${String(target.qualificado).padEnd(7)} ${String(target.closer_realizada).padEnd(5)} ${String(target.vendas).padEnd(7)} R$ ${target.cpl}`);
    }
}
