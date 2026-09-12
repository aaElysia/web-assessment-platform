#!/usr/bin/env node
/**
 * 独立评分交叉验证（Excel 交叉验证的工程化版本）
 * ============================================
 *
 * 目的：回答「程序算的维度分到底对不对」。
 *
 * 关键设计：**本脚本刻意不 import 项目的任何代码**，包括
 * `src/lib/scoring/*`。评分口径（反向重编码、缺失策略、合成指数）
 * 在下面以最朴素的方式**重新实现一遍**，然后：
 *
 *   通道 A（程序输出）：HTTP 取 `/api/admin/export?format=csv`（维度分）
 *   通道 B（独立重算）：HTTP 取 `/api/admin/export?format=raw`（逐题原始分）
 *                       → 用本脚本自己的实现算维度分
 *   对账              ：逐格比较 A 与 B，容差 1e-4
 *
 * 若两边共用同一份实现，「验证」就退化成「用程序的结果验证程序」，
 * 那样即使评分口径整体错掉也照样全绿——所以这里必须重写一遍。
 *
 * 唯一共享的是**题库配置** `data/question-bank.json`：题目归属哪个维度、
 * 哪些题反向，属于「数据」而非「实现」，必须共享（否则无从得知）。
 *
 * 用法：
 *   npm run verify:scoring
 *   BASE_URL=http://localhost:3000 node scripts/verify-scoring.mjs
 *
 * 退出码：0 = 全部一致；1 = 存在差异或脚本错误；2 = 数据不足，未能完成验证。
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const TOL = 1e-4; // 引擎按 4 位小数输出，容差取其一半以上即可

// ---------------------------------------------------------------------------
// 极小的 CSV 解析（RFC 4180 子集：支持引号、转义引号、CRLF）
// 不引入第三方依赖，避免「验证工具本身依赖了未验证的库」。
// ---------------------------------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // 忽略：CRLF 的 CR 由 LF 处理
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toObjects(rows) {
  if (rows.length === 0) return { header: [], records: [] };
  const header = rows[0];
  const records = rows
    .slice(1)
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
  return { header, records };
}

// ---------------------------------------------------------------------------
// 独立实现的评分口径（**不引用 src/lib/scoring**）
//
// 口径来源：docs/assessment-framework.md 与题库 meta.scoring 声明。
//  1. 反向题重编码：recoded = (likertScale + 1) - raw
//  2. 维度分 = 该维度内 recoded 的算术平均
//     缺失 1 题 → 用已答题目的均值（数学上等于直接取均值）
//     缺失 > 1 题或无有效作答 → 不可用（null，不猜测）
//  3. AI 采纳指数 = ( mean(PU,TR,WA,LA) + ((likertScale+1) - CN) ) / 2
//     任一子维度不可用 → 整体不可用
// ---------------------------------------------------------------------------
function scoreIndependent(answers, bank) {
  const likert = bank.meta.likert.scale;
  const reverseOf = {};
  for (const s of bank.scales) for (const it of s.items) reverseOf[it.id] = it.reverse;

  const domainScores = {};
  let answeredTotal = 0;
  let itemTotal = 0;
  const validCodes = new Set(Object.keys(reverseOf));

  for (const s of bank.scales) {
    for (const d of s.domains) {
      const recoded = [];
      let missing = 0;
      for (const id of d.itemIds) {
        const raw = answers[id];
        if (raw === undefined || raw === null || Number.isNaN(raw)) {
          missing++;
          continue;
        }
        recoded.push(reverseOf[id] ? likert + 1 - raw : raw);
      }
      const score =
        recoded.length === 0 || missing > 1
          ? null
          : recoded.reduce((a, b) => a + b, 0) / recoded.length;
      domainScores[d.key] = score;
    }
  }

  for (const code of Object.keys(answers)) {
    if (validCodes.has(code)) answeredTotal++;
  }
  for (const s of bank.scales) itemTotal += s.items.length;

  let composite = null;
  const positive = ["PU", "TR", "WA", "LA"];
  const hasAll =
    positive.every((k) => typeof domainScores[k] === "number") &&
    typeof domainScores.CN === "number";
  if (hasAll) {
    const posAvg =
      positive.reduce((a, k) => a + domainScores[k], 0) / positive.length;
    composite = (posAvg + (likert + 1 - domainScores.CN)) / 2;
  }

  return { domainScores, composite, answeredTotal, itemTotal };
}

// ---------------------------------------------------------------------------
// 环境与网络
// ---------------------------------------------------------------------------
function readEnvFile() {
  const out = {};
  try {
    const raw = readFileSync(resolve(ROOT, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* 无 .env：回落到默认凭据 */
  }
  return out;
}

function unauthorizedHint(status) {
  return status === 401
    ? "（401：请确认 .env 中 ADMIN_USERNAME / ADMIN_PASSWORD 与运行中的服务一致）"
    : "";
}

async function login() {
  const env = readEnvFile();
  const username = process.env.ADMIN_USERNAME || env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || env.ADMIN_PASSWORD || "change-me-in-prod";
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(`登录失败：HTTP ${res.status} ${unauthorizedHint(res.status)}`);
  }
  const setCookie = res.headers.get("set-cookie") || "";
  const token = setCookie.match(/admin_session=([^;]*)/)?.[1];
  if (!token) throw new Error("登录成功但未取得 admin_session cookie");
  return `admin_session=${token}`;
}

async function fetchCsv(path, cookie) {
  const res = await fetch(BASE + path, { headers: { cookie } });
  if (!res.ok) {
    throw new Error(`GET ${path} → HTTP ${res.status} ${unauthorizedHint(res.status)}`);
  }
  // 注意：不要用 res.text() —— 按 WHATWG 规范它会**剥离 BOM**，
  // 而 BOM 恰恰是这里要校验的事实之一。用原始字节自行解码。
  const buf = Buffer.from(await res.arrayBuffer());
  const hasBom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const text = buf.toString("utf8").replace(/^\uFEFF/, "");
  return { text, hasBom };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

function fmt(x) {
  return x === null || x === undefined ? "" : Number(x).toFixed(4);
}

async function main() {
  console.log(`\n=== 独立评分交叉验证 against ${BASE} ===\n`);

  const bank = JSON.parse(readFileSync(resolve(ROOT, "data", "question-bank.json"), "utf8"));
  const domainKeys = bank.scales.flatMap((s) => s.domains.map((d) => d.key));
  const compositeKey = bank.scales.find((s) => s.composite)?.composite?.key;
  const likert = bank.meta.likert.scale;
  console.log(
    `题库：${bank.scales.length} 个量表 / ${domainKeys.length} 个维度 / ` +
      `${bank.scales.reduce((a, s) => a + s.items.length, 0)} 道题（${likert} 点制）`
  );

  // [1] 鉴权
  console.log("\n[1] 取得管理端会话");
  const cookie = await login();
  check("登录成功并取得会话 cookie", cookie.length > 20);

  // [2] 取两个通道的数据
  console.log("\n[2] 取数：程序输出的维度分（csv）与逐题原始作答（raw）");
  const progCsv = await fetchCsv("/api/admin/export?format=csv", cookie);
  const rawCsv = await fetchCsv("/api/admin/export?format=raw", cookie);
  check("两个导出文件均以 UTF-8 BOM 开头（Excel 中文列名不乱码）", progCsv.hasBom && rawCsv.hasBom);

  const prog = toObjects(parseCsv(progCsv.text));
  const raw = toObjects(parseCsv(rawCsv.text));
  check(
    "raw 表头含全部题目列（每列一道题）",
    bank.scales.every((s) => s.items.every((it) => raw.header.includes(it.id))),
    `共 ${raw.header.length} 列`
  );

  const rawByPid = new Map(raw.records.map((r) => [r.participant_id, r]));
  const answeredRows = raw.records.filter((r) => r.completed_at);
  console.log(
    `  参与者 ${raw.records.length} 人，其中已完成 ${answeredRows.length} 人`
  );

  check(
    "csv 与 raw 的行数一致（同一批参与者）",
    prog.records.length === raw.records.length,
    `csv=${prog.records.length} raw=${raw.records.length}`
  );

  if (raw.records.length === 0) {
    console.log("\n⚠️  没有任何参与者数据：无法完成交叉验证。");
    console.log("   请先造数据（完成一次测评）后重跑。\n");
    process.exit(2);
  }

  // [3] 逐格对账
  console.log("\n[3] 逐格对账（独立重算 vs 程序输出，容差 1e-4）");
  const mismatches = [];
  const rowsForExcel = [];
  const missingIndep = [];
  let compared = 0;

  for (const r of raw.records) {
    const pid = r.participant_id;
    const answers = {};
    let any = false;
    for (const it of bank.scales.flatMap((s) => s.items)) {
      const v = r[it.id];
      if (v === undefined || v === "") continue;
      answers[it.id] = Number(v);
      any = true;
    }

    const indep = any ? scoreIndependent(answers, bank) : null;
    const progRow = prog.records.find((p) => p.participant_id === pid);
    if (!progRow) {
      mismatches.push({ pid, field: "(row)", detail: "raw 有此人但 csv 没有" });
      continue;
    }

    const outRow = { participant_id: pid, status: r.status };

    for (const key of domainKeys) {
      const indepVal = indep ? indep.domainScores[key] : null;
      const progRaw = progRow[key];
      const progVal = progRaw === "" || progRaw === undefined ? null : Number(progRaw);

      outRow[`${key}_indep`] = fmt(indepVal);
      outRow[`${key}_prog`] = fmt(progVal);
      outRow[`${key}_diff`] =
        indepVal === null || progVal === null
          ? indepVal === progVal
            ? ""
            : "空值不一致"
          : Math.abs(indepVal - progVal) <= TOL
            ? ""
            : (indepVal - progVal).toFixed(6);

      compared++;
      if (indepVal === null && progVal === null) continue;
      if (indepVal === null || progVal === null) {
        mismatches.push({ pid, field: key, detail: `一边为空：indep=${fmt(indepVal)} prog=${fmt(progVal)}` });
      } else if (Math.abs(indepVal - progVal) > TOL) {
        mismatches.push({ pid, field: key, detail: `indep=${indepVal} prog=${progVal}` });
      }
      if (indepVal === null) missingIndep.push(`${pid}/${key}`);
    }

    if (compositeKey) {
      const indepVal = indep ? indep.composite : null;
      const progRaw = progRow[compositeKey];
      const progVal = progRaw === "" || progRaw === undefined ? null : Number(progRaw);
      outRow[`${compositeKey}_indep`] = fmt(indepVal);
      outRow[`${compositeKey}_prog`] = fmt(progVal);
      outRow[`${compositeKey}_diff`] =
        indepVal === null || progVal === null
          ? indepVal === progVal
            ? ""
            : "空值不一致"
          : Math.abs(indepVal - progVal) <= TOL
            ? ""
            : (indepVal - progVal).toFixed(6);
      compared++;
      if (indepVal !== null && progVal !== null && Math.abs(indepVal - progVal) > TOL) {
        mismatches.push({ pid, field: compositeKey, detail: `indep=${indepVal} prog=${progVal}` });
      }
      if ((indepVal === null) !== (progVal === null)) {
        mismatches.push({ pid, field: compositeKey, detail: `空值不一致 indep=${fmt(indepVal)} prog=${fmt(progVal)}` });
      }
    }

    rowsForExcel.push(outRow);
  }

  check(`逐格比对 ${compared} 个数值（${domainKeys.length} 维度 × ${raw.records.length} 人 + 合成指数）`, mismatches.length === 0,
    mismatches.length === 0 ? "" : `发现 ${mismatches.length} 处差异`);
  if (mismatches.length > 0) {
    for (const m of mismatches.slice(0, 12)) {
      console.log(`      · ${m.pid.slice(0, 8)}… ${m.field}: ${m.detail}`);
    }
    if (mismatches.length > 12) console.log(`      … 其余 ${mismatches.length - 12} 处省略`);
  }

  // [4] 与个人结果页 API 抽样对账（第三条独立通道）
  console.log("\n[4] 与个人结果页 /api/results/:pid 抽样对账");
  const sample = answeredRows.slice(0, 3);
  for (const r of sample) {
    const pid = r.participant_id;
    const res = await fetch(`${BASE}/api/results/${pid}`);
    if (!res.ok) {
      check(`${pid.slice(0, 8)}… 结果 API → 200`, false, `got ${res.status}`);
      continue;
    }
    const body = await res.json();
    const answers = {};
    for (const it of bank.scales.flatMap((s) => s.items)) {
      const v = r[it.id];
      if (v !== undefined && v !== "") answers[it.id] = Number(v);
    }
    const indep = scoreIndependent(answers, bank);

    let localBad = 0;
    for (const scale of body.result.scales) {
      for (const d of scale.domains) {
        const mine = indep.domainScores[d.key];
        const theirs = d.score;
        if (mine === null && theirs === null) continue;
        if (mine === null || theirs === null || Math.abs(mine - theirs) > TOL) localBad++;
      }
    }
    check(`${pid.slice(0, 8)}… 结果页维度分与独立重算一致`, localBad === 0, `${localBad} 处不一致`);
  }

  // [5] 输出可复核的对账表（供人工在 Excel 里再看一遍）
  const outDir = resolve(ROOT, "verify-output");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const outPath = resolve(outDir, `crosscheck-${stamp}.csv`);
  const header = Object.keys(rowsForExcel[0] ?? { participant_id: "", status: "" });
  const lines = [
    header.join(","),
    ...rowsForExcel.map((row) =>
      header
        // 空值一律留空（与程序输出一致：空 = 无分，0 = 低分）
        .map((h) => {
          const v = row[h] ?? "";
          return /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v;
        })
        .join(",")
    ),
  ];
  writeFileSync(outPath, "\uFEFF" + lines.join("\r\n") + "\r\n", "utf8");
  console.log(`\n[5] 已写出对账表：${outPath}`);
  console.log("    每列形如 <维度>_indep（独立重算）/ _prog（程序输出）/ _diff（差异，空 = 一致）。");

  // [6] 手算样例（把一条完整算路摊开，便于人工用计算器复现）
  console.log("\n[6] 手算样例（可对照计算器复核）");
  const demoRow = answeredRows[0];
  if (demoRow) {
    const demoDomain = bank.scales[0].domains[0];
    const answers = {};
    for (const it of bank.scales.flatMap((s) => s.items)) {
      const v = demoRow[it.id];
      if (v !== undefined && v !== "") answers[it.id] = Number(v);
    }
    const reverseOf = {};
    for (const s of bank.scales) for (const it of s.items) reverseOf[it.id] = it.reverse;
    console.log(`  参与者 ${demoRow.participant_id.slice(0, 8)}… · 维度 ${demoDomain.key}（${demoDomain.name}）`);
    const recoded = [];
    let missing = 0;
    for (const id of demoDomain.itemIds) {
      const raw = answers[id];
      if (raw === undefined) {
        missing++;
        console.log(`    ${id}: 未作答`);
        continue;
      }
      const rc = reverseOf[id] ? likert + 1 - raw : raw;
      recoded.push(rc);
      console.log(
        `    ${id}: 原始 ${raw}${reverseOf[id] ? ` → 反向重编码 ${likert}+1−${raw} = ${rc}` : "（正向，不重编码）"}`
      );
    }
    const sum = recoded.reduce((a, b) => a + b, 0);
    console.log(
      `    均值 = ${recoded.length} 项之和 ${sum} ÷ ${recoded.length} = ` +
        `${(sum / recoded.length).toFixed(6)}${missing > 1 ? "（但缺失 " + missing + " 题 > 1，判为不可用）" : ""}`
    );
    console.log(
      `    程序输出 = ${prog.records.find((p) => p.participant_id === demoRow.participant_id)?.[demoDomain.key] || "（空）"}`
    );
  }

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n✗ 交叉验证脚本出错：${err.message}\n`);
  process.exit(1);
});
