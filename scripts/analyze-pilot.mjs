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
const itemCodes = Object.keys(itemMeta);
const patternFlags = completed.map((r) => {
  const vals = itemCodes.map((c) => +r[c]).filter((v) => Number.isFinite(v));
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
  const uniq = new Set(vals).size;
  return {
    id: r.participant_id.slice(0, 8),
    elapsed: +r.elapsed_sec,
    sd60: +sd.toFixed(3),
    uniqueAnswers: uniq,
    // 直选/低变异：跨 60 题 SD < 0.6 视为疑似不加区分作答
    lowVariance: sd < 0.6,
    // 极快完成：< 90 秒答完 60 题（约 <1.5s/题）
    veryFast: +r.elapsed_sec < 90,
  };
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
};

console.log(JSON.stringify(out, null, 2));
