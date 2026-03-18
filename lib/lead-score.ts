import { type WonDeal } from "./schemas";

// ─── Config & Constants ─────────────────────────────────────────────────────

// Version bump clears old localStorage configs that had different shape
export const SCORE_CONFIG_KEY = "ww-score-config-v2";

export const DEFAULT_SCORE_BANDS: ScoreBands = { A: 65, B: 50, C: 30 };

export const TRAINING_MOTIVE_SCORE = "Para closer ter mais reuniões";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScoreWeights {
    // SDR dimensions
    destino: number;
    tipoReuniaoSdr: number;
    convidados: number;
    orcamento: number;
    sql: number;
    statusRelacionamento: number;
    costumaViajar: number;
    jaFoiDestination: number;
    temDestino: number;
    taxaEnviada: number;
    taxaPaga: number;
    previsaoAssessoria: number;
    // Closer dimensions
    tipoReuniaoCloser: number;
    fezSegundaReuniao: number;
    detalhamentoOrcamento: number;
    // Contextual
    velocidade: number;
    pipeline: number;
}

export interface ScoreBands {
    A: number;
    B: number;
    C: number;
}

export interface ScoreConfig {
    weights: ScoreWeights;
    bands: ScoreBands;
}

// ─── Profiles ────────────────────────────────────────────────────────────────

interface ConversionEntry {
    won: number;
    lost: number;
    rate: number;
}

export interface DimensionStats {
    byValue: Record<string, ConversionEntry>;
    maxRate: number;
    discriminatingPower: number;
    medianWon?: number;
    avgDaysToClose?: number;
    ticketMedioPorDestino?: Record<string, number>;
}

export interface ScoreProfiles {
    destino: DimensionStats;
    tipoReuniaoSdr: DimensionStats;
    sql: DimensionStats;
    statusRelacionamento: DimensionStats;
    costumaViajar: DimensionStats;
    jaFoiDestination: DimensionStats;
    temDestino: DimensionStats;
    taxaEnviada: DimensionStats;
    taxaPaga: DimensionStats;
    previsaoAssessoria: DimensionStats;
    tipoReuniaoCloser: DimensionStats;
    fezSegundaReuniao: DimensionStats;
    detalhamentoOrcamento: DimensionStats;
    pipeline: DimensionStats;
    convidados: DimensionStats;
    orcamento: DimensionStats;
    velocidade: DimensionStats;
    ticketMedioPorDestino: Record<string, number>;
    totalResolvidos: number;
    totalWon: number;
}

// ─── Score Output ─────────────────────────────────────────────────────────────

export interface DimensionScore {
    score: number;
    label: string;
    detail: string;
    hasData: boolean;
}

export type ScoreBand = "A" | "B" | "C" | "D";

export type ScoreDimKey = keyof ScoreWeights;

export interface LeadScore {
    total: number;
    band: ScoreBand;
    confidence: "alta" | "média" | "baixa";
    dimensions: Record<ScoreDimKey, DimensionScore>;
}

export interface ScoredDeal extends WonDeal {
    score: LeadScore;
    diasNoFunil: number;
    isTraining: boolean;
    motivoQualificacao: string;
}

// ─── Analysis Output ──────────────────────────────────────────────────────────

export interface MonthlyProfile {
    month: string;
    monthKey: string;
    contratos: number;
    receita: number;
    ticketMedio: number;
    topDestinos: { name: string; count: number; pct: number }[];
    topFontes: { name: string; count: number; pct: number }[];
    mediaConvidados: number | null;
    tempoMedio: number | null;
    pctElopement: number;
    topReuniao: string | null;
    avgOrcamento: number | null;
}

export interface SeasonalityData {
    month: string;
    monthKey: string;
    contratos: number;
    receita: number;
    ticketMedio: number;
    topDestino: string | null;
}

export interface CloserMonthlyProfile {
    monthKey: string;
    month: string;
    total: number;
    won: number;
    lost: number;
    open: number;
    convRate: number;                  // won / (won + lost), 0 if no resolved
    topDestinos: { name: string; count: number; pct: number }[];
    mediaConvidados: number | null;
    avgOrcamento: number | null;
    sqlRate: number;                   // % com SQL = "Sim"
    costumaViajarRate: number;         // % with costumam_viajar = true
    jaFoiDestRate: number;
    temDestinoRate: number;
    taxaEnviadaRate: number;
    taxaPagaRate: number;
    temDataCasamentoRate: number;      // % with previsao_data_casamento set
    topStatusRelacionamento: { name: string; count: number; pct: number }[];
    topTipoReuniaoSdr: { name: string; count: number; pct: number }[];
    topPrevisaoAssessoria: { name: string; count: number; pct: number }[];
    topTipoReuniaoCloser: { name: string; count: number; pct: number }[];
    fezSegundaReuniaoRate: number;
    detalhamentoOrcamentoRate: number;
    trainingCount: number;            // deals sent only for training
    completeness: number;             // % of key scoring fields filled (0-100)
    groupedByAppointment: boolean;    // true if grouped by closer appointment date, false if by creation date
    fechadosNoMes: number;            // won deals where data_fechamento falls in this month
    fechadosComDealCriadoNoMes: number; // won deals where cdate (deal creation) falls in this month
}

export interface FunnelQuality {
    status: "green" | "orange" | "red";
    message: string;
    avgScore: number;
    scoreSummary: { band: string; count: number; pct: number; color: string }[];
    dimensionAlignment: {
        key: string;
        name: string;
        alignment: number;
        openDist: { label: string; count: number; pct: number }[];
        winnerDist: { label: string; count: number; pct: number }[];
    }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeDiv(a: number, b: number): number {
    return b > 0 ? a / b : 0;
}

function median(nums: number[]): number | undefined {
    if (nums.length === 0) return undefined;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function monthLabel(d: Date): string {
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${months[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`;
}

function monthKey(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysFrom(iso: string): number {
    return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

function daysBetween(a: string, b: string): number {
    return Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

function boolToStr(val: boolean | null | undefined): string {
    if (val === true) return "Sim";
    if (val === false) return "Não";
    return "Não informado";
}

function taxaToStr(val: string | undefined): string {
    if (!val || val === "") return "Não informado";
    const n = parseFloat(val);
    if (isNaN(n)) return "Não informado";
    return n > 0 ? "Sim" : "Não";
}

function pctOf(n: number, total: number): number {
    return total > 0 ? Math.round((n / total) * 100) : 0;
}

function topDist(map: Map<string, number>, total: number, limit = 5): { name: string; count: number; pct: number }[] {
    return [...map.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([name, count]) => ({ name, count, pct: pctOf(count, total) }));
}

// ─── Training Deal Detection ───────────────────────────────────────────────────

function isTrainingDeal(d: WonDeal, FQ_ID: string): boolean {
    return (d._cf?.[FQ_ID] || "").includes(TRAINING_MOTIVE_SCORE);
}

// ─── Build Score Profiles ─────────────────────────────────────────────────────

export function buildScoreProfiles(
    closerDeals: WonDeal[],
    fieldMap: Record<string, string>
): ScoreProfiles {
    const FQ_ID = fieldMap["Motivos de qualificação SDR"] || fieldMap["Motivo de qualificação SDR"] || "custom_field_qual";
    const F_SQL_ID = fieldMap["SQL"] || "custom_field_sql";
    const F_TAX_SENT_ID = fieldMap["Taxa Enviada"] || "custom_field_tax_sent";
    const F_TAX_PAID_ID = fieldMap["Taxa Paga"] || "custom_field_tax_paid";

    // Training deals are INCLUDED in profiles — they represent real closures.
    // They are flagged in the UI via isTraining on ScoredDeal.
    // Single pass to partition resolved (won + lost) deals
    const resolved: WonDeal[] = [];
    const won: WonDeal[] = [];
    for (const d of closerDeals) {
        if (d.status === "0") { resolved.push(d); won.push(d); }
        else if (d.status === "2") { resolved.push(d); }
    }

    // ── Categorical dimension builder ──────────────────────────────────────
    function buildCatStats(getValue: (d: WonDeal) => string): DimensionStats {
        const byValue: Record<string, ConversionEntry> = {};
        for (const d of resolved) {
            const v = getValue(d) || "Não informado";
            if (!byValue[v]) byValue[v] = { won: 0, lost: 0, rate: 0 };
            if (d.status === "0") byValue[v].won++;
            else byValue[v].lost++;
        }
        for (const v of Object.keys(byValue)) {
            const e = byValue[v];
            const total = e.won + e.lost;
            e.rate = total >= 2 ? e.won / total : 0;
        }
        const rates = Object.values(byValue).filter(e => (e.won + e.lost) >= 2).map(e => e.rate);
        const maxRate = rates.length > 0 ? Math.max(...rates) : 0;
        const minRate = rates.length > 0 ? Math.min(...rates) : 0;
        return { byValue, maxRate, discriminatingPower: Math.round((maxRate - minRate) * 100) };
    }

    // ── SDR categorical dimensions ────────────────────────────────────────
    const destino = buildCatStats(d => d.destino || "Não informado");
    const tipoReuniaoSdr = buildCatStats(d => d.como_foi_feita_a_1a_reuniao || "Não informado");
    const sql = buildCatStats(d => d._cf?.[F_SQL_ID] || "Não informado");
    const statusRelacionamento = buildCatStats(d => d.status_do_relacionamento || "Não informado");
    const costumaViajar = buildCatStats(d => boolToStr(d.costumam_viajar));
    const jaFoiDestination = buildCatStats(d => boolToStr(d.ja_foi_destination_wedding));
    const temDestino = buildCatStats(d => boolToStr(d.ja_tem_destino_definido));
    const taxaEnviada = buildCatStats(d => taxaToStr(d._cf?.[F_TAX_SENT_ID]));
    const taxaPaga = buildCatStats(d => taxaToStr(d._cf?.[F_TAX_PAID_ID]));
    const previsaoAssessoria = buildCatStats(d => d.previsao_contratar_assessoria || "Não informado");

    // ── Closer categorical dimensions ─────────────────────────────────────
    const tipoReuniaoCloser = buildCatStats(d => d.tipo_reuniao_closer || "Não informado");
    const fezSegundaReuniao = buildCatStats(d => boolToStr(d.fez_segunda_reuniao));
    const detalhamentoOrcamento = buildCatStats(d => boolToStr(d.apresentado_orcamento));
    const pipeline = buildCatStats(d => d.is_elopement ? "Elopement" : "Wedding");

    // ── Convidados — median of won deals ───────────────────────────────────
    const wonGuests = won.filter(d => d.num_convidados && d.num_convidados > 0).map(d => d.num_convidados!);
    const medianConvidados = median(wonGuests);
    const convidados: DimensionStats = {
        byValue: {},
        maxRate: medianConvidados ? 1 : 0,
        discriminatingPower: medianConvidados ? 30 : 0,
        medianWon: medianConvidados,
    };

    // ── Orçamento — ticket médio por destino from won deals ────────────────
    const ticketMedioPorDestino: Record<string, number> = {};
    const destGrp: Record<string, { sum: number; n: number }> = {};
    for (const d of won) {
        const dest = d.destino || "Geral";
        if (d.valor_fechado_em_contrato && d.valor_fechado_em_contrato > 0) {
            if (!destGrp[dest]) destGrp[dest] = { sum: 0, n: 0 };
            destGrp[dest].sum += d.valor_fechado_em_contrato;
            destGrp[dest].n++;
        }
    }
    let allTicketSum = 0, allTicketN = 0;
    for (const [dest, g] of Object.entries(destGrp)) {
        ticketMedioPorDestino[dest] = Math.round(g.sum / g.n);
        allTicketSum += g.sum; allTicketN += g.n;
    }
    if (allTicketN > 0 && !ticketMedioPorDestino["Geral"]) {
        ticketMedioPorDestino["Geral"] = Math.round(allTicketSum / allTicketN);
    }
    const orcamento: DimensionStats = {
        byValue: {},
        maxRate: 1,
        discriminatingPower: Object.keys(ticketMedioPorDestino).length > 0 ? 25 : 0,
        ticketMedioPorDestino,
    };

    // ── Velocidade — avg days to close ─────────────────────────────────────
    const closeTimes = won
        .filter(d => d.data_fechamento && d.cdate)
        .map(d => daysBetween(d.cdate, d.data_fechamento!))
        .filter(n => n < 1000);
    const avgDaysToClose = closeTimes.length > 0
        ? Math.round(closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length)
        : undefined;
    const velocidade: DimensionStats = {
        byValue: {},
        maxRate: 1,
        discriminatingPower: avgDaysToClose ? 20 : 0,
        avgDaysToClose,
    };

    return {
        destino, tipoReuniaoSdr, sql, statusRelacionamento,
        costumaViajar, jaFoiDestination, temDestino,
        taxaEnviada, taxaPaga, previsaoAssessoria,
        tipoReuniaoCloser, fezSegundaReuniao, detalhamentoOrcamento,
        pipeline, convidados, orcamento, velocidade,
        ticketMedioPorDestino,
        totalResolvidos: resolved.length,
        totalWon: won.length,
    };
}

// ─── Compute Default Weights ──────────────────────────────────────────────────

export function computeDefaultWeights(profiles: ScoreProfiles): ScoreWeights {
    const powers: Record<keyof ScoreWeights, number> = {
        destino: profiles.destino.discriminatingPower,
        tipoReuniaoSdr: profiles.tipoReuniaoSdr.discriminatingPower,
        convidados: profiles.convidados.discriminatingPower,
        orcamento: profiles.orcamento.discriminatingPower,
        sql: profiles.sql.discriminatingPower,
        statusRelacionamento: profiles.statusRelacionamento.discriminatingPower,
        costumaViajar: profiles.costumaViajar.discriminatingPower,
        jaFoiDestination: profiles.jaFoiDestination.discriminatingPower,
        temDestino: profiles.temDestino.discriminatingPower,
        taxaEnviada: profiles.taxaEnviada.discriminatingPower,
        taxaPaga: profiles.taxaPaga.discriminatingPower,
        previsaoAssessoria: profiles.previsaoAssessoria.discriminatingPower,
        tipoReuniaoCloser: profiles.tipoReuniaoCloser.discriminatingPower,
        fezSegundaReuniao: profiles.fezSegundaReuniao.discriminatingPower,
        detalhamentoOrcamento: profiles.detalhamentoOrcamento.discriminatingPower,
        velocidade: profiles.velocidade.discriminatingPower,
        pipeline: profiles.pipeline.discriminatingPower,
    };

    const total = Object.values(powers).reduce((a, b) => a + b, 0);
    if (total === 0) {
        // Fallback: equal weights, summing to 100
        return {
            destino: 7, tipoReuniaoSdr: 6, convidados: 6, orcamento: 6, sql: 6,
            statusRelacionamento: 6, costumaViajar: 6, jaFoiDestination: 6, temDestino: 6,
            taxaEnviada: 5, taxaPaga: 6, previsaoAssessoria: 6,
            tipoReuniaoCloser: 6, fezSegundaReuniao: 6, detalhamentoOrcamento: 6,
            velocidade: 6, pipeline: 6,
        };
    }

    const raw: ScoreWeights = {} as ScoreWeights;
    for (const [key, power] of Object.entries(powers)) {
        (raw as unknown as Record<string, number>)[key] = Math.round(safeDiv(power, total) * 100);
    }
    return raw;
}

// ─── Score a Single Deal ──────────────────────────────────────────────────────

export function scoreDeal(
    deal: WonDeal,
    profiles: ScoreProfiles,
    config: ScoreConfig,
    fieldMap: Record<string, string>
): LeadScore {
    const F_SQL_ID = fieldMap["SQL"] || "custom_field_sql";
    const F_TAX_SENT_ID = fieldMap["Taxa Enviada"] || "custom_field_tax_sent";
    const F_TAX_PAID_ID = fieldMap["Taxa Paga"] || "custom_field_tax_paid";

    // ── Categorical score helper ────────────────────────────────────────────
    function catScore(value: string | null | undefined, stats: DimensionStats): DimensionScore {
        const label = value?.trim() || "Não informado";
        if (stats.maxRate === 0 || Object.keys(stats.byValue).length === 0) {
            return { score: 50, label, detail: "Sem histórico para esta dimensão", hasData: false };
        }
        const entry = stats.byValue[label];
        if (!entry) {
            return { score: 50, label, detail: `"${label}" sem histórico de conversão`, hasData: false };
        }
        const total = entry.won + entry.lost;
        if (total < 2) {
            return { score: 50, label, detail: `"${label}" com dados insuficientes (${total} deal${total !== 1 ? "s" : ""})`, hasData: false };
        }
        const score = Math.round(safeDiv(entry.rate, stats.maxRate) * 100);
        const detail = `"${label}": ${entry.won}/${total} ganhos (${Math.round(entry.rate * 100)}% conversão)`;
        return { score, label, detail, hasData: true };
    }

    // ── Destino ────────────────────────────────────────────────────────────
    const destinoScore = catScore(deal.destino, profiles.destino);

    // ── Tipo Reunião SDR ───────────────────────────────────────────────────
    const tipoReuniaoSdrScore = catScore(deal.como_foi_feita_a_1a_reuniao, profiles.tipoReuniaoSdr);

    // ── SQL ────────────────────────────────────────────────────────────────
    const sqlScore = catScore(deal._cf?.[F_SQL_ID], profiles.sql);

    // ── Status Relacionamento ──────────────────────────────────────────────
    const statusRelScore = catScore(deal.status_do_relacionamento, profiles.statusRelacionamento);

    // ── Booleanos SDR ──────────────────────────────────────────────────────
    const costumaViajarScore = catScore(boolToStr(deal.costumam_viajar), profiles.costumaViajar);
    const jaFoiDestScore = catScore(boolToStr(deal.ja_foi_destination_wedding), profiles.jaFoiDestination);
    const temDestinoScore = catScore(boolToStr(deal.ja_tem_destino_definido), profiles.temDestino);

    // ── Taxa Enviada / Paga ────────────────────────────────────────────────
    const taxaEnviadaScore = catScore(taxaToStr(deal._cf?.[F_TAX_SENT_ID]), profiles.taxaEnviada);
    const taxaPagaScore = catScore(taxaToStr(deal._cf?.[F_TAX_PAID_ID]), profiles.taxaPaga);

    // ── Previsão Assessoria ────────────────────────────────────────────────
    const previsaoScore = catScore(deal.previsao_contratar_assessoria, profiles.previsaoAssessoria);

    // ── Tipo Reunião Closer ────────────────────────────────────────────────
    const tipoReuniaoCloserScore = catScore(deal.tipo_reuniao_closer, profiles.tipoReuniaoCloser);

    // ── Booleanos Closer ───────────────────────────────────────────────────
    const fezSegundaScore = catScore(boolToStr(deal.fez_segunda_reuniao), profiles.fezSegundaReuniao);
    const detalhamentoScore = catScore(boolToStr(deal.apresentado_orcamento), profiles.detalhamentoOrcamento);

    // ── Pipeline ───────────────────────────────────────────────────────────
    const pipelineScore = catScore(deal.is_elopement ? "Elopement" : "Wedding", profiles.pipeline);

    // ── Convidados — proximity to median ───────────────────────────────────
    let convidadosScore: DimensionScore;
    const n = deal.num_convidados;
    const medianN = profiles.convidados.medianWon;
    if (!medianN || !n || n <= 0) {
        convidadosScore = {
            score: 50,
            label: n ? String(n) : "Não informado",
            detail: medianN ? "Número de convidados não informado" : "Sem referência histórica de convidados",
            hasData: false,
        };
    } else {
        const distance = Math.abs(n - medianN) / medianN;
        convidadosScore = {
            score: Math.max(10, Math.round(100 - distance * 100)),
            label: String(n),
            detail: `${n} convidados (mediana dos contratos ganhos: ${Math.round(medianN)})`,
            hasData: true,
        };
    }

    // ── Orçamento — proximity to ticket médio do destino ──────────────────
    let orcamentoScore: DimensionScore;
    const orc = deal.orcamento;
    const dest = deal.destino || "Geral";
    const refTicket = profiles.ticketMedioPorDestino[dest] ?? profiles.ticketMedioPorDestino["Geral"] ?? null;
    if (!refTicket || !orc || orc <= 0) {
        const label = orc ? `R$ ${Math.round(orc).toLocaleString("pt-BR")}` : "Não informado";
        orcamentoScore = {
            score: 50, label,
            detail: refTicket ? "Orçamento não informado" : "Sem ticket de referência para o destino",
            hasData: false,
        };
    } else {
        const ratio = orc / refTicket;
        let score: number;
        if (ratio >= 0.8 && ratio <= 1.5) score = 100;
        else if (ratio < 0.8) score = Math.max(0, Math.round(100 - (0.8 - ratio) * 200));
        else score = Math.max(20, Math.round(100 - (ratio - 1.5) * 80));
        orcamentoScore = {
            score,
            label: `R$ ${Math.round(orc).toLocaleString("pt-BR")}`,
            detail: `Orçamento = ${Math.round(ratio * 100)}% do ticket médio em ${dest} (R$ ${refTicket.toLocaleString("pt-BR")})`,
            hasData: true,
        };
    }

    // ── Velocidade ─────────────────────────────────────────────────────────
    let velocidadeScore: DimensionScore;
    const diasNoFunil = deal.cdate ? daysFrom(deal.cdate) : 0;
    const avgDays = profiles.velocidade.avgDaysToClose;
    if (!avgDays) {
        velocidadeScore = { score: 50, label: `${diasNoFunil}d`, detail: "Sem referência de tempo médio de fechamento", hasData: false };
    } else {
        const ratio = diasNoFunil / avgDays;
        const score = ratio <= 1.0 ? 100 : ratio <= 2.0 ? Math.round(100 - (ratio - 1.0) * 100) : 0;
        velocidadeScore = {
            score: Math.max(0, score),
            label: `${diasNoFunil} dias`,
            detail: `${diasNoFunil} dias no funil (média de fechamento: ${avgDays} dias)`,
            hasData: true,
        };
    }

    // ── Weighted average ───────────────────────────────────────────────────
    const { weights, bands } = config;
    const dimScores: Record<ScoreDimKey, DimensionScore> = {
        destino: destinoScore,
        tipoReuniaoSdr: tipoReuniaoSdrScore,
        convidados: convidadosScore,
        orcamento: orcamentoScore,
        sql: sqlScore,
        statusRelacionamento: statusRelScore,
        costumaViajar: costumaViajarScore,
        jaFoiDestination: jaFoiDestScore,
        temDestino: temDestinoScore,
        taxaEnviada: taxaEnviadaScore,
        taxaPaga: taxaPagaScore,
        previsaoAssessoria: previsaoScore,
        tipoReuniaoCloser: tipoReuniaoCloserScore,
        fezSegundaReuniao: fezSegundaScore,
        detalhamentoOrcamento: detalhamentoScore,
        velocidade: velocidadeScore,
        pipeline: pipelineScore,
    };

    let weightedSum = 0, usedWeight = 0;
    for (const [key, dimScore] of Object.entries(dimScores)) {
        const w = (weights as unknown as Record<string, number>)[key] ?? 0;
        weightedSum += dimScore.score * w;
        usedWeight += w;
    }

    const total = usedWeight > 0 ? Math.round(safeDiv(weightedSum, usedWeight)) : 50;
    const band: ScoreBand = total >= bands.A ? "A" : total >= bands.B ? "B" : total >= bands.C ? "C" : "D";
    const dataCount = Object.values(dimScores).filter(d => d.hasData).length;
    const confidence: "alta" | "média" | "baixa" = dataCount >= 8 ? "alta" : dataCount >= 4 ? "média" : "baixa";

    return { total, band, confidence, dimensions: dimScores };
}

// ─── Score All Deals ──────────────────────────────────────────────────────────

export function scoreDeals(
    deals: WonDeal[],
    profiles: ScoreProfiles,
    config: ScoreConfig,
    fieldMap: Record<string, string>
): ScoredDeal[] {
    const FQ_ID = fieldMap["Motivos de qualificação SDR"] || fieldMap["Motivo de qualificação SDR"] || "custom_field_qual";
    return deals.map(d => {
        const motivoQualificacao = d._cf?.[FQ_ID] || "";
        return {
            ...d,
            score: scoreDeal(d, profiles, config, fieldMap),
            diasNoFunil: d.cdate ? daysFrom(d.cdate) : 0,
            isTraining: motivoQualificacao.includes(TRAINING_MOTIVE_SCORE),
            motivoQualificacao,
        };
    });
}

// ─── Monthly Profile Analysis (Won Deals) ─────────────────────────────────────

export function buildMonthlyProfiles(
    wonDeals: WonDeal[],
    fieldMap: Record<string, string>
): MonthlyProfile[] {
    const F_SOURCE_ID = fieldMap["Fonte"] || "custom_field_source";
    const monthMap = new Map<string, WonDeal[]>();

    for (const d of wonDeals) {
        if (!d.data_fechamento) continue;
        const dt = new Date(d.data_fechamento);
        if (isNaN(dt.getTime())) continue;
        const key = monthKey(dt);
        if (!monthMap.has(key)) monthMap.set(key, []);
        monthMap.get(key)!.push(d);
    }

    return Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, deals]) => {
            const dt = new Date(key + "-01");

            // Single pass over deals for all aggregations
            let receita = 0, valueCount = 0;
            let guestSum = 0, guestCount = 0;
            let tempoSum = 0, tempoCount = 0;
            let elopementCount = 0;
            let orcSum = 0, orcCount = 0;
            const destMap = new Map<string, number>();
            const fonteMap = new Map<string, number>();
            const reunMap = new Map<string, number>();

            for (const d of deals) {
                // Receita
                if (d.valor_fechado_em_contrato && d.valor_fechado_em_contrato > 0) {
                    receita += d.valor_fechado_em_contrato;
                    valueCount++;
                }
                // Destino
                const destKey = d.destino || "Não informado";
                destMap.set(destKey, (destMap.get(destKey) ?? 0) + 1);
                // Fonte
                const f = d._cf?.[F_SOURCE_ID] || d.ww_fonte_do_lead || "Não informado";
                fonteMap.set(f, (fonteMap.get(f) ?? 0) + 1);
                // Convidados
                if (d.num_convidados && d.num_convidados > 0) { guestSum += d.num_convidados; guestCount++; }
                // Tempo de fechamento
                if (d.data_fechamento && d.cdate) {
                    const days = daysBetween(d.cdate, d.data_fechamento);
                    if (days < 1000) { tempoSum += days; tempoCount++; }
                }
                // Elopement
                if (d.is_elopement) elopementCount++;
                // Reunião
                if (d.como_foi_feita_a_1a_reuniao) {
                    reunMap.set(d.como_foi_feita_a_1a_reuniao, (reunMap.get(d.como_foi_feita_a_1a_reuniao) ?? 0) + 1);
                }
                // Orçamento
                if (d.orcamento && d.orcamento > 0) { orcSum += d.orcamento; orcCount++; }
            }

            const ticketMedio = valueCount > 0 ? Math.round(receita / valueCount) : 0;
            const topDestinos = topDist(destMap, deals.length, 4);
            const topFontes = topDist(fonteMap, deals.length, 4);
            const mediaConvidados = guestCount > 0 ? Math.round(guestSum / guestCount) : null;
            const tempoMedio = tempoCount > 0 ? Math.round(tempoSum / tempoCount) : null;
            const pctElopement = Math.round(elopementCount / deals.length * 100);
            const topReuniao = reunMap.size > 0 ? [...reunMap.entries()].sort(([, a], [, b]) => b - a)[0][0] : null;
            const avgOrcamento = orcCount > 0 ? Math.round(orcSum / orcCount) : null;

            return { month: monthLabel(dt), monthKey: key, contratos: deals.length, receita: Math.round(receita), ticketMedio, topDestinos, topFontes, mediaConvidados, tempoMedio, pctElopement, topReuniao, avgOrcamento };
        });
}

// ─── Seasonality ──────────────────────────────────────────────────────────────

export function buildSeasonality(wonDeals: WonDeal[]): SeasonalityData[] {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 2);
    const monthMap = new Map<string, WonDeal[]>();

    for (const d of wonDeals) {
        if (!d.data_fechamento) continue;
        const dt = new Date(d.data_fechamento);
        if (isNaN(dt.getTime()) || dt < cutoff) continue;
        const key = monthKey(dt);
        if (!monthMap.has(key)) monthMap.set(key, []);
        monthMap.get(key)!.push(d);
    }

    return Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, deals]) => {
            const dt = new Date(key + "-01");
            let receita = 0, valueCount = 0;
            const destMap = new Map<string, number>();
            for (const d of deals) {
                if (d.valor_fechado_em_contrato && d.valor_fechado_em_contrato > 0) {
                    receita += d.valor_fechado_em_contrato;
                    valueCount++;
                }
                const destKey = d.destino || "Não informado";
                destMap.set(destKey, (destMap.get(destKey) ?? 0) + 1);
            }
            const ticketMedio = valueCount > 0 ? Math.round(receita / valueCount) : 0;
            const topDestino = destMap.size > 0 ? [...destMap.entries()].sort(([, a], [, b]) => b - a)[0][0] : null;
            return { month: monthLabel(dt), monthKey: key, contratos: deals.length, receita: Math.round(receita), ticketMedio, topDestino };
        });
}

// ─── Closer Monthly Profile (for month comparison) ────────────────────────────

export function buildCloserMonthlyProfiles(
    closerDeals: WonDeal[],
    fieldMap: Record<string, string>,
    wonDeals: WonDeal[] = []
): CloserMonthlyProfile[] {
    const FQ_ID = fieldMap["Motivos de qualificação SDR"] || fieldMap["Motivo de qualificação SDR"] || "custom_field_qual";
    const F_SQL_ID = fieldMap["SQL"] || "custom_field_sql";
    const F_TAX_SENT_ID = fieldMap["Taxa Enviada"] || "custom_field_tax_sent";
    const F_TAX_PAID_ID = fieldMap["Taxa Paga"] || "custom_field_tax_paid";

    // Pre-compute: won deals by closing month and by creation month.
    // We use wonDeals (from fetchWonDealsFromDb) which guarantees data_fechamento is set.
    // Fall back to filtering closerDeals if wonDeals is not provided.
    const wonSource = wonDeals.length > 0 ? wonDeals : closerDeals.filter(d => d.status === "0");
    const wonByCloseMonth = new Map<string, number>();
    const wonByCreationMonth = new Map<string, number>();
    for (const d of wonSource) {
        if (d.data_fechamento) {
            const dt = new Date(d.data_fechamento);
            if (!isNaN(dt.getTime())) {
                const k = monthKey(dt);
                wonByCloseMonth.set(k, (wonByCloseMonth.get(k) ?? 0) + 1);
            }
        }
        if (d.cdate) {
            const dt = new Date(d.cdate);
            if (!isNaN(dt.getTime())) {
                const k = monthKey(dt);
                wonByCreationMonth.set(k, (wonByCreationMonth.get(k) ?? 0) + 1);
            }
        }
    }

    // Group by closer appointment date if available, otherwise by deal creation date.
    // This ensures "November" means "leads scheduled with the Closer in November",
    // not "leads created in AC in November (regardless of when they reached the Closer)".
    const monthMap = new Map<string, { deals: WonDeal[]; byAppointment: boolean[] }>()
    for (const d of closerDeals) {
        const appointmentDate = d.data_horario_agendamento_closer;
        const dateStr = appointmentDate || d.cdate;
        if (!dateStr) continue;
        const dt = new Date(dateStr);
        if (isNaN(dt.getTime())) continue;
        const key = monthKey(dt);
        if (!monthMap.has(key)) monthMap.set(key, { deals: [], byAppointment: [] });
        monthMap.get(key)!.deals.push(d);
        monthMap.get(key)!.byAppointment.push(!!appointmentDate);
    }

    return Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, { deals, byAppointment }]) => {
            const dt = new Date(key + "-01");
            const total = deals.length;

            // Single pass: count status, boolean rates, accumulate sums, build distribution maps
            let won = 0, lost = 0, open = 0;
            let guestSum = 0, guestCount = 0;
            let orcSum = 0, orcCount = 0;
            let sqlCount = 0, costumaViajarCount = 0, jaFoiDestCount = 0, temDestinoCount = 0;
            let taxaEnviadaCount = 0, taxaPagaCount = 0, temDataCasamentoCount = 0;
            let fezSegundaCount = 0, detalhamentoCount = 0, trainingCount = 0;
            let completenessSum = 0;
            let appointmentTrueCount = 0;
            const destMap = new Map<string, number>();
            const relMap = new Map<string, number>();
            const sdrReunMap = new Map<string, number>();
            const prevMap = new Map<string, number>();
            const closerReunMap = new Map<string, number>();

            for (let i = 0; i < total; i++) {
                const d = deals[i];

                // Status counts
                if (d.status === "0") won++;
                else if (d.status === "2") lost++;
                else if (d.status === "1") open++;

                // Appointment flag
                if (byAppointment[i]) appointmentTrueCount++;

                // Convidados
                if (d.num_convidados && d.num_convidados > 0) { guestSum += d.num_convidados; guestCount++; }

                // Orçamento
                if (d.orcamento && d.orcamento > 0) { orcSum += d.orcamento; orcCount++; }

                // Boolean rates
                if ((d._cf?.[F_SQL_ID] || "") === "Sim") sqlCount++;
                if (d.costumam_viajar === true) costumaViajarCount++;
                if (d.ja_foi_destination_wedding === true) jaFoiDestCount++;
                if (d.ja_tem_destino_definido === true) temDestinoCount++;
                if (parseFloat(d._cf?.[F_TAX_SENT_ID] || "0") > 0) taxaEnviadaCount++;
                if (parseFloat(d._cf?.[F_TAX_PAID_ID] || "0") > 0) taxaPagaCount++;
                if (d.previsao_data_casamento) temDataCasamentoCount++;
                if (d.fez_segunda_reuniao === true) fezSegundaCount++;
                if (d.apresentado_orcamento === true) detalhamentoCount++;

                // Training
                if (isTrainingDeal(d, FQ_ID)) trainingCount++;

                // Distribution maps
                const destKey = d.destino || "Não informado";
                destMap.set(destKey, (destMap.get(destKey) ?? 0) + 1);
                const relKey = d.status_do_relacionamento || "Não informado";
                relMap.set(relKey, (relMap.get(relKey) ?? 0) + 1);
                const sdrKey = d.como_foi_feita_a_1a_reuniao || "Não informado";
                sdrReunMap.set(sdrKey, (sdrReunMap.get(sdrKey) ?? 0) + 1);
                const prevKey = d.previsao_contratar_assessoria || "Não informado";
                prevMap.set(prevKey, (prevMap.get(prevKey) ?? 0) + 1);
                const closerKey = d.tipo_reuniao_closer || "Não informado";
                closerReunMap.set(closerKey, (closerReunMap.get(closerKey) ?? 0) + 1);

                // Completeness: count filled key fields per deal
                let filled = 0;
                if (d._cf?.[F_SQL_ID] || "") filled++;
                if (d.status_do_relacionamento !== null && d.status_do_relacionamento !== undefined) filled++;
                if (d.costumam_viajar !== null && d.costumam_viajar !== undefined) filled++;
                if (d.ja_foi_destination_wedding !== null && d.ja_foi_destination_wedding !== undefined) filled++;
                if (d.ja_tem_destino_definido !== null && d.ja_tem_destino_definido !== undefined) filled++;
                if (d.previsao_contratar_assessoria) filled++;
                if (d.destino) filled++;
                completenessSum += filled;
            }

            // Majority vote: if more than half used appointment date, mark as such
            const groupedByAppointment = appointmentTrueCount > total / 2;
            const resolved = won + lost;
            const convRate = resolved > 0 ? Math.round((won / resolved) * 100) : 0;

            const topDestinos = topDist(destMap, total, 5);
            const mediaConvidados = guestCount > 0 ? Math.round(guestSum / guestCount) : null;
            const avgOrcamento = orcCount > 0 ? Math.round(orcSum / orcCount) : null;

            const sqlRate = pctOf(sqlCount, total);
            const costumaViajarRate = pctOf(costumaViajarCount, total);
            const jaFoiDestRate = pctOf(jaFoiDestCount, total);
            const temDestinoRate = pctOf(temDestinoCount, total);
            const taxaEnviadaRate = pctOf(taxaEnviadaCount, total);
            const taxaPagaRate = pctOf(taxaPagaCount, total);
            const temDataCasamentoRate = pctOf(temDataCasamentoCount, total);
            const fezSegundaReuniaoRate = pctOf(fezSegundaCount, total);
            const detalhamentoOrcamentoRate = pctOf(detalhamentoCount, total);

            const topStatusRelacionamento = topDist(relMap, total, 4);
            const topTipoReuniaoSdr = topDist(sdrReunMap, total, 4);
            const topPrevisaoAssessoria = topDist(prevMap, total, 4);
            const topTipoReuniaoCloser = topDist(closerReunMap, total, 4);

            const NUM_KEY_CHECKS = 7;
            const completeness = total > 0
                ? Math.round(completenessSum / (total * NUM_KEY_CHECKS) * 100)
                : 0;

            return {
                monthKey: key, month: monthLabel(dt),
                total, won, lost, open, convRate,
                topDestinos, mediaConvidados, avgOrcamento,
                sqlRate, costumaViajarRate, jaFoiDestRate, temDestinoRate,
                taxaEnviadaRate, taxaPagaRate, temDataCasamentoRate,
                topStatusRelacionamento, topTipoReuniaoSdr, topPrevisaoAssessoria, topTipoReuniaoCloser,
                fezSegundaReuniaoRate, detalhamentoOrcamentoRate, trainingCount,
                completeness, groupedByAppointment,
                fechadosNoMes: wonByCloseMonth.get(key) ?? 0,
                fechadosComDealCriadoNoMes: wonByCreationMonth.get(key) ?? 0,
            };
        });
}

// ─── Funnel Quality Assessment ────────────────────────────────────────────────

export function assessFunnelQuality(
    openDeals: WonDeal[],
    profiles: ScoreProfiles,
    fieldMap: Record<string, string>,
    scoredDeals: ScoredDeal[]
): FunnelQuality {
    if (openDeals.length === 0) {
        return { status: "orange", message: "Sem leads abertos para análise.", avgScore: 0, scoreSummary: [], dimensionAlignment: [] };
    }

    const bands = { A: 0, B: 0, C: 0, D: 0 };
    let totalScore = 0;
    for (const d of scoredDeals) { bands[d.score.band]++; totalScore += d.score.total; }
    const n = scoredDeals.length || 1;
    const avgScore = Math.round(totalScore / n);

    const scoreSummary = [
        { band: "A", count: bands.A, pct: Math.round(bands.A / n * 100), color: "#3DBF8A" },
        { band: "B", count: bands.B, pct: Math.round(bands.B / n * 100), color: "#D4A35A" },
        { band: "C", count: bands.C, pct: Math.round(bands.C / n * 100), color: "#E08C3A" },
        { band: "D", count: bands.D, pct: Math.round(bands.D / n * 100), color: "#E05252" },
    ];

    function openDist(getValue: (d: WonDeal) => string) {
        const map = new Map<string, number>();
        for (const d of openDeals) { const v = getValue(d) || "Não informado"; map.set(v, (map.get(v) ?? 0) + 1); }
        return [...map.entries()].sort(([, a], [, b]) => b - a).slice(0, 5)
            .map(([label, count]) => ({ label, count, pct: Math.round(count / openDeals.length * 100) }));
    }

    function winnerDist(stats: DimensionStats) {
        const totalWon = Object.values(stats.byValue).reduce((s, v) => s + v.won, 0);
        if (totalWon === 0) return [];
        return Object.entries(stats.byValue)
            .filter(([, v]) => v.won > 0)
            .sort(([, a], [, b]) => b.won - a.won).slice(0, 5)
            .map(([label, v]) => ({ label, count: v.won, pct: Math.round(v.won / totalWon * 100) }));
    }

    function alignment(od: { label: string; pct: number }[], wd: { label: string; pct: number }[]) {
        if (!od.length || !wd.length) return 50;
        const top = new Set(wd.slice(0, 3).map(d => d.label));
        return Math.min(100, od.filter(d => top.has(d.label)).reduce((s, d) => s + d.pct, 0));
    }

    const F_SQL_ID = fieldMap["SQL"] || "custom_field_sql";
    const destOpen = openDist(d => d.destino || "Não informado");
    const destWinner = winnerDist(profiles.destino);
    const sqlOpen = openDist(d => d._cf?.[F_SQL_ID] || "Não informado");
    const sqlWinner = winnerDist(profiles.sql);
    const pipeOpen = openDist(d => d.is_elopement ? "Elopement" : "Wedding");
    const pipeWinner = winnerDist(profiles.pipeline);
    const reunOpen = openDist(d => d.como_foi_feita_a_1a_reuniao || "Não informado");
    const reunWinner = winnerDist(profiles.tipoReuniaoSdr);

    const dimensionAlignment = [
        { key: "destino", name: "Destino", alignment: alignment(destOpen, destWinner), openDist: destOpen, winnerDist: destWinner },
        { key: "sql", name: "SQL Qualificado", alignment: alignment(sqlOpen, sqlWinner), openDist: sqlOpen, winnerDist: sqlWinner },
        { key: "tipoReuniaoSdr", name: "Tipo de Reunião", alignment: alignment(reunOpen, reunWinner), openDist: reunOpen, winnerDist: reunWinner },
        { key: "pipeline", name: "Tipo de Casamento", alignment: alignment(pipeOpen, pipeWinner), openDist: pipeOpen, winnerDist: pipeWinner },
    ];

    const pctA = bands.A / n * 100;
    const pctD = bands.D / n * 100;
    let status: "green" | "orange" | "red";
    let message: string;
    if (pctA >= 30 && pctD < 30) { status = "green"; message = `Funil saudável: ${Math.round(pctA)}% dos leads são tier A, score médio ${avgScore}/90.`; }
    else if (pctD >= 50) { status = "red"; message = `Atenção crítica: ${Math.round(pctD)}% dos leads são tier D. Revisar critérios de entrada no funil.`; }
    else { status = "orange"; message = `Funil misto: ${Math.round(pctA)}% tier A, ${Math.round(pctD)}% tier D. Score médio ${avgScore}/90.`; }

    return { status, message, avgScore, scoreSummary, dimensionAlignment };
}

// ─── Simple Score (3 Marketing Fields Only) ──────────────────────────────────

export interface SimpleScoreProfiles {
    destino: DimensionStats;
    ticketMedioPorDestino: Record<string, number>;
    medianConvidados: number | undefined;
    totalResolvidos: number;
    totalWon: number;
}

export interface SimpleDimScore {
    score: number;
    label: string;
    detail: string;
    hasData: boolean;
}

export interface SimpleDealScore {
    total: number;
    band: ScoreBand;
    destino: SimpleDimScore;
    orcamento: SimpleDimScore;
    convidados: SimpleDimScore;
}

export interface SimpleScoredDeal extends WonDeal {
    score: SimpleDealScore;
    diasNoFunil: number;
}

export interface TierConv {
    total: number;
    won: number;
    conv: number;  // won / total * 100 (or 0 if total=0)
}

export interface MonthlyLeadPotential {
    monthKey: string;
    month: string;
    total: number;
    won: number;
    lost: number;
    open: number;
    convResolved: number;  // won / (won + lost) * 100
    convTotal: number;     // won / total * 100
    avgScore: number;
    bandA: number;
    bandB: number;
    bandC: number;
    bandD: number;
    wonDealIds: string[];
    tierConv: Record<"A" | "B" | "C" | "D", TierConv>;
}

export function buildSimpleScoreProfiles(closerDeals: WonDeal[], wonDeals: WonDeal[]): SimpleScoreProfiles {
    // Destino: conversion rate per destination from won + lost in closerDeals (needs both outcomes)
    // Single pass to filter resolved deals (avoids extra .filter() allocation)
    const resolved: WonDeal[] = [];
    for (const d of closerDeals) {
        if (d.status === "0" || d.status === "2") resolved.push(d);
    }
    const byValue: Record<string, ConversionEntry> = {};
    for (const d of resolved) {
        const v = d.destino || "Não informado";
        if (!byValue[v]) byValue[v] = { won: 0, lost: 0, rate: 0 };
        if (d.status === "0") byValue[v].won++;
        else byValue[v].lost++;
    }
    for (const v of Object.keys(byValue)) {
        const e = byValue[v];
        const total = e.won + e.lost;
        e.rate = total >= 2 ? e.won / total : 0;
    }
    const rates = Object.values(byValue).filter(e => (e.won + e.lost) >= 2).map(e => e.rate);
    const maxRate = rates.length > 0 ? Math.max(...rates) : 0;
    const minRate = rates.length > 0 ? Math.min(...rates) : 0;
    const destino: DimensionStats = { byValue, maxRate, discriminatingPower: Math.round((maxRate - minRate) * 100) };

    // Ticket médio and median convidados from ALL historical won deals (no date restriction)
    const ticketMedioPorDestino: Record<string, number> = {};
    const destGrp: Record<string, { sum: number; n: number }> = {};
    for (const d of wonDeals) {
        const dest = d.destino || "Geral";
        if (d.valor_fechado_em_contrato && d.valor_fechado_em_contrato > 0) {
            if (!destGrp[dest]) destGrp[dest] = { sum: 0, n: 0 };
            destGrp[dest].sum += d.valor_fechado_em_contrato;
            destGrp[dest].n++;
        }
    }
    let allSum = 0, allN = 0;
    for (const [dest, g] of Object.entries(destGrp)) {
        ticketMedioPorDestino[dest] = Math.round(g.sum / g.n);
        allSum += g.sum; allN += g.n;
    }
    if (allN > 0) ticketMedioPorDestino["Geral"] = Math.round(allSum / allN);

    const wonGuests = wonDeals.filter(d => d.num_convidados && d.num_convidados > 0).map(d => d.num_convidados!);
    const medianConvidados = median(wonGuests);

    return { destino, ticketMedioPorDestino, medianConvidados, totalResolvidos: resolved.length, totalWon: wonDeals.length };
}

// ─── Fixed-Point Scoring Tables ─────────────────────────────────────────────

const DESTINO_SCORE: Record<string, number> = {
    "Caribe": 30,
    "Nordeste": 20,
    "Mendoza": 10,
    "Europa": 10,
    "Itália": 10,
    "Grécia": 10,
    "Portugal": 10,
    "Toscana": 10,
    "Sicília": 10,
    "Santorini": 10,
    "Amsterdam": 10,
    "Paris": 10,
    "Patagônia": 10,
    "Maldivas": 5,
    "Bali": 5,
};
const DESTINO_SCORE_DEFAULT = 5; // "Outros"

type DestinoGroup = "caribe_nordeste_outros" | "europa" | "mendoza";

const DESTINO_GROUP_MAP: Record<string, DestinoGroup> = {
    "Europa": "europa", "Itália": "europa", "Grécia": "europa",
    "Portugal": "europa", "Toscana": "europa", "Sicília": "europa",
    "Santorini": "europa", "Amsterdam": "europa", "Paris": "europa",
    "Mendoza": "mendoza", "Patagônia": "mendoza",
};

// Convidados score by destination group: [casal, ≤20, 21-50, 51-80, 81-100, 100+]
const CONVIDADOS_SCORE: Record<DestinoGroup, number[]> = {
    caribe_nordeste_outros: [5, 10, 15, 20, 25, 30],
    europa:                 [5, 25, 30, 20, 15, 10],
    mendoza:                [5, 10, 25, 30, 20, 15],
};

function getGuestTierIndex(n: number): number {
    if (n <= 2) return 0;   // apenas casal
    if (n <= 20) return 1;
    if (n <= 50) return 2;
    if (n <= 80) return 3;
    if (n <= 100) return 4;
    return 5;               // 100+
}

const GUEST_TIER_LABELS = ["Apenas casal", "Até 20", "20-50", "51-80", "81-100", "100+"];

function getOrcamentoScore(orc: number): { score: number; label: string } {
    if (orc <= 50000)  return { score: 5,  label: "Até R$ 50 mil" };
    if (orc <= 80000)  return { score: 10, label: "R$ 51-80 mil" };
    if (orc <= 100000) return { score: 15, label: "R$ 81-100 mil" };
    if (orc <= 200000) return { score: 20, label: "R$ 101-200 mil" };
    if (orc <= 500000) return { score: 25, label: "R$ 201-500 mil" };
    return { score: 30, label: "Mais de R$ 500 mil" };
}

export function scoreSimpleDeal(deal: WonDeal, _profiles: SimpleScoreProfiles, bands: ScoreBands): SimpleDealScore {
    // ── Destino (0-30) ─────────────────────────────────────────────────────
    const destiLabel = deal.destino?.trim() || "Não informado";
    let destinoScore: SimpleDimScore;
    if (!deal.destino) {
        destinoScore = { score: 0, label: "Não informado", detail: "Destino não informado", hasData: false };
    } else {
        const s = DESTINO_SCORE[destiLabel] ?? DESTINO_SCORE_DEFAULT;
        destinoScore = { score: s, label: destiLabel, detail: `${destiLabel}: ${s}/30`, hasData: true };
    }

    // ── Orçamento (0-30) ───────────────────────────────────────────────────
    const orc = deal.orcamento;
    let orcScore: SimpleDimScore;
    if (!orc || orc <= 0) {
        orcScore = { score: 0, label: "Não informado", detail: "Orçamento não informado", hasData: false };
    } else {
        const { score: s, label } = getOrcamentoScore(orc);
        orcScore = { score: s, label, detail: `${label}: ${s}/30`, hasData: true };
    }

    // ── Convidados (0-30, varia por grupo de destino) ──────────────────────
    const n = deal.num_convidados;
    let convidadosScore: SimpleDimScore;
    if (!n || n <= 0) {
        convidadosScore = { score: 0, label: "Não informado", detail: "Convidados não informado", hasData: false };
    } else {
        const group: DestinoGroup = (deal.destino && DESTINO_GROUP_MAP[deal.destino]) || "caribe_nordeste_outros";
        const tierIdx = getGuestTierIndex(n);
        const s = CONVIDADOS_SCORE[group][tierIdx];
        const tierLabel = GUEST_TIER_LABELS[tierIdx];
        convidadosScore = { score: s, label: `${n} (${tierLabel})`, detail: `${tierLabel}: ${s}/30`, hasData: true };
    }

    const total = destinoScore.score + orcScore.score + convidadosScore.score;
    const band: ScoreBand = total >= bands.A ? "A" : total >= bands.B ? "B" : total >= bands.C ? "C" : "D";
    return { total, band, destino: destinoScore, orcamento: orcScore, convidados: convidadosScore };
}

export function scoreSimpleDeals(deals: WonDeal[], profiles: SimpleScoreProfiles, bands: ScoreBands): SimpleScoredDeal[] {
    return deals.map(d => ({
        ...d,
        score: scoreSimpleDeal(d, profiles, bands),
        diasNoFunil: d.cdate ? daysFrom(d.cdate) : 0,
    }));
}

export function buildMonthlyLeadPotential(
    deals: WonDeal[],
    profiles: SimpleScoreProfiles,
    bands: ScoreBands
): MonthlyLeadPotential[] {
    const monthMap = new Map<string, WonDeal[]>();
    for (const d of deals) {
        if (!d.cdate) continue;
        const dt = new Date(d.cdate);
        if (isNaN(dt.getTime())) continue;
        const key = monthKey(dt);
        if (!monthMap.has(key)) monthMap.set(key, []);
        monthMap.get(key)!.push(d);
    }

    return Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, deals]) => {
            const dt = new Date(key + "-01");

            // Single pass: score each deal, count status and bands simultaneously
            let won = 0, lost = 0, open = 0;
            let scoreSum = 0;
            const bandCounts = { A: 0, B: 0, C: 0, D: 0 };
            const tierConv: Record<"A" | "B" | "C" | "D", TierConv> = { A: { total: 0, won: 0, conv: 0 }, B: { total: 0, won: 0, conv: 0 }, C: { total: 0, won: 0, conv: 0 }, D: { total: 0, won: 0, conv: 0 } };
            const wonDealIds: string[] = [];

            for (const d of deals) {
                const sc = scoreSimpleDeal(d, profiles, bands);
                scoreSum += sc.total;
                bandCounts[sc.band]++;
                tierConv[sc.band].total++;

                const isWon = !!d.data_fechamento;
                if (isWon) {
                    won++;
                    wonDealIds.push(d.id);
                    tierConv[sc.band].won++;
                } else if (d.status === "2") {
                    lost++;
                } else {
                    open++;
                }
            }

            for (const b of ["A", "B", "C", "D"] as const) {
                tierConv[b].conv = tierConv[b].total > 0 ? Math.round(tierConv[b].won / tierConv[b].total * 100) : 0;
            }

            const resolved = won + lost;
            const convResolved = resolved > 0 ? Math.round(won / resolved * 100) : 0;
            const convTotal = deals.length > 0 ? Math.round(won / deals.length * 100) : 0;
            const avgScore = deals.length > 0 ? Math.round(scoreSum / deals.length) : 0;

            return {
                monthKey: key, month: monthLabel(dt), total: deals.length,
                won, lost, open, convResolved, convTotal, avgScore,
                bandA: bandCounts.A,
                bandB: bandCounts.B,
                bandC: bandCounts.C,
                bandD: bandCounts.D,
                wonDealIds,
                tierConv,
            };
        });
}

export function assessSimpleFunnelQuality(
    openDeals: WonDeal[],
    simpleProfiles: SimpleScoreProfiles,
    scored: SimpleScoredDeal[]
): FunnelQuality {
    if (openDeals.length === 0) {
        return { status: "orange", message: "Sem leads abertos para análise.", avgScore: 0, scoreSummary: [], dimensionAlignment: [] };
    }

    const bands = { A: 0, B: 0, C: 0, D: 0 };
    let totalScore = 0;
    for (const d of scored) { bands[d.score.band]++; totalScore += d.score.total; }
    const n = scored.length || 1;
    const avgScore = Math.round(totalScore / n);

    const scoreSummary = [
        { band: "A", count: bands.A, pct: Math.round(bands.A / n * 100), color: "#3DBF8A" },
        { band: "B", count: bands.B, pct: Math.round(bands.B / n * 100), color: "#D4A35A" },
        { band: "C", count: bands.C, pct: Math.round(bands.C / n * 100), color: "#E08C3A" },
        { band: "D", count: bands.D, pct: Math.round(bands.D / n * 100), color: "#E05252" },
    ];

    // Alignment: destino only (the sole categorical dimension in the simple score)
    const openDestinoMap = new Map<string, number>();
    for (const d of openDeals) {
        const v = d.destino || "Não informado";
        openDestinoMap.set(v, (openDestinoMap.get(v) ?? 0) + 1);
    }
    const openDist = [...openDestinoMap.entries()]
        .sort(([, a], [, b]) => b - a).slice(0, 5)
        .map(([label, count]) => ({ label, count, pct: Math.round(count / openDeals.length * 100) }));

    const totalWon = Object.values(simpleProfiles.destino.byValue).reduce((s, v) => s + v.won, 0);
    const winnerDist = totalWon > 0
        ? Object.entries(simpleProfiles.destino.byValue)
            .filter(([, v]) => v.won > 0)
            .sort(([, a], [, b]) => b.won - a.won).slice(0, 5)
            .map(([label, v]) => ({ label, count: v.won, pct: Math.round(v.won / totalWon * 100) }))
        : [];

    const top3 = new Set(winnerDist.slice(0, 3).map(d => d.label));
    const alignment = openDist.length > 0 && winnerDist.length > 0
        ? Math.min(100, openDist.filter(d => top3.has(d.label)).reduce((s, d) => s + d.pct, 0))
        : 50;

    const dimensionAlignment = [{ key: "destino", name: "Destino", alignment, openDist, winnerDist }];

    const pctA = bands.A / n * 100;
    const pctD = bands.D / n * 100;
    let status: "green" | "orange" | "red";
    let message: string;
    if (pctA >= 30 && pctD < 30) { status = "green"; message = `Funil saudável: ${Math.round(pctA)}% dos leads são tier A, score médio ${avgScore}/90.`; }
    else if (pctD >= 50) { status = "red"; message = `Atenção crítica: ${Math.round(pctD)}% dos leads são tier D. Revisar critérios de captação.`; }
    else { status = "orange"; message = `Funil misto: ${Math.round(pctA)}% tier A, ${Math.round(pctD)}% tier D. Score médio ${avgScore}/90.`; }

    return { status, message, avgScore, scoreSummary, dimensionAlignment };
}
