import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell
} from "recharts";

// ─── CONFIG ────────────────────────────────────────────────
const API_BASE = "https://welcometrips.api-us1.com/api/3";
const API_KEY  = "3a062a9e9d25bdbab4d27b11ec3245459ff359767eee13d7c233f687a2acafaf8cdf8936";
const SDR_GROUP    = "1";
const CLOSER_GROUP = "3";
const TRAINING_MOTIVE = "Para closer ter mais reuniões";

// ─── PALETTE ───────────────────────────────────────────────
const T = {
  bg: "#0E0A14", surface: "#17101F", card: "#1E1530", border: "#2E2040",
  berry: "#7B2D52", rose: "#C2758A", gold: "#D4A35A", cream: "#F5EDE0",
  muted: "#6B5C7A", red: "#E05252", orange: "#E08C3A", green: "#3DBF8A", white: "#F8F4FF",
};

// ─── API HELPERS ───────────────────────────────────────────
async function apiFetch(path) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Api-Token": API_KEY, "Content-Type": "application/json" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

async function fetchAllDeals(group, daysBack = 180) {
  const after = new Date();
  after.setDate(after.getDate() - daysBack);
  const afterStr = after.toISOString().split("T")[0];
  const all = [];
  let offset = 0;
  let total = Infinity;
  while (all.length < total) {
    const data = await apiFetch(
      `/deals?filters[group]=${group}&filters[created_after]=${afterStr}&limit=100&offset=${offset}&include=dealCustomFieldData`
    );
    const deals = data.deals || [];
    // Attach custom fields to each deal
    const cfMap = {};
    (data.dealCustomFieldData || []).forEach(cf => {
      if (!cfMap[cf.dealId]) cfMap[cf.dealId] = {};
      cfMap[cf.dealId][cf.customFieldId] = cf.fieldValue;
    });
    deals.forEach(d => { d._cf = cfMap[d.id] || {}; });
    all.push(...deals);
    total = parseInt(data.meta?.total || all.length);
    if (deals.length < 100) break;
    offset += 100;
  }
  return all;
}

async function fetchFieldMeta() {
  const data = await apiFetch("/dealCustomFieldMeta?limit=100");
  const map = {};
  (data.dealCustomFieldMeta || []).forEach(f => {
    map[f.fieldLabel] = f.id;
  });
  return map;
}

async function fetchStages() {
  const data = await apiFetch("/dealStages?limit=100");
  const map = {};
  (data.dealStages || []).forEach(s => { map[s.id] = s.title; });
  return map;
}

// ─── DATE HELPERS ──────────────────────────────────────────
const parseDate = s => s ? new Date(s) : null;
const daysSince = (d, ref = new Date()) => d ? Math.floor((ref - d) / 86400000) : 999;
const weekKey = d => {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  const day = dt.getDay();
  const mon = new Date(dt); mon.setDate(dt.getDate() - ((day + 6) % 7));
  return mon.toISOString().split("T")[0];
};
const inRange = (d, s, e) => d && d >= s && d <= e;
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

// ─── ANALYSIS ENGINE ───────────────────────────────────────
function computeMetrics(sdrDeals, closerDeals, fieldMap, stageMap) {
  const today = new Date();

  // Field IDs
  const FQ = fieldMap["Motivos de qualificação SDR"] || fieldMap["Motivo de qualificação SDR"];
  const FL = fieldMap["[WW] [Closer] Motivo de Perda"] || fieldMap["Motivo de Perda"];

  // Filter training deals from Closer
  const closer = closerDeals.filter(d => {
    const mq = d._cf[FQ] || "";
    return mq !== TRAINING_MOTIVE;
  });

  // ── SDR VOLUME TREND (last 9 weeks) ──────────────────────
  const weekCounts = {};
  sdrDeals.forEach(d => {
    const k = weekKey(d.cdate);
    weekCounts[k] = (weekCounts[k] || 0) + 1;
  });
  const sdrWeeks = Object.entries(weekCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-9)
    .map(([k, n]) => {
      const dt = new Date(k);
      const end = new Date(dt); end.setDate(dt.getDate() + 6);
      const label = `${dt.getDate()}/${dt.getMonth()+1}–${end.getDate()}/${end.getMonth()+1}`;
      return { week: label, leads: n, key: k };
    });

  // Current week = last complete Mon–Sun
  const todayDay = today.getDay();
  const lastSunday = new Date(today); lastSunday.setDate(today.getDate() - ((todayDay + 1) % 7) - 1);
  const lastMonday = new Date(lastSunday); lastMonday.setDate(lastSunday.getDate() - 6);
  lastMonday.setHours(0,0,0,0); lastSunday.setHours(23,59,59,999);

  const sdrThisWeek = sdrDeals.filter(d => {
    const cd = parseDate(d.cdate);
    return inRange(cd, lastMonday, lastSunday);
  }).length;

  const prev4weeks = sdrDeals.filter(d => {
    const cd = parseDate(d.cdate);
    const from = daysAgo(56); // 8 weeks ago
    const to = new Date(lastMonday); to.setDate(to.getDate() - 1);
    return inRange(cd, from, to);
  });
  const weeklyVols = {};
  prev4weeks.forEach(d => {
    const k = weekKey(d.cdate);
    weeklyVols[k] = (weeklyVols[k] || 0) + 1;
  });
  const prev4arr = Object.values(weeklyVols).slice(-4);
  const sdrAvg4 = prev4arr.length ? prev4arr.reduce((a,b) => a+b, 0) / prev4arr.length : 0;
  const sdrVsAvg = sdrAvg4 ? (sdrThisWeek / sdrAvg4 * 100) : 0;
  const sdrStatus = sdrVsAvg >= 80 ? "green" : sdrVsAvg >= 60 ? "orange" : "red";

  // ── SDR QUAL RATE ─────────────────────────────────────────
  const closerThisWeek = closer.filter(d => {
    const cd = parseDate(d.cdate);
    return inRange(cd, lastMonday, lastSunday);
  }).length;
  const qualRate = sdrThisWeek > 0 ? (closerThisWeek / sdrThisWeek * 100) : 0;
  const qualStatus = qualRate < 8 || qualRate > 20 ? "red" : qualRate >= 10 ? "green" : "orange";

  // ── CLOSER MM4 CONVERSION ─────────────────────────────────
  const mm4s = daysAgo(28);
  const mm4e = today;
  const mm4prev_s = daysAgo(56);
  const mm4prev_e = daysAgo(28);

  const wonInPeriod = (s, e) => closer.filter(d => {
    const md = parseDate(d.mdate || d.cdate);
    return d.status === "0" && inRange(md, s, e);
  });
  const lostInPeriod = (s, e) => closer.filter(d => {
    const md = parseDate(d.mdate || d.cdate);
    return d.status === "2" && inRange(md, s, e);
  });

  const won_curr = wonInPeriod(mm4s, mm4e);
  const lost_curr = lostInPeriod(mm4s, mm4e);
  const open_curr = closer.filter(d => {
    const cd = parseDate(d.cdate);
    return d.status === "1" && inRange(cd, mm4s, mm4e);
  });
  const conv_curr = (won_curr.length + lost_curr.length) > 0
    ? won_curr.length / (won_curr.length + lost_curr.length) * 100 : 0;

  const won_prev = wonInPeriod(mm4prev_s, mm4prev_e);
  const lost_prev = lostInPeriod(mm4prev_s, mm4prev_e);
  const conv_prev = (won_prev.length + lost_prev.length) > 0
    ? won_prev.length / (won_prev.length + lost_prev.length) * 100 : 0;

  const convStatus = conv_curr < 20 ? "red" : conv_curr < 25 ? "orange" : "green";

  // ── HISTORICAL BENCHMARK ──────────────────────────────────
  const allDecided = closer.filter(d => d.status === "0" || d.status === "2");
  const allWon = closer.filter(d => d.status === "0");
  const histRate = allDecided.length > 0 ? allWon.length / allDecided.length * 100 : 0;

  // ── VELOCITY ──────────────────────────────────────────────
  const enteredMM4 = closer.filter(d => {
    const cd = parseDate(d.cdate);
    return inRange(cd, mm4s, mm4e);
  });
  const decidedMM4 = enteredMM4.filter(d => d.status !== "1");
  const velocity = enteredMM4.length > 0 ? decidedMM4.length / enteredMM4.length * 100 : 0;

  // ── ROLLING 4-WEEK WINDOWS (for trend chart) ──────────────
  const rollingWindows = [
    { label: "MM1", s: daysAgo(112), e: daysAgo(84) },
    { label: "MM2", s: daysAgo(84),  e: daysAgo(56) },
    { label: "MM3", s: daysAgo(56),  e: daysAgo(28) },
    { label: "MM4", s: daysAgo(28),  e: today },
  ];
  const convTrend = rollingWindows.map(w => {
    const w_won = wonInPeriod(w.s, w.e);
    const w_lost = lostInPeriod(w.s, w.e);
    const rate = (w_won.length + w_lost.length) > 0
      ? w_won.length / (w_won.length + w_lost.length) * 100 : 0;
    const sdate = w.s; const edate = w.e;
    const label = `${sdate.getDate()}/${sdate.getMonth()+1}–${edate.getDate()}/${edate.getMonth()+1}`;
    return { periodo: label, taxa: parseFloat(rate.toFixed(1)), won: w_won.length, lost: w_lost.length };
  });

  // ── LOSS REASONS ──────────────────────────────────────────
  const lostMM4 = lost_curr;
  const lossMap = {};
  lostMM4.forEach(d => {
    const m = (d._cf[FL] || "Não informado").trim();
    lossMap[m] = (lossMap[m] || 0) + 1;
  });
  const lossReasons = Object.entries(lossMap)
    .sort(([,a],[,b]) => b - a)
    .slice(0, 8)
    .map(([motivo, n]) => ({
      motivo: motivo.length > 25 ? motivo.slice(0, 23) + "…" : motivo,
      n, pct: parseFloat((n / (lostMM4.length || 1) * 100).toFixed(1))
    }));

  // ── PIPELINE ACTIVE ───────────────────────────────────────
  const openDeals = closer.filter(d => d.status === "1");
  const pipeByAge = [
    { label: "0–14 dias",  n: openDeals.filter(d => daysSince(parseDate(d.cdate)) <= 14).length, status: "green" },
    { label: "15–30 dias", n: openDeals.filter(d => { const a = daysSince(parseDate(d.cdate)); return a > 14 && a <= 30; }).length, status: "orange" },
    { label: "31–60 dias", n: openDeals.filter(d => { const a = daysSince(parseDate(d.cdate)); return a > 30 && a <= 60; }).length, status: "red" },
    { label: "60+ dias",   n: openDeals.filter(d => daysSince(parseDate(d.cdate)) > 60).length, status: "red" },
  ];

  const stageCount = {};
  openDeals.forEach(d => {
    const name = stageMap[d.stage] || `Stage ${d.stage}`;
    stageCount[name] = (stageCount[name] || 0) + 1;
  });
  const pipeByStage = Object.entries(stageCount)
    .sort(([,a],[,b]) => b - a)
    .map(([stage, n]) => ({ stage, n }));

  // ── COHORT ────────────────────────────────────────────────
  const cohortCurr = closer.filter(d => {
    const cd = parseDate(d.cdate);
    return inRange(cd, daysAgo(28), daysAgo(14));
  });
  const cohortPrev = closer.filter(d => {
    const cd = parseDate(d.cdate);
    return inRange(cd, daysAgo(45), daysAgo(28));
  });
  const cohortStats = (cohort) => ({
    total: cohort.length,
    won: cohort.filter(d => d.status === "0").length,
    lost: cohort.filter(d => d.status === "2").length,
    open: cohort.filter(d => d.status === "1").length,
  });
  const coh1 = cohortStats(cohortCurr);
  const coh2 = cohortStats(cohortPrev);
  coh1.rate = (coh1.won + coh1.lost) > 0 ? coh1.won / (coh1.won + coh1.lost) * 100 : 0;
  coh2.rate = (coh2.won + coh2.lost) > 0 ? coh2.won / (coh2.won + coh2.lost) * 100 : 0;

  // ── SDR QUAL WEEKS TREND ──────────────────────────────────
  const sdrQualTrend = sdrWeeks.slice(-5).map(sw => {
    const wStart = new Date(sw.key);
    const wEnd = new Date(sw.key); wEnd.setDate(wEnd.getDate() + 7);
    const closerInWeek = closer.filter(d => {
      const cd = parseDate(d.cdate);
      return inRange(cd, wStart, wEnd);
    }).length;
    const taxa = sw.leads > 0 ? parseFloat((closerInWeek / sw.leads * 100).toFixed(1)) : 0;
    return { week: sw.week, taxa };
  });

  return {
    sdrThisWeek, sdrAvg4: parseFloat(sdrAvg4.toFixed(1)), sdrVsAvg: parseFloat(sdrVsAvg.toFixed(1)), sdrStatus,
    sdrWeeks,
    qualRate: parseFloat(qualRate.toFixed(1)), qualStatus,
    sdrQualTrend,
    closerThisWeek,
    conv_curr: parseFloat(conv_curr.toFixed(1)), conv_prev: parseFloat(conv_prev.toFixed(1)), convStatus,
    convTrend,
    histRate: parseFloat(histRate.toFixed(1)),
    velocity: parseFloat(velocity.toFixed(1)),
    velocityStatus: velocity < 60 ? "red" : velocity < 80 ? "orange" : "green",
    won_curr: won_curr.length, lost_curr: lost_curr.length,
    open_curr: open_curr.length,
    enteredMM4: enteredMM4.length,
    lossReasons,
    openDeals: openDeals.length,
    pipeByAge, pipeByStage,
    coh1, coh2,
    pipelineStatus: openDeals.filter(d => daysSince(parseDate(d.cdate)) > 60).length / (openDeals.length || 1) > 0.3 ? "red" : "orange",
  };
}

// ─── UI HELPERS ────────────────────────────────────────────
const statusColor = s => ({ green: T.green, orange: T.orange, red: T.red }[s] || T.muted);
const statusIcon  = s => ({ green: "●", orange: "◐", red: "○" }[s] || "○");

function KpiCard({ label, value, sub, status, delta }) {
  const c = statusColor(status);
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
      padding: "18px 20px", position: "relative", overflow: "hidden", flex: 1, minWidth: 150 }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: c, borderRadius: "12px 12px 0 0" }} />
      <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.08em",
        textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: T.white,
        fontFamily: "Georgia, serif", letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 5 }}>{sub}</div>}
      {delta && <div style={{ fontSize: 11, color: c, marginTop: 6, fontWeight: 600 }}>{delta}</div>}
      <div style={{ position: "absolute", bottom: 12, right: 14, fontSize: 20, color: c, opacity: 0.7 }}>
        {statusIcon(status)}
      </div>
    </div>
  );
}

function SectionTitle({ children, tag }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <div style={{ width: 4, height: 18, background: T.gold, borderRadius: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: T.white, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {children}
      </span>
      {tag && (
        <span style={{ fontSize: 10, fontWeight: 700, color: T.bg,
          background: tag.includes("CRÍTICO") ? T.red : tag.includes("ATENÇÃO") ? T.orange : T.green,
          borderRadius: 20, padding: "2px 9px", letterSpacing: "0.04em" }}>{tag}</span>
      )}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#231740", border: `1px solid ${T.border}`,
      borderRadius: 8, padding: "10px 14px", fontSize: 12, color: T.cream }}>
      <div style={{ color: T.gold, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}{p.name?.includes("Taxa") || p.name?.includes("taxa") ? "%" : ""}</strong>
        </div>
      ))}
    </div>
  );
};

// ─── MAIN COMPONENT ────────────────────────────────────────
export default function Dashboard() {
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [loadStep, setLoadStep] = useState("Conectando à API…");
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setLoadStep("Buscando configuração de campos…");
      const [fieldMap, stageMap] = await Promise.all([fetchFieldMeta(), fetchStages()]);

      setLoadStep("Carregando leads SDR (últimos 90 dias)…");
      const sdrDeals = await fetchAllDeals(SDR_GROUP, 90);

      setLoadStep("Carregando pipeline Closer (últimos 365 dias)…");
      const closerDeals = await fetchAllDeals(CLOSER_GROUP, 365);

      setLoadStep("Calculando métricas…");
      const m = computeMetrics(sdrDeals, closerDeals, fieldMap, stageMap);
      setMetrics(m);
      setLastUpdate(new Date().toLocaleTimeString("pt-BR"));
    } catch (e) {
      const msg = e.message || String(e);
      if (msg.includes("Failed to fetch") || msg.includes("CORS") || msg.includes("NetworkError")) {
        setError({ type: "cors", msg });
      } else {
        setError({ type: "api", msg });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const tabs = [
    { id: "overview", label: "Visão Geral" },
    { id: "funnel",   label: "Topo do Funil" },
    { id: "closer",   label: "Closer" },
    { id: "pipeline", label: "Pipeline" },
  ];

  // ── HEADER ──────────────────────────────────────────────
  const Header = () => (
    <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "0 28px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        maxWidth: 1200, margin: "0 auto", padding: "16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10,
            background: `linear-gradient(135deg, ${T.berry}, ${T.gold})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 900, color: T.white, fontFamily: "Georgia, serif" }}>WW</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.white }}>Welcome Weddings</div>
            <div style={{ fontSize: 10, color: T.muted }}>Funil de Vendas · Ao Vivo</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {metrics && (
            <>
              <span style={{ background: metrics.convStatus === "red" ? "#3B1515" : "#1A2E1E",
                border: `1px solid ${statusColor(metrics.convStatus)}`, borderRadius: 20,
                padding: "4px 12px", fontSize: 10, fontWeight: 700,
                color: statusColor(metrics.convStatus) }}>
                {metrics.convStatus === "red" ? "🔴" : metrics.convStatus === "orange" ? "🟡" : "🟢"} CLOSER {metrics.conv_curr}%
              </span>
              <span style={{ background: "#1A2E1E", border: `1px solid ${T.green}`,
                borderRadius: 20, padding: "4px 12px", fontSize: 10, fontWeight: 700, color: T.green }}>
                🟢 SDR {metrics.sdrThisWeek} leads
              </span>
            </>
          )}
          <button onClick={loadData} disabled={loading}
            style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8,
              padding: "6px 12px", color: T.muted, fontSize: 11, cursor: "pointer",
              fontFamily: "inherit" }}>
            {loading ? "⟳" : "↺ Atualizar"}
          </button>
          {lastUpdate && <span style={{ fontSize: 10, color: T.muted }}>Atualizado {lastUpdate}</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 2, maxWidth: 1200, margin: "0 auto" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: "transparent", border: "none",
            borderBottom: tab === t.id ? `2px solid ${T.gold}` : "2px solid transparent",
            color: tab === t.id ? T.gold : T.muted,
            padding: "8px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{t.label}</button>
        ))}
      </div>
    </div>
  );

  // ── LOADING ──────────────────────────────────────────────
  if (loading) return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.white,
      fontFamily: "'Trebuchet MS', sans-serif", display: "flex", flexDirection: "column" }}>
      <Header />
      <div style={{ flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 20 }}>
        <div style={{ fontSize: 36, animation: "spin 1s linear infinite" }}>⟳</div>
        <div style={{ fontSize: 14, color: T.muted }}>{loadStep}</div>
        <div style={{ fontSize: 11, color: T.border }}>Conectando ao ActiveCampaign…</div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── ERROR ────────────────────────────────────────────────
  if (error) return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.white,
      fontFamily: "'Trebuchet MS', sans-serif", display: "flex", flexDirection: "column" }}>
      <Header />
      <div style={{ flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
        <div style={{ fontSize: 32 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.red }}>
          {error.type === "cors" ? "Erro de CORS — API bloqueou a requisição do browser" : "Erro ao conectar à API"}
        </div>
        <div style={{ fontSize: 12, color: T.muted, maxWidth: 480, textAlign: "center", lineHeight: 1.7 }}>
          {error.type === "cors"
            ? "O ActiveCampaign não permite chamadas diretas do browser por CORS. Para resolver: (1) publique este código com um proxy reverso simples, ou (2) use o Antigravity para gerar um backend Node/Netlify que faça as chamadas server-side."
            : error.msg}
        </div>
        <button onClick={loadData} style={{ background: T.berry, border: "none", borderRadius: 8,
          padding: "10px 24px", color: T.white, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          Tentar novamente
        </button>
      </div>
    </div>
  );

  if (!metrics) return null;
  const m = metrics;

  // ── OVERVIEW TAB ─────────────────────────────────────────
  const Overview = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <KpiCard label="Leads SDR (sem.)" value={m.sdrThisWeek}
          sub={`Média 4 sem: ${m.sdrAvg4}`} status={m.sdrStatus}
          delta={`${m.sdrVsAvg > 100 ? "▲" : "▼"} ${m.sdrVsAvg.toFixed(0)}% vs média`} />
        <KpiCard label="Taxa Qualificação SDR" value={`${m.qualRate}%`}
          sub="Range ideal: 10–15%" status={m.qualStatus}
          delta={m.qualRate < 10 ? "🔴 Restritiva" : m.qualRate > 20 ? "🔴 Alta demais" : "✓ Normal"} />
        <KpiCard label="Conversão Closer MM4s" value={`${m.conv_curr}%`}
          sub={`Hist. calc: ${m.histRate}%`} status={m.convStatus}
          delta={`${m.conv_curr > m.conv_prev ? "▲" : "▼"} ${Math.abs(m.conv_curr - m.conv_prev).toFixed(1)}pp vs anterior`} />
        <KpiCard label="Velocity do Pipeline" value={`${m.velocity}%`}
          sub="Meta: >60%" status={m.velocityStatus}
          delta={m.velocity >= 60 ? "✓ Deals se movendo" : "🔴 Deals travados"} />
        <KpiCard label="Pipeline Ativo" value={m.openDeals}
          sub={`${m.pipeByStage[0]?.stage || "—"}: ${m.pipeByStage[0]?.n || 0}`}
          status={m.pipelineStatus}
          delta={`${m.won_curr} won · ${m.lost_curr} lost (4 sem)`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
          <SectionTitle tag={`${m.sdrStatus === "green" ? "🟢 SAUDÁVEL" : "🔴 CRÍTICO"}`}>Volume SDR</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={m.sdrWeeks} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={T.gold} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={T.gold} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false}
                angle={-30} textAnchor="end" height={44} />
              <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              {m.sdrAvg4 > 0 && <ReferenceLine y={m.sdrAvg4} stroke={T.rose} strokeDasharray="4 4"
                label={{ value: `Média ${m.sdrAvg4}`, fill: T.rose, fontSize: 9, position: "insideTopLeft" }} />}
              <Area type="monotone" dataKey="leads" name="Leads SDR" stroke={T.gold}
                fill="url(#sg)" strokeWidth={2.5} dot={{ r: 3, fill: T.gold }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
          <SectionTitle tag={m.convStatus === "red" ? "🔴 CRÍTICO" : m.convStatus === "orange" ? "🟡 ATENÇÃO" : "🟢 SAUDÁVEL"}>
            Conversão Closer MM4s
          </SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={m.convTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="periodo" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false}
                angle={-20} textAnchor="end" height={42} />
              <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false}
                tickFormatter={v => v + "%"} domain={[0, Math.max(60, ...m.convTrend.map(d => d.taxa) + 10)]} />
              <Tooltip content={<CustomTooltip />} />
              {m.histRate > 0 && <ReferenceLine y={m.histRate} stroke={T.gold} strokeDasharray="4 4"
                label={{ value: `Hist ${m.histRate}%`, fill: T.gold, fontSize: 9, position: "insideTopLeft" }} />}
              <ReferenceLine y={20} stroke={T.red} strokeDasharray="3 3"
                label={{ value: "20%", fill: T.red, fontSize: 9, position: "insideBottomRight" }} />
              <Bar dataKey="taxa" name="Taxa %" radius={[4,4,0,0]}>
                {m.convTrend.map((d, i) => (
                  <Cell key={i} fill={d.taxa < 20 ? "#A03030" : d.taxa < 25 ? T.orange : T.green} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Alert summary */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
        <SectionTitle>Status Consolidado do Funil</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
          {[
            { label: "Leads SDR", status: m.sdrStatus, val: `${m.sdrThisWeek}` },
            { label: "Qualificação", status: m.qualStatus, val: `${m.qualRate}%` },
            { label: "Conversão", status: m.convStatus, val: `${m.conv_curr}%` },
            { label: "Velocity", status: m.velocityStatus, val: `${m.velocity}%` },
            { label: "Pipeline", status: m.pipelineStatus, val: `${m.openDeals} deals` },
          ].map((item, i) => (
            <div key={i} style={{ background: T.surface, borderRadius: 10,
              border: `1px solid ${statusColor(item.status)}33`,
              padding: "14px", textAlign: "center" }}>
              <div style={{ fontSize: 22, color: statusColor(item.status),
                fontWeight: 800, fontFamily: "Georgia, serif" }}>{item.val}</div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 4, textTransform: "uppercase",
                letterSpacing: "0.06em" }}>{item.label}</div>
              <div style={{ marginTop: 6, fontSize: 16 }}>
                {item.status === "green" ? "🟢" : item.status === "orange" ? "🟡" : "🔴"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── FUNNEL TAB ───────────────────────────────────────────
  const Funnel = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
          <SectionTitle>Volume SDR por Semana</SectionTitle>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={m.sdrWeeks} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="sg2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={T.gold} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={T.gold} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false}
                angle={-35} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              {m.sdrAvg4 > 0 && <ReferenceLine y={m.sdrAvg4} stroke={T.rose} strokeDasharray="4 4"
                label={{ value: `Média: ${m.sdrAvg4}`, fill: T.rose, fontSize: 9, position: "insideTopLeft" }} />}
              <Area type="monotone" dataKey="leads" name="Leads SDR" stroke={T.gold}
                fill="url(#sg2)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
          <SectionTitle>Taxa de Qualificação SDR → Closer</SectionTitle>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={m.sdrQualTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false}
                angle={-25} textAnchor="end" height={46} />
              <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false}
                tickFormatter={v => v + "%"} domain={[0, 30]} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={10} stroke={T.red} strokeDasharray="3 3"
                label={{ value: "Min 10%", fill: T.red, fontSize: 9, position: "insideBottomLeft" }} />
              <ReferenceLine y={15} stroke={T.green} strokeDasharray="3 3"
                label={{ value: "Ideal 15%", fill: T.green, fontSize: 9, position: "insideTopRight" }} />
              <Bar dataKey="taxa" name="Taxa qualificação" radius={[4,4,0,0]}>
                {m.sdrQualTrend.map((d, i) => (
                  <Cell key={i} fill={d.taxa < 10 ? T.red : d.taxa > 20 ? T.orange : T.rose} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
        <SectionTitle>Funil da Semana Atual</SectionTitle>
        <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
          {[
            { label: "Leads SDR", n: m.sdrThisWeek, color: T.gold, sub: "Entradas brutas" },
            { label: "Qualificados", n: m.closerThisWeek, color: T.rose, sub: `${m.qualRate}% de ${m.sdrThisWeek}` },
          ].map((step, i, arr) => (
            <div key={i} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div style={{ flex: 1, padding: "0 4px" }}>
                <div style={{ fontSize: 10, color: T.muted, marginBottom: 6, textTransform: "uppercase",
                  letterSpacing: "0.06em" }}>{step.label}</div>
                <div style={{ height: 52, background: `${step.color}18`,
                  border: `1px solid ${step.color}44`, borderRadius: 8,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 24, fontWeight: 800, color: step.color,
                    fontFamily: "Georgia, serif" }}>{step.n}</span>
                </div>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>{step.sub}</div>
              </div>
              {i < arr.length - 1 && (
                <div style={{ padding: "0 8px", color: T.muted, fontSize: 20 }}>›</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── CLOSER TAB ───────────────────────────────────────────
  const Closer = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 18 }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
          <SectionTitle tag={m.convStatus === "red" ? "🔴 CRÍTICO" : "🟡 ATENÇÃO"}>Conversão — Janelas 4 Semanas</SectionTitle>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={m.convTrend} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: T.muted }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false}
                tickFormatter={v => v + "%"} />
              <Tooltip content={<CustomTooltip />} />
              {m.histRate > 0 && <ReferenceLine y={m.histRate} stroke={T.gold} strokeDasharray="4 4"
                label={{ value: `Histórico ${m.histRate}%`, fill: T.gold, fontSize: 9, position: "insideTopLeft" }} />}
              <ReferenceLine y={20} stroke={T.red} strokeDasharray="3 3"
                label={{ value: "Limite crítico 20%", fill: T.red, fontSize: 9, position: "insideBottomLeft" }} />
              <Bar dataKey="taxa" name="Taxa %" radius={[5,5,0,0]} maxBarSize={70}>
                {m.convTrend.map((d, i) => (
                  <Cell key={i} fill={d.taxa < 20 ? "#A03030" : d.taxa < 25 ? T.orange : T.green} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
          <SectionTitle>Período Atual (28 dias)</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
            {[
              { label: "Entraram no Closer", v: m.enteredMM4, color: T.rose },
              { label: "Fecharam Won", v: m.won_curr, color: T.green },
              { label: "Perdidos Lost", v: m.lost_curr, color: T.red },
              { label: "Ainda Open", v: m.open_curr, color: T.orange },
            ].map((row, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12, color: T.muted }}>
                  <span>{row.label}</span>
                  <span style={{ color: row.color, fontWeight: 700 }}>{row.v}</span>
                </div>
                <div style={{ height: 6, background: T.border, borderRadius: 3 }}>
                  <div style={{ height: "100%", width: `${m.enteredMM4 > 0 ? (row.v / m.enteredMM4) * 100 : 0}%`,
                    background: row.color, borderRadius: 3 }} />
                </div>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12, marginTop: 4,
              display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>Taxa conversão</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: statusColor(m.convStatus),
                fontFamily: "Georgia, serif" }}>{m.conv_curr}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Loss Reasons */}
      {m.lossReasons.length > 0 && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
          <SectionTitle>Motivos de Perda — Últimas 4 Semanas</SectionTitle>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={m.lossReasons} layout="vertical" margin={{ top: 4, right: 50, bottom: 4, left: 130 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: T.muted }} tickLine={false} axisLine={false}
                tickFormatter={v => v + "%"} />
              <YAxis type="category" dataKey="motivo" tick={{ fontSize: 10, fill: T.muted }}
                tickLine={false} axisLine={false} width={125} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="pct" name="Pct %" radius={[0,3,3,0]} barSize={12} fill={T.rose}
                label={{ position: "right", fontSize: 10, fill: T.muted, formatter: v => `${v}%` }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Cohort */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
        <SectionTitle tag={m.coh1.rate < 20 ? "🔴 CRÍTICO" : "🟢 NORMAL"}>Análise de Cohort</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            { label: "Cohort Atual (14–28 dias atrás)", c: m.coh1 },
            { label: "Cohort Anterior (29–45 dias atrás)", c: m.coh2 },
          ].map(({ label, c }, i) => (
            <div key={i} style={{ background: T.surface, borderRadius: 10,
              border: `1px solid ${c.rate < 20 ? T.red : T.border}44`, padding: "16px 18px" }}>
              <div style={{ fontSize: 10, color: T.muted, marginBottom: 10, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
              <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                {[["Won", c.won, T.green], ["Lost", c.lost, T.red], ["Open", c.open, T.orange]].map(([l,v,color]) => (
                  <div key={l} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "Georgia, serif" }}>{v}</div>
                    <div style={{ fontSize: 10, color: T.muted }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: T.muted }}>
                Taxa atual: <span style={{ color: c.rate < 20 ? T.red : T.green, fontWeight: 700 }}>
                  {c.rate.toFixed(1)}%
                </span> ({c.won}/{c.won + c.lost} decididos)
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── PIPELINE TAB ─────────────────────────────────────────
  const Pipeline = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
          <SectionTitle>Por Estágio — {m.openDeals} Deals Abertos</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
            {m.pipeByStage.map((st, i) => {
              const colors = [T.muted, T.rose, T.gold, T.green, T.orange, T.berry];
              const c = colors[i % colors.length];
              return (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
                    <span style={{ color: T.white }}>{st.stage}</span>
                    <span style={{ color: c, fontWeight: 700 }}>{st.n} · {Math.round(st.n / m.openDeals * 100)}%</span>
                  </div>
                  <div style={{ height: 7, background: T.border, borderRadius: 4 }}>
                    <div style={{ height: "100%", width: `${(st.n / (m.pipeByStage[0]?.n || 1)) * 100}%`,
                      background: c, borderRadius: 4 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
          <SectionTitle>Por Idade no Pipeline</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
            {m.pipeByAge.map((ag, i) => {
              const c = statusColor(ag.status);
              return (
                <div key={i} style={{ background: T.surface, borderRadius: 8,
                  border: `1px solid ${c}33`, padding: "12px 16px",
                  display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.white }}>{ag.label}</div>
                    <div style={{ fontSize: 10, color: c, marginTop: 2 }}>
                      {ag.status === "green" ? "alta chance" : ag.status === "orange" ? "maturando" : "baixa chance"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: ag.n === 0 ? T.muted : c,
                      fontFamily: "Georgia, serif" }}>{ag.n}</div>
                    <div style={{ fontSize: 10, color: T.muted }}>
                      {m.openDeals > 0 ? Math.round(ag.n / m.openDeals * 100) : 0}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
        <SectionTitle>Projeção — Próximos 7 Dias</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {(() => {
            const contracts = m.pipeByStage.find(s => s.stage?.toLowerCase().includes("contrato"))?.n || 0;
            const mature = m.pipeByAge.find(a => a.label === "15–30 dias")?.n || 0;
            const best = Math.round(contracts * 0.6 + mature * 0.276);
            const real = Math.round(contracts * 0.4 + mature * 0.2);
            return [
              { label: "Contratos Enviados", n: contracts, proj: Math.round(contracts * 0.6), color: T.green, note: "~60% fecham" },
              { label: "Pipeline Maduro (15–30d)", n: mature, proj: Math.round(mature * 0.25), color: T.gold, note: "~25% fecham" },
              { label: "Total Esperado", n: "–", proj: `${real}–${best}`, color: T.rose, note: "Cenário realista" },
            ].map((p, i) => (
              <div key={i} style={{ background: T.surface, borderRadius: 10,
                border: `1px solid ${p.color}44`, padding: "16px 18px" }}>
                <div style={{ fontSize: 10, color: T.muted, marginBottom: 8, textTransform: "uppercase",
                  letterSpacing: "0.05em" }}>{p.label}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 32, fontWeight: 800, color: p.color,
                    fontFamily: "Georgia, serif" }}>{p.proj}</span>
                  <span style={{ fontSize: 12, color: T.muted }}>fech.</span>
                </div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                  {p.n !== "–" && `${p.n} deals · `}{p.note}
                </div>
              </div>
            ));
          })()}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.white,
      fontFamily: "'Trebuchet MS', 'Lucida Grande', sans-serif" }}>
      <Header />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 28px 48px" }}>
        {tab === "overview"  && <Overview />}
        {tab === "funnel"    && <Funnel />}
        {tab === "closer"    && <Closer />}
        {tab === "pipeline"  && <Pipeline />}
      </div>
    </div>
  );
}
