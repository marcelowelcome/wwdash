import { type FunnelMetrics, type WonDeal } from "./schemas";

// ─── PIPELINE CONSTANTS (shared by OverviewFunnelTable & FunnelMetaTable) ────

export const WW_PIPELINE_IDS = [1, 3, 4, 17, 31];
export const WW_LEADS_PIPELINE_IDS = [1, 3, 4, 12, 17, 31];
export const WW_MQL_PIPELINE_IDS = [1, 3, 4];
export const WW_OUTROS_PIPELINE_IDS = [17, 31]; // Internacional + Outros Desqualificados
export const WW_PIPELINE_NAMES = ["SDR Weddings", "Closer Weddings", "Planejamento Weddings", "WW - Internacional", "Outros Desqualificados | Wedding"];
export const WW_LEADS_PIPELINE_NAMES = [...WW_PIPELINE_NAMES, "Elopment Wedding"];
export const WW_MQL_PIPELINE_NAMES = ["SDR Weddings", "Closer Weddings", "Planejamento Weddings"];
export const WW_OUTROS_PIPELINE_NAMES = ["WW - Internacional", "Outros Desqualificados | Wedding"];

/**
 * Pipelines onde um **contrato WW fechado** pode estar atualmente.
 *
 * **Por que existe uma lista separada para contratos?** Após `data_fechamento`
 * ser preenchida, o deal é movido para um pipeline de **pós-venda** (gestão de
 * convidados, produção, gestão de casamento). Se filtrássemos contratos só por
 * pipelines do funil de aquisição (SDR/Closer/Planejamento), perderíamos a
 * maioria dos deals fechados — eles já saíram desses pipelines.
 *
 * **Validação histórica** (24 meses, ago/2024 → mai/2026):
 *   - Planejamento Weddings: 73 contratos
 *   - Convidados - Michelly: 57
 *   - Convidados: 15
 *   - Produção: 6
 *   - WW - Gestão Casamento: 1
 *   - WW - Gestão Convidados: 1
 *   - Total WW: 152 (vs 73 se filtrasse só por MQL_PIPELINE_NAMES — perda de 52%)
 *
 * **Trips** (`Consultoras TRIPS`, etc.) fica de fora — produto diferente.
 *
 * **Cuidado:** Usar SEMPRE em conjunto com `isClosedWwContract()` (que também
 * exige `data_qualificado` OU `data_closer` preenchido). Sem essa cláusula,
 * deals criados direto num pipeline pós-venda sem passar pelo funil entrariam
 * (raro, mas acontece com `Convidados`).
 *
 * **Não usar `title.startsWith('DW')` como filtro** — o usuário (06/05/2026)
 * rejeitou; é frágil porque o prefixo aparece também em deals classificados
 * por engano em pipelines Trips.
 */
/**
 * Pipelines de **pós-venda WW** — para onde um deal é movido APÓS fechar
 * contrato (gestão de casamento, gestão de convidados, produção). Esses
 * pipelines não fazem parte do funil de aquisição mas continuam sendo WW.
 */
export const WW_POST_SALES_PIPELINE_NAMES = [
    "Convidados",
    "Convidados - Michelly",
    "WW - Gestão Casamento",
    "WW - Gestão Convidados",
    "Produção",
];

/**
 * Union: pipelines de aquisição WW + pós-venda WW + Elopment. Usado por
 * {@link isClosedWwContract}.
 */
export const WW_CONTRACT_PIPELINE_NAMES = [
    ...WW_LEADS_PIPELINE_NAMES, // 5 WW + Elopment
    ...WW_POST_SALES_PIPELINE_NAMES,
];

// Convert to Sets for O(1) lookup (used in tight loops)
const WW_IDS_SET = new Set(WW_PIPELINE_IDS);
const WW_LEADS_IDS_SET = new Set(WW_LEADS_PIPELINE_IDS);
const WW_MQL_IDS_SET = new Set(WW_MQL_PIPELINE_IDS);
const WW_OUTROS_IDS_SET = new Set(WW_OUTROS_PIPELINE_IDS);
const WW_NAMES_SET = new Set(WW_PIPELINE_NAMES);
const WW_LEADS_NAMES_SET = new Set(WW_LEADS_PIPELINE_NAMES);
const WW_MQL_NAMES_SET = new Set(WW_MQL_PIPELINE_NAMES);
const WW_OUTROS_NAMES_SET = new Set(WW_OUTROS_PIPELINE_NAMES);
const WW_POST_SALES_NAMES_SET = new Set(WW_POST_SALES_PIPELINE_NAMES);
const WW_CONTRACT_NAMES_SET = new Set(WW_CONTRACT_PIPELINE_NAMES);

export function isElopement(d: WonDeal): boolean {
    return d.is_elopement === true || d.title?.startsWith("EW") === true || d.pipeline === "Elopment Wedding";
}

export function isInWwPipeline(d: WonDeal): boolean {
    return (d.pipeline_id != null && WW_IDS_SET.has(d.pipeline_id)) || (d.pipeline != null && WW_NAMES_SET.has(d.pipeline));
}

export function isInWwLeadsPipeline(d: WonDeal): boolean {
    return (d.pipeline_id != null && WW_LEADS_IDS_SET.has(d.pipeline_id)) || (d.pipeline != null && WW_LEADS_NAMES_SET.has(d.pipeline));
}

export function isInWwMqlPipeline(d: WonDeal): boolean {
    return (d.pipeline_id != null && WW_MQL_IDS_SET.has(d.pipeline_id)) || (d.pipeline != null && WW_MQL_NAMES_SET.has(d.pipeline));
}

export function isInWwOutrosPipeline(d: WonDeal): boolean {
    return (d.pipeline_id != null && WW_OUTROS_IDS_SET.has(d.pipeline_id)) || (d.pipeline != null && WW_OUTROS_NAMES_SET.has(d.pipeline));
}

/**
 * True se o deal está num pipeline onde **contratos WW fechados** podem
 * residir hoje — inclui funil de aquisição **+ pipelines de pós-venda**.
 *
 * Use junto com {@link isClosedWwContract} para a regra completa. Esta função
 * sozinha NÃO valida que o deal está fechado — só o pipeline.
 *
 * Ver {@link WW_CONTRACT_PIPELINE_NAMES} para o racional e a lista completa.
 */
export function isInWwContractPipeline(d: WonDeal): boolean {
    return d.pipeline != null && WW_CONTRACT_NAMES_SET.has(d.pipeline);
}

/** True se o deal está num pipeline de pós-venda WW (pós data_fechamento). */
export function isInWwPostSalesPipeline(d: WonDeal): boolean {
    return d.pipeline != null && WW_POST_SALES_NAMES_SET.has(d.pipeline);
}

/**
 * True se o deal participa do **funil de venda WW** — está no funil de
 * aquisição (MQL pipelines: SDR/Closer/Planejamento) OU já passou para
 * pós-venda WW (Convidados/Gestão/Produção). Exclui Elopment, Internacional,
 * Desqualificados e qualquer pipeline não-WW.
 *
 * Usar para contar etapas pós-criação (Qualif SDR, Reunião Closer, Contratos)
 * — o pipeline atual pode estar em pós-venda se o deal já fechou.
 *
 * Para Contratos especificamente, prefira {@link isClosedWwContract} que
 * adiciona o sinal de funil (data_qualificado OR data_closer) protegendo
 * contra deals criados direto em pós-venda sem origem no funil.
 */
export function isInWwSalesPipeline(d: WonDeal): boolean {
    if (d.is_elopement === true) return false;
    return isInWwMqlPipeline(d) || isInWwPostSalesPipeline(d);
}

/**
 * True se o deal tem sinal de que **passou pelo funil WW** — `data_qualificado`
 * OU `data_horario_agendamento_closer` preenchido. Usado como proxy de
 * "este deal era um Lead/MQL WW antes de ir para pós-venda".
 */
export function hasWwFunnelSignal(d: WonDeal): boolean {
    return (d.data_qualificado != null && d.data_qualificado !== "") ||
        (d.data_horario_agendamento_closer != null && d.data_horario_agendamento_closer !== "");
}

/**
 * Escopo Lead **estendido** para contagem histórica. Inclui:
 *   - Pipelines de aquisição WW (6: SDR/Closer/Planejamento/Internacional/Desqualif/Elopment)
 *   - **Pipelines de pós-venda WW** se o deal tem sinal de funil
 *     (data_qualificado OR data_closer). Sem o sinal de funil, exclui deals
 *     criados direto em pós-venda sem origem no funil.
 *
 * Usar para "Leads criados no mês X" em retrospectiva — sem esse filtro,
 * Lead/MQL de meses antigos ficam subestimados conforme deals migram para
 * pós-venda.
 */
export function isWwLeadHistoric(d: WonDeal): boolean {
    if (isInWwLeadsPipeline(d)) return true;
    return isInWwPostSalesPipeline(d) && hasWwFunnelSignal(d);
}

/**
 * Escopo MQL **estendido** para contagem histórica. Inclui:
 *   - Pipelines MQL (3: SDR/Closer/Planejamento)
 *   - **Pipelines de pós-venda WW** com sinal de funil
 * Sempre exclui Elopment.
 *
 * Usar para "MQL/Qualif/Reun em retrospectiva". Para Contratos, prefira
 * {@link isClosedWwContract}.
 */
export function isWwMqlHistoric(d: WonDeal): boolean {
    if (d.is_elopement === true) return false;
    if (isInWwMqlPipeline(d)) return true;
    return isInWwPostSalesPipeline(d) && hasWwFunnelSignal(d);
}

/**
 * Regra canônica para **"é um contrato WW fechado"** — usar em todos os KPIs
 * que contam vendas (`Contratos assinados`, CAC, Close Rate, Win Rate, Conv
 * SDR→Closer e qualquer derivado).
 *
 * Requer 3 sinais cumulativos:
 *   1. `data_fechamento` preenchida (fonte de verdade de ganho)
 *   2. `pipeline` em {@link WW_CONTRACT_PIPELINE_NAMES} (whitelist WW;
 *      exclui Trips e linhas de produto não-WW)
 *   3. `data_qualificado` OU `data_closer` preenchida — sinal de que o deal
 *      passou pelo funil WW (protege contra deals criados direto em pipelines
 *      pós-venda sem origem no funil de aquisição)
 *
 * **Por que essa regra existe.** Descobriu-se em 2026-05-06 que o filtro
 * antigo (`pipeline ∈ WW_MQL_PIPELINE_NAMES`) **subestimava contratos em ~67%**
 * historicamente — após fechamento, deals são movidos para pipelines de
 * pós-venda (`Convidados`, `Convidados - Michelly`, `WW - Gestão Convidados`,
 * `Produção`, etc.) e saem do filtro de MQL. Validado: mai/2025 tinha 13
 * contratos fechados (12 WW + 1 Trips), dashboard mostrava 4.
 *
 * **NÃO usar** `title.startsWith('DW')` como filtro — rejeitado pelo usuário
 * (06/05/2026); prefixo é inconsistente.
 *
 * @example
 *   if (isClosedWwContract(deal) && dateInRange(deal.data_fechamento, start, end)) {
 *       contratos++;
 *   }
 */
export function isClosedWwContract(d: WonDeal): boolean {
    if (d.data_fechamento == null || d.data_fechamento === "") return false;
    if (!isInWwContractPipeline(d)) return false;
    const passouFunil = (d.data_qualificado != null && d.data_qualificado !== "")
        || (d.data_horario_agendamento_closer != null && d.data_horario_agendamento_closer !== "");
    return passouFunil;
}

// ─── FORMAT FUNCTIONS ────────────────────────────────────────────────────────

export function formatCurrency(value: number): string {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
}

export function formatPercent(value: number): string {
    return `${value.toFixed(2)}%`;
}

// ─── MONTH PROGRESS ──────────────────────────────────────────────────────────

export function getMonthProgress(selectedYear: number, selectedMonth: number): number {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;

    // Past month = 100%
    if (selectedYear < currentYear || (selectedYear === currentYear && selectedMonth < currentMonth)) {
        return 100;
    }

    // Future month = 0%
    if (selectedYear > currentYear || (selectedYear === currentYear && selectedMonth > currentMonth)) {
        return 0;
    }

    // Current month = actual progress
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const dayOfMonth = today.getDate();
    return (dayOfMonth / daysInMonth) * 100;
}

// ─── CALCULATION FUNCTIONS ───────────────────────────────────────────────────

export function calcConversionRate(from: number, to: number): number {
    if (from === 0) return 0;
    return (to / from) * 100;
}

export function calcAchievement(actual: number, target: number): number {
    if (target === 0) return 0;
    return (actual / target) * 100;
}

export function calcShouldBe(target: number, progressPercent: number): number {
    return Math.round(target * (progressPercent / 100));
}

export function calcFunnelCVR(metrics: FunnelMetrics): Record<string, number> {
    return {
        cvrMql: calcConversionRate(metrics.leads, metrics.mql),
        cvrAg: calcConversionRate(metrics.mql, metrics.agendamento),
        cvrReu: calcConversionRate(metrics.agendamento, metrics.reunioes),
        cvrSql: calcConversionRate(metrics.reunioes, metrics.qualificado),
        cvrRa: calcConversionRate(metrics.qualificado, metrics.closerAgendada),
        cvrRr: calcConversionRate(metrics.closerAgendada, metrics.closerRealizada),
        cvrVenda: calcConversionRate(metrics.closerRealizada, metrics.vendas),
        conversaoTotal: calcConversionRate(metrics.leads, metrics.vendas),
    };
}

// ─── DATE HELPERS ────────────────────────────────────────────────────────────

export function isInMonth(dateStr: string | null | undefined, year: number, month: number): boolean {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    return date.getFullYear() === year && date.getMonth() + 1 === month;
}

export function isCreatedInMonth(cdate: string | null | undefined, year: number, month: number): boolean {
    return isInMonth(cdate, year, month);
}

export function getMonthDateRange(year: number, month: number): { start: Date; end: Date } {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);
    return { start, end };
}

// ─── MONTH NAMES ─────────────────────────────────────────────────────────────

export const MONTHS = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
];

export function getMonthName(month: number): string {
    return MONTHS[month - 1] || "";
}
