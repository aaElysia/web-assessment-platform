// 试点数据分析脚本（Deliverable D 支撑）
//
// 用法：node scripts/analyze-pilot.mjs [rawCsv] [exportCsv]
// 默认读取用户导出的两份 CSV。
//
// 设计原则（与项目「独立复核」方法论一致）：
//   不信任任何「程序预计算」的维度分，而是从 raw 逐题原始分 + 题库配置
//   独立重算，再与 export CSV 的预计算值对账，确认评分口径一致。

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RAW = process.argv[2] ?? "C:/Users/dell/Downloads/assessment-raw-2026-09-13.csv";
const EXP = process.argv[3] ?? "C:/Users/dell/Downloads/assessment-export-2026-09-13.csv";

const LIKERT = 5;

// ---- 题库：itemCode -> { scaleKey, domainKey, reverse } ----
const bank = JSON.parse(readFileSync(resolve(process.cwd(), "data", "question-bank.json"), "utf-8"));
const itemMeta = {};
const itemToDomain = {};
for (const s of bank.scales) {
  for (const d of s.domains) for (const code of d.itemIds) itemToDomain[code] = d.key;
  for (const it of s.items) {
    itemMeta[it.id] = { scaleKey: s.key, domainKey: itemToDomain[it.id], reverse: !!it.reverse };
  }
}
const domainDefs = {};
for (const s of bank.scales) {
  domainDefs[s.key] = s.domains.map((d) => ({ key: d.key, items: d.itemIds }));
}
const compositeOf = {};
for (const s of bank.scales) if (s.composite) compositeOf[s.key] = s.composite.key;

function recode(v, reverse) {
  return reverse ? LIKERT + 1 - v : v;
}

// ---- CSV 解析（简单场景：无字段内逗号/引号） ----
function parseCsv(text) {
  const lines = text.replace(/^﻿/, "").trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const rows = lines.slice(1).map((l) => {
    const cells = l.split(",");
    const o = {};
    header.forEach((h, i) => (o[h] = cells[i]));
    return o;
  });
  return { header, rows };
}

const raw = parseCsv(readFileSync(RAW, "utf-8"));
const exp = parseCsv(readFileSync(EXP, "utf-8"));

// ---- 从 raw 独立重算维度分 ----
function recompute(row) {
  const scales = {};
  for (const [scaleKey, domains] of Object.entries(domainDefs)) {
    const domainScores = {};
    for (const d of domains) {
      const vals = d.items.map((code) => {
        const raw = row[code];
        if (raw === undefined || raw === "" || !Number.isFinite(+raw)) return null;
        return recode(+raw, itemMeta[code].reverse);
      }).filter((v) => v !== null);
      domainScores[d.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
    // 合成指数（仅 ai_adoption）：五域等权，CN 在域级反转一次
    let composite = null;
    const compKey = compositeOf[scaleKey];
    if (compKey) {
      const fav = ["PU", "TR", "WA", "LA"].map((k) => domainScores[k]).filter((v) => v !== null);
      const cn = domainScores["CN"];
      if (fav.length === 4 && cn !== null) {
        composite = (fav.reduce((a, b) => a + b, 0) + (LIKERT + 1 - cn)) / 5;
      }
    }
    scales[scaleKey] = { domains: domainScores, composite };
  }
  return scales;
}

const completed = raw.rows.filter((r) => r.status === "completed");
const rec = {};
for (const r of completed) rec[r.participant_id] = recompute(r);

// ---- 与 export 预计算值对账（取交集） ----
const expById = {};
for (const r of exp.rows) if (r.status === "completed") expById[r.participant_id] = r;
const domainCols = ["O", "C", "E", "A", "N", "PU", "TR", "WA", "LA", "CN", "ai_adoption_index"];
let maxDiff = 0;
const diffDetail = [];
for (const id of Object.keys(rec)) {
  const e = expById[id];
  if (!e) continue;
  for (const col of domainCols) {
    const a = rec[id].ai_adoption?.domains[col] ?? rec[id].big_five?.domains[col] ?? (col === "ai_adoption_index" ? rec[id].ai_adoption?.composite : null);
    const b = e[col] === "" ? null : +e[col];
    if (a === null || b === null) continue;
    const d = Math.abs(a - b);
    if (d > maxDiff) maxDiff = d;
    if (d > 1e-3) diffDetail.push({ id: id.slice(0, 8), col, recomputed: a.toFixed(4), exported: b.toFixed(4), diff: d.toFixed(4) });
  }
}

// ---- 描述统计（10 名完成者） ----
function desc(arr) {
  const n = arr.length;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
  return { n, mean: +mean.toFixed(3), sd: sd === null ? null : +sd.toFixed(3), min: +Math.min(...arr).toFixed(3), max: +Math.max(...arr).toFixed(3) };
}
const allDomainStats = {};
for (const scaleKey of Object.keys(domainDefs)) {
  for (const d of domainDefs[scaleKey]) {
    const vals = Object.values(rec).map((s) => s[scaleKey].domains[d.key]).filter((v) => v !== null);
    allDomainStats[`${scaleKey}.${d.key}`] = desc(vals);
  }
}
const idxVals = Object.values(rec).map((s) => s.ai_adoption.composite).filter((v) => v !== null);
allDomainStats["ai_adoption.ai_adoption_index"] = desc(idxVals);

// ---- 人口学 ----
function tally(key) {
  const m = {};
  for (const r of completed) m[r[key]] = (m[r[key]] ?? 0) + 1;
  return m;
}

// ---- 完成率 / 耗时 ----
const started = new Set([...raw.rows.map((r) => r.participant_id), ...exp.rows.map((r) => r.participant_id)]);
const abandoned = [...exp.rows.filter((r) => r.status !== "completed" && !completed.find((c) => c.participant_id === r.participant_id)).map((r) => r.participant_id)];
const elapsed = completed.map((r) => +r.elapsed_sec).filter((v) => Number.isFinite(v));
const elapsedStats = desc(elapsed);

// ---- 异常应答模式 ----
function domainSd(vals) {
  if (vals.length < 2) return 0;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / (vals.length - 1));
}
// 周期循环检测（按相位众数建模板，对「模式晚开始」稳健）：p∈{2,3,4,6,8} 且匹配率≥0.9
function detectCyclic(vals) {
  const n = vals.length;
  for (const p of [2, 3, 4, 6, 8]) {
    if (p >= n / 2) continue;
    const buckets = Array.from({ length: p }, () => ({}));
    for (let i = 0; i < n; i++) { const v = vals[i]; buckets[i % p][v] = (buckets[i % p][v] || 0) + 1; }
    const tpl = buckets.map((b) => { let best = null, bc = -1; for (const k in b) if (b[k] > bc) { bc = b[k]; best = +k; } return best; });
    let match = 0; for (let i = 0; i < n; i++) if (vals[i] === tpl[i % p]) match++;
    if (match / n >= 0.9) return p;
  }
  return 0;
}
// 严格交替检测：相邻差符号变化率 >0.85（如 4,2,4,2…）
function signChangeRate(vals) {
  let changes = 0, pairs = 0;
  for (let i = 1; i < vals.length - 1; i++) {
    const d1 = vals[i] - vals[i - 1];
    const d2 = vals[i + 1] - vals[i];
    if (d1 !== 0 && d2 !== 0) { pairs++; if (Math.sign(d1) !== Math.sign(d2)) changes++; }
  }
  return pairs ? changes / pairs : 0;
}

const itemCodes = Object.keys(itemMeta);
const patternFlags = completed.map((r) => {
  const vals = itemCodes.map((c) => +r[c]).filter((v) => Number.isFinite(v));
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
  const uniq = new Set(vals).size;
  // 维度级平坦：仅以 8 题的大五维度为判定依据（sd<0.05 即近常量直线）；
  // 4 题的 AI 子量表全同较常见，不计入主计数（边界案例在文中单列）。
  let flatDomains = 0;
  const flatList = [];
  for (const scaleKey of Object.keys(domainDefs)) {
    for (const d of domainDefs[scaleKey]) {
      if (d.items.length < 8) continue;
      const dv = d.items.map((c) => recode(+r[c], itemMeta[c].reverse));
      if (domainSd(dv) < 0.05) { flatDomains++; flatList.push(`${scaleKey}.${d.key}`); }
    }
  }
  let maxRun = 1, run = 1;
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] === vals[i - 1]) { run++; maxRun = Math.max(maxRun, run); } else run = 1;
  }
  const cyclicP = detectCyclic(vals);
  const altRate = +signChangeRate(vals).toFixed(3);
  return {
    id: r.participant_id.slice(0, 8),
    elapsed: +r.elapsed_sec,
    sd60: +sd.toFixed(3),
    uniqueAnswers: uniq,
    flatDomains,
    flatList,
    maxSameRun: maxRun,
    cyclic: cyclicP,
    alternatingRate: altRate,
    veryFast: +r.elapsed_sec < 90,
  };
});
// 综合判定：极速 + 维度直线 + 周期循环 + 严格交替，任一即视为「疑似低投入/机械作答」
const anomalous = patternFlags
  .filter((p) => p.veryFast || p.flatDomains >= 1 || p.cyclic > 0 || p.alternatingRate > 0.85)
  .map((p) => {
    const reasons = [];
    if (p.veryFast) reasons.push(`极速完成(${p.elapsed}s)`);
    if (p.flatDomains >= 1) reasons.push(`维度直线(${p.flatList.join(",")})`);
    if (p.cyclic > 0) reasons.push(`周期${p.cyclic}严格循环`);
    if (p.alternatingRate > 0.85) reasons.push(`严格交替(符号变化率${p.alternatingRate})`);
    return { id: p.id, reasons };
  });

// ---- Cronbach α（逐维度，n=10，仅作小样本参考） ----
function cronbachAlpha(scaleKey, domainKey) {
  const codes = domainDefs[scaleKey].find((d) => d.key === domainKey).items;
  const matrix = completed.map((r) => codes.map((c) => recode(+r[c], itemMeta[c].reverse)));
  const k = codes.length;
  const itemVars = codes.map((_, j) => {
    const col = matrix.map((row) => row[j]);
    const m = col.reduce((a, b) => a + b, 0) / col.length;
    return col.reduce((a, b) => a + (b - m) ** 2, 0) / (col.length - 1);
  });
  const totalScores = matrix.map((row) => row.reduce((a, b) => a + b, 0));
  const totalVar = (() => {
    const m = totalScores.reduce((a, b) => a + b, 0) / totalScores.length;
    return totalScores.reduce((a, b) => a + (b - m) ** 2, 0) / (totalScores.length - 1);
  })();
  const sumItemVar = itemVars.reduce((a, b) => a + b, 0);
  const alpha = (k / (k - 1)) * (1 - sumItemVar / totalVar);
  return +alpha.toFixed(3);
}
const alpha = {};
for (const scaleKey of Object.keys(domainDefs)) {
  for (const d of domainDefs[scaleKey]) alpha[`${scaleKey}.${d.key}`] = cronbachAlpha(scaleKey, d.key);
}

const out = {
  counts: {
    started: started.size,
    completed: completed.length,
    abandoned: abandoned.map((id) => id.slice(0, 8)),
    completionRate: +(completed.length / started.size).toFixed(3),
  },
  exportVsRawDiscrepancy: {
    rawCompleted: completed.length,
    exportCompleted: Object.keys(expById).length,
    note: "两份导出非同一时刻生成；raw 为最新且完整（含 4 名 export 缺失的已完成者），故以 raw 为分析基准。",
  },
  scoreReconciliation: { maxAbsDiff: +maxDiff.toFixed(4), mismatches: diffDetail },
  domainStats: allDomainStats,
  cronbachAlpha: alpha,
  demographics: {
    age_range: tally("age_range"),
    gender: tally("gender"),
    education: tally("education"),
  },
  elapsedSec: elapsedStats,
  patternFlags: patternFlags,
  anomalySummary: {
    flaggedCount: anomalous.length,
    totalCompleted: completed.length,
    flaggedRate: +(anomalous.length / completed.length).toFixed(3),
    flagged: anomalous,
  },
};

console.log(JSON.stringify(out, null, 2));
