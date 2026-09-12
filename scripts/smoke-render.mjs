// scripts/smoke-render.mjs
//
// 真实浏览器渲染冒烟测试：用**本机已安装的 Chrome / Edge 无头模式**加载结果页，
// 断言"客户端渲染完成后，页面上确实出现了各维度名称与分数"。
//
// 为什么必须有它：
//   - 结果页的报告主体依赖运行时 fetch，属客户端渲染。curl 只能拿到 Suspense 外壳，
//     E2E 因此断言不到分数文案；
//   - 曾经的真实故障（题库缺 scale.type → 前端按 type 定位量表失败 → 整页只有标题、
//     图表与维度明细全空）正是从这个盲区漏过去的：所有单测与 E2E 都是绿的。
//
// 与 E2E 的分工：E2E 负责"数值算得对不对"，本脚本只负责"页面到底画出来没有"。
// 不下载 Chromium（约 500MB），直接复用系统浏览器内核，因此可以放进日常流程。

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`);
    if (detail !== undefined) console.log(`      → ${String(detail).slice(0, 300)}`);
  }
}

/** 找出可用的浏览器内核；找不到则返回 null（脚本降级跳过，不伪造成功）。 */
function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** 用无头浏览器执行页面 JS 后 dump 出最终 DOM。 */
function dumpDom(exe, url, budgetMs = 15000) {
  const profile = mkdtempSync(join(tmpdir(), "smoke-chrome-"));
  try {
    for (const headlessFlag of ["--headless=new", "--headless"]) {
      const res = spawnSync(
        exe,
        [
          headlessFlag,
          "--disable-gpu",
          "--no-sandbox",
          "--hide-scrollbars",
          `--user-data-dir=${profile}`,
          `--virtual-time-budget=${budgetMs}`,
          "--dump-dom",
          url,
        ],
        { encoding: "utf8", timeout: 120000, maxBuffer: 64 * 1024 * 1024 }
      );
      const out = res.stdout ?? "";
      if (out.includes("<html")) return out;
    }
    return "";
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

/** 提取页面可见文本（剥离脚本/样式/标签），用于断言"用户能看到什么"。 */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function probeServer() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

/** 造一个有区分度的作答画像：大五偏高、对 AI 总体积极且担忧偏低。 */
function buildAnswers(items) {
  const bias = { O: 4.5, C: 4.2, E: 3.6, A: 4.0, N: 2.8, PU: 4.4, TR: 3.8, WA: 4.2, LA: 4.3, CN: 2.4 };
  const clamp = (v) => Math.max(1, Math.min(5, Math.round(v)));
  return items.map((i) => ({
    itemId: i.code,
    value: clamp(i.reverse ? 6 - (bias[i.domain] ?? 3) : bias[i.domain] ?? 3),
  }));
}

async function main() {
  if (!(await probeServer())) {
    console.error(`\n[错误] ${BASE} 无响应。请先启动服务：npm run build && npm start\n`);
    process.exit(2);
  }

  const exe = findBrowser();
  if (!exe) {
    console.log("\n[跳过] 未找到 Chrome / Edge 内核（可设 CHROME_PATH 指定）。");
    console.log("        本脚本依赖真实浏览器执行客户端 JS，未安装时无法验证渲染。\n");
    process.exit(0);
  }

  console.log(`\n=== 结果页渲染冒烟测试 against ${BASE} ===`);
  console.log(`浏览器内核：${exe}\n`);

  const q = await (await fetch(`${BASE}/api/questionnaire`)).json();
  const items = q.scales.flatMap((s) => s.items);

  const p = await (await fetch(`${BASE}/api/participants`, { method: "POST" })).json();
  await fetch(`${BASE}/api/consent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantId: p.id, version: "v1" }),
  });
  const submitted = await fetch(`${BASE}/api/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantId: p.id, items: buildAnswers(items) }),
  });
  check("提交 60 题作答 → 成功", submitted.ok, `got ${submitted.status}`);

  // 以 API 为"真值"，断言这些名称与分数必须出现在渲染后的页面上（配置驱动，不硬编码维度名）。
  const payload = await (await fetch(`${BASE}/api/results/${p.id}`)).json();
  const domains = payload.result.scales.flatMap((s) => s.domains);
  const composite = payload.result.scales.find((s) => s.scaleKey === "ai_adoption")?.composite ?? null;

  const url = `${BASE}/result?pid=${p.id}`;
  console.log(`\n[渲染] ${url}`);
  const dom = dumpDom(exe, url);
  check("无头浏览器成功取回 DOM", dom.length > 0, `bytes=${dom.length}`);

  const text = visibleText(dom);
  check("页面出现结果页标题", text.includes("你的测评结果"), text.slice(0, 160));
  check("不再停留在加载占位", !text.includes("正在加载"), "页面仍显示「正在加载」");
  check(
    "没有落到错误/未找到分支",
    !text.includes("无法显示结果") && !text.includes("未找到结果"),
    "页面落入错误分支"
  );

  const names = domains.map((d) => d.name);
  const missingNames = names.filter((n) => !text.includes(n));
  check(
    `10 个维度名称全部渲染（共 ${names.length} 个）`,
    missingNames.length === 0,
    `缺失：${missingNames.join(" / ")}`
  );

  // 分数以 toFixed(2) 呈现；至少每个维度的分数串要出现一次
  const missingScores = domains
    .filter((d) => typeof d.score === "number")
    .filter((d) => !text.includes(d.score.toFixed(2)))
    .map((d) => `${d.key}=${d.score.toFixed(2)}`);
  check(
    `每个维度的分数都出现在页面上（共 ${domains.length} 个）`,
    missingScores.length === 0,
    `缺失：${missingScores.join(" / ")}`
  );

  const bands = domains.map((d) => d.band?.label).filter(Boolean);
  check(
    "分带标签已渲染",
    bands.some((b) => text.includes(b)),
    `期望其中之一：${[...new Set(bands)].join(" / ")}`
  );

  check(
    "雷达图/条形图已实际绘制（DOM 中存在内联 SVG）",
    /<svg[\s>]/i.test(dom),
    "未找到 <svg>，图表可能未渲染"
  );

  if (composite) {
    check("合成指数标签已渲染", text.includes(composite.label), composite.label);
    check(
      "合成指数数值已渲染",
      typeof composite.score === "number" && text.includes(composite.score.toFixed(2)),
      `score=${composite.score}`
    );
  } else {
    check("合成指数存在", false, "API 未返回 ai_adoption 的 composite");
  }

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("冒烟测试异常：", e);
  process.exit(1);
});
