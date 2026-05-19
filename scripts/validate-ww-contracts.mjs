#!/usr/bin/env node
// Valida a regra canônica isClosedWwContract contra produção.
// Esperado mai/2025: 12 contratos WW (10 originalmente vistos + 2 confirmados via funil).

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

const WW_CONTRACT = new Set([
    "SDR Weddings","Closer Weddings","Planejamento Weddings",
    "WW - Internacional","Outros Desqualificados | Wedding","Elopment Wedding",
    "Convidados","Convidados - Michelly","WW - Gestão Casamento","WW - Gestão Convidados","Produção",
]);

function isClosedWwContract(d) {
    if (!d.data_fechamento) return false;
    if (!d.pipeline || !WW_CONTRACT.has(d.pipeline)) return false;
    return !!d.data_qualificado || !!d.data_closer;
}

async function countMonth(year, month) {
    const start = `${year}-${String(month).padStart(2,"0")}-01T00:00:00`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const end = `${year}-${String(month).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}T23:59:59`;
    const { data } = await supabase
        .from("deals")
        .select("id,pipeline,data_qualificado,data_closer,data_fechamento")
        .gte("data_fechamento", start)
        .lte("data_fechamento", end);
    const total = data?.length ?? 0;
    const ww = (data ?? []).filter(isClosedWwContract).length;
    return { total, ww };
}

const months = [
    [2024, 11], [2024, 12],
    [2025, 1], [2025, 2], [2025, 3], [2025, 4], [2025, 5], [2025, 6], [2025, 7],
    [2025, 8], [2025, 9], [2025, 10], [2025, 11], [2025, 12],
    [2026, 1], [2026, 2], [2026, 3], [2026, 4], [2026, 5],
];

console.log("Mês       | Total fechados | WW (isClosedWwContract) | Outros");
console.log("-".repeat(75));
for (const [y, m] of months) {
    const { total, ww } = await countMonth(y, m);
    const others = total - ww;
    const label = `${["","jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][m]}/${String(y).slice(-2)}`;
    console.log(`${label.padEnd(9)} | ${String(total).padStart(14)} | ${String(ww).padStart(23)} | ${others}`);
}
