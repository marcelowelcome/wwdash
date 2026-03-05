import { type WonDeal } from "./schemas";
import { type PeriodFilter } from "./metrics-sdr";
import { parseDate } from "./utils";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ContractMetrics {
    // KPIs
    totalContratos: number;
    receitaTotal: number;
    ticketMedio: number;
    mediaConvidados: number;
    tempoMedioFechamento: number;
    ticketPorConvidado: number;

    // Charts
    receitaMensal: { month: string; receita: number; contratos: number; ticketMedio: number }[];
    porDestino: { destino: string; contratos: number; receita: number; ticketMedio: number; mediaConvidados: number; pctReceita: number }[];
    porFonte: { fonte: string; contratos: number; receita: number; ticketMedio: number; pctTotal: number }[];
    tempoFechamento: { faixa: string; count: number; pct: number }[];
    distribuicaoConvidados: { faixa: string; count: number; pct: number }[];
    porCloser: { closer: string; contratos: number; receita: number; ticketMedio: number; tempoMedio: number; mediaConvidados: number }[];
    porPipeline: { pipeline: string; contratos: number; receita: number; ticketMedio: number }[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getPeriodRange(filter: PeriodFilter): [Date, Date] {
    const now = new Date();
    const end = new Date(now);
    let start: Date;

    switch (filter) {
        case "week": {
            start = new Date(now);
            const day = start.getDay();
            start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
            start.setHours(0, 0, 0, 0);
            break;
        }
        case "4weeks":
            start = new Date(now);
            start.setDate(start.getDate() - 28);
            break;
        case "3months":
            start = new Date(now);
            start.setDate(start.getDate() - 90);
            break;
        case "full":
        default:
            start = new Date(0);
            break;
    }
    return [start, end];
}

function daysBetween(a: Date, b: Date): number {
    return Math.floor(Math.abs(b.getTime() - a.getTime()) / 86400000);
}

function monthLabel(d: Date): string {
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${months[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
}

function safeDiv(a: number, b: number): number {
    return b > 0 ? a / b : 0;
}

function bucket<T>(items: T[], getBucket: (item: T) => string, labels: string[]): { faixa: string; count: number; pct: number }[] {
    const counts: Record<string, number> = {};
    for (const l of labels) counts[l] = 0;
    for (const item of items) {
        const b = getBucket(item);
        if (b in counts) counts[b]++;
    }
    const total = items.length || 1;
    return labels.map(l => ({ faixa: l, count: counts[l], pct: Math.round((counts[l] / total) * 100) }));
}

// ─── Main Computation ───────────────────────────────────────────────────────

export function computeContractMetrics(
    rawDeals: WonDeal[],
    fieldMap: Record<string, string>,
    filter: PeriodFilter
): ContractMetrics {
    const [start, end] = getPeriodRange(filter);
    const sourceKey = fieldMap["Fonte"] || "";

    // Filter deals by data_fechamento within period
    const deals = rawDeals.filter(d => {
        const dt = parseDate(d.data_fechamento ?? undefined);
        return dt && dt >= start && dt <= end;
    });

    // ── KPIs ────────────────────────────────────────────────────────────────

    const totalContratos = deals.length;

    const dealsWithValue = deals.filter(d => d.valor_fechado_em_contrato && d.valor_fechado_em_contrato > 0);
    const receitaTotal = dealsWithValue.reduce((sum, d) => sum + (d.valor_fechado_em_contrato || 0), 0);
    const ticketMedio = safeDiv(receitaTotal, dealsWithValue.length);

    const dealsWithGuests = deals.filter(d => d.num_convidados && d.num_convidados > 0);
    const totalGuests = dealsWithGuests.reduce((sum, d) => sum + (d.num_convidados || 0), 0);
    const mediaConvidados = Math.round(safeDiv(totalGuests, dealsWithGuests.length));

    const dealsWithDates = deals.filter(d => {
        const close = parseDate(d.data_fechamento ?? undefined);
        const create = parseDate(d.cdate);
        return close && create;
    });
    const totalDays = dealsWithDates.reduce((sum, d) => {
        const close = parseDate(d.data_fechamento ?? undefined)!;
        const create = parseDate(d.cdate)!;
        return sum + daysBetween(create, close);
    }, 0);
    const tempoMedioFechamento = Math.round(safeDiv(totalDays, dealsWithDates.length));

    const ticketPorConvidado = Math.round(safeDiv(receitaTotal, totalGuests));

    // ── Receita Mensal ──────────────────────────────────────────────────────

    const monthMap = new Map<string, { receita: number; contratos: number }>();
    for (const d of deals) {
        const dt = parseDate(d.data_fechamento ?? undefined);
        if (!dt) continue;
        const key = monthLabel(dt);
        const curr = monthMap.get(key) || { receita: 0, contratos: 0 };
        curr.receita += d.valor_fechado_em_contrato || 0;
        curr.contratos += 1;
        monthMap.set(key, curr);
    }

    // Sort months chronologically
    const receitaMensal = Array.from(monthMap.entries())
        .sort((a, b) => {
            const parse = (k: string) => {
                const [m, y] = k.split("/");
                const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
                return (2000 + parseInt(y)) * 100 + months.indexOf(m);
            };
            return parse(a[0]) - parse(b[0]);
        })
        .map(([month, { receita, contratos }]) => ({
            month,
            receita: Math.round(receita),
            contratos,
            ticketMedio: Math.round(safeDiv(receita, contratos)),
        }));

    // ── Por Destino ─────────────────────────────────────────────────────────

    const destMap = new Map<string, { contratos: number; receita: number; guests: number; guestCount: number }>();
    for (const d of deals) {
        const dest = d.destino || "Não informado";
        const curr = destMap.get(dest) || { contratos: 0, receita: 0, guests: 0, guestCount: 0 };
        curr.contratos += 1;
        curr.receita += d.valor_fechado_em_contrato || 0;
        if (d.num_convidados && d.num_convidados > 0) {
            curr.guests += d.num_convidados;
            curr.guestCount += 1;
        }
        destMap.set(dest, curr);
    }

    const porDestino = Array.from(destMap.entries())
        .map(([destino, v]) => ({
            destino,
            contratos: v.contratos,
            receita: Math.round(v.receita),
            ticketMedio: Math.round(safeDiv(v.receita, v.contratos)),
            mediaConvidados: Math.round(safeDiv(v.guests, v.guestCount)),
            pctReceita: Math.round(safeDiv(v.receita, receitaTotal) * 100),
        }))
        .sort((a, b) => b.receita - a.receita)
        .slice(0, 10);

    // ── Por Fonte ───────────────────────────────────────────────────────────

    const fonteMap = new Map<string, { contratos: number; receita: number }>();
    for (const d of deals) {
        const fonte = (sourceKey && d._cf?.[sourceKey]) || d.ww_fonte_do_lead || "Outros";
        const key = fonte.trim() || "Outros";
        const curr = fonteMap.get(key) || { contratos: 0, receita: 0 };
        curr.contratos += 1;
        curr.receita += d.valor_fechado_em_contrato || 0;
        fonteMap.set(key, curr);
    }

    const porFonte = Array.from(fonteMap.entries())
        .map(([fonte, v]) => ({
            fonte,
            contratos: v.contratos,
            receita: Math.round(v.receita),
            ticketMedio: Math.round(safeDiv(v.receita, v.contratos)),
            pctTotal: Math.round(safeDiv(v.contratos, totalContratos) * 100),
        }))
        .sort((a, b) => b.contratos - a.contratos)
        .slice(0, 8);

    // ── Tempo de Fechamento (buckets) ───────────────────────────────────────

    const closingLabels = ["0-14 dias", "15-30 dias", "31-60 dias", "61-90 dias", "90+ dias"];
    const tempoFechamento = bucket(dealsWithDates, (d) => {
        const close = parseDate(d.data_fechamento ?? undefined)!;
        const create = parseDate(d.cdate)!;
        const days = daysBetween(create, close);
        if (days <= 14) return "0-14 dias";
        if (days <= 30) return "15-30 dias";
        if (days <= 60) return "31-60 dias";
        if (days <= 90) return "61-90 dias";
        return "90+ dias";
    }, closingLabels);

    // ── Distribuição de Convidados (buckets) ────────────────────────────────

    const guestLabels = ["1-30", "31-60", "61-100", "101-150", "150+"];
    const distribuicaoConvidados = bucket(dealsWithGuests, (d) => {
        const n = d.num_convidados || 0;
        if (n <= 30) return "1-30";
        if (n <= 60) return "31-60";
        if (n <= 100) return "61-100";
        if (n <= 150) return "101-150";
        return "150+";
    }, guestLabels);

    // ── Por Closer ──────────────────────────────────────────────────────────

    const closerMap = new Map<string, { contratos: number; receita: number; days: number; daysCount: number; guests: number; guestCount: number }>();
    for (const d of deals) {
        const closer = d.owner_id || "Não atribuído";
        const curr = closerMap.get(closer) || { contratos: 0, receita: 0, days: 0, daysCount: 0, guests: 0, guestCount: 0 };
        curr.contratos += 1;
        curr.receita += d.valor_fechado_em_contrato || 0;
        const close = parseDate(d.data_fechamento ?? undefined);
        const create = parseDate(d.cdate);
        if (close && create) {
            curr.days += daysBetween(create, close);
            curr.daysCount += 1;
        }
        if (d.num_convidados && d.num_convidados > 0) {
            curr.guests += d.num_convidados;
            curr.guestCount += 1;
        }
        closerMap.set(closer, curr);
    }

    const porCloser = Array.from(closerMap.entries())
        .map(([closer, v]) => ({
            closer,
            contratos: v.contratos,
            receita: Math.round(v.receita),
            ticketMedio: Math.round(safeDiv(v.receita, v.contratos)),
            tempoMedio: Math.round(safeDiv(v.days, v.daysCount)),
            mediaConvidados: Math.round(safeDiv(v.guests, v.guestCount)),
        }))
        .sort((a, b) => b.receita - a.receita);

    // ── Por Pipeline ────────────────────────────────────────────────────────

    const pipeMap = new Map<string, { contratos: number; receita: number }>();
    for (const d of deals) {
        const key = d.is_elopement ? "Elopement" : "Wedding";
        const curr = pipeMap.get(key) || { contratos: 0, receita: 0 };
        curr.contratos += 1;
        curr.receita += d.valor_fechado_em_contrato || 0;
        pipeMap.set(key, curr);
    }

    const porPipeline = Array.from(pipeMap.entries())
        .map(([pipeline, v]) => ({
            pipeline,
            contratos: v.contratos,
            receita: Math.round(v.receita),
            ticketMedio: Math.round(safeDiv(v.receita, v.contratos)),
        }))
        .sort((a, b) => b.receita - a.receita);

    return {
        totalContratos,
        receitaTotal: Math.round(receitaTotal),
        ticketMedio: Math.round(ticketMedio),
        mediaConvidados,
        tempoMedioFechamento,
        ticketPorConvidado,
        receitaMensal,
        porDestino,
        porFonte,
        tempoFechamento,
        distribuicaoConvidados,
        porCloser,
        porPipeline,
    };
}
