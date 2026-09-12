/**
 * 端到端契约测试：真实 HTTP 调用，验证 /api/results/:pid 的输出
 * 与「按框架文档手算的期望值」一致（不依赖引擎自身推导）。
 *
 * 用法：
 *   1) 先启动服务：npm run dev            （或 npm run dev -- -p 3500）
 *   2) 再运行：    npm run test:e2e
 *      自定义地址： BASE_URL=http://localhost:3500 npm run test:e2e
 *
 * 依据框架文档第 5 节第 7 条「端到端契约测试」要求编写，作为回归防线保留。
 *

 * 手算依据（5 点制，recoded = 6 - value；维度分 = recoded 均值）：
 *  1) 全 3 分作答 → 所有维度分 = 3.0；合成指数 = 3.0；completionRate = 1
 *  2) 全 5 分作答 → Big Five 各维度 = 3.0（4 正 4 反）
 *                   PU/TR/WA/LA = 3.0（2 正 2 反）
 *                   CN = (5+5+5+1)/4 = 4.0（3 正 1 反）
 *                   合成指数 = (mean(3,3,3,3) + (6 - 4)) / 2 = 2.5
 *  3) 只答 O 维度（正向 5 / 反向 1）→ O = 5.0，其它 Big Five incomplete，
 *     合成指数 = null（CN 不可用）
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";

/**
 * 读取 .env：Next 只在**服务端进程**里注入环境变量，而本脚本是独立进程，
 * 因此需要自己读一次，才能用与服务器相同的管理端凭据做登录契约测试。
 * 已存在的 process.env 优先（便于 CI 用真实密钥覆盖）。
 */
function loadDotEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^(['"])([\s\S]*)\1$/, "$2");
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  } catch {
    /* 没有 .env 时依赖真实环境变量 */
  }
}
loadDotEnv();

const ADMIN_USER = process.env.ADMIN_USERNAME || "";
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "";

let pass = 0;
let fail = 0;

function check(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

function approx(a, b, eps = 1e-6) {
  return a !== null && a !== undefined && Math.abs(a - b) < eps;
}

async function post(path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    // 手动跟随重定向：管理端页面未登录时会 307 到登录页，需要看到这个跳转本身。
    redirect: "manual",
  });
  return toResult(res);
}

async function get(path, headers = {}) {
  const res = await fetch(BASE + path, { headers, redirect: "manual" });
  return toResult(res);
}

async function toResult(res) {
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON 响应 */
  }
  return {
    status: res.status,
    json,
    text,
    headers: res.headers,
    location: res.headers.get("location"),
    setCookie: res.headers.get("set-cookie"),
  };
}

/** 从 Set-Cookie 头里取出 admin_session 的值。 */
function sessionTokenOf(res) {
  const raw = res.setCookie;
  if (!raw) return null;
  const m = raw.match(/admin_session=([^;]*)/);
  return m ? m[1] : null;
}

function isRedirect(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

/**
 * 等待服务就绪：dev 模式下首次访问某个 route 会现场编译，可能瞬时 404/500。
 * 因此先轮询直到题库接口稳定返回 200 再开始断言，避免把编译抖动当成失败。
 */
async function waitForServer(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let last = "no response";
  while (Date.now() < deadline) {
    try {
      const r = await get("/api/questionnaire");
      if (r.status === 200 && r.json?.scales) return true;
      last = `status=${r.status}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.error(
    `\n无法连接 ${BASE}（最后一次：${last}）。\n` +
      `请先启动服务：npm run dev   然后重跑：npm run test:e2e\n`
  );
  process.exit(2);
}

async function newParticipant() {
  const r = await post("/api/participants", {});
  if (r.status !== 201 || !r.json?.id) {
    throw new Error("create participant failed: " + r.status + " " + r.text);
  }
  await post("/api/consent", { participantId: r.json.id, version: "v1" });
  return r.json.id;
}

function domainOf(result, scaleKey, domainKey) {
  const s = result.scales.find((x) => x.scaleKey === scaleKey);
  const d = s?.domains.find((x) => x.key === domainKey);
  return d;
}

function scaleOf(result, scaleKey) {
  return result.scales.find((x) => x.scaleKey === scaleKey);
}

// ---------------------------------------------------------------------------

console.log(`\n=== Step 6–10 E2E against ${BASE} ===\n`);

await waitForServer();

console.log("[0] 题库契约");
const q = await get("/api/questionnaire");
check("GET /api/questionnaire 200", q.status === 200, `got ${q.status}`);
const items = q.json.scales.flatMap((s) => s.items);
check("题库共 60 题", items.length === 60, `got ${items.length}`);
check(
  "每题都有 code / domain / reverse",
  items.every((i) => i.code && i.domain && typeof i.reverse === "boolean")
);
const codes = items.map((i) => i.code);

// ---------------------------------------------------------------------------
console.log("\n[1] 全 3 分作答 → 所有维度分 = 3.0");
{
  const pid = await newParticipant();
  const r = await post("/api/responses", {
    participantId: pid,
    items: codes.map((c) => ({ itemId: c, value: 3 })),
  });
  check("POST /api/responses 201", r.status === 201, `got ${r.status} ${r.text}`);

  const res = await get(`/api/results/${pid}`);
  check("GET /api/results 200", res.status === 200, `got ${res.status}`);
  const result = res.json.result;
  check("completionRate = 1", result.completionRate === 1, `got ${result.completionRate}`);
  check("answeredTotal = 60", result.answeredTotal === 60, `got ${result.answeredTotal}`);

  const allDomains = result.scales.flatMap((s) => s.domains);
  check("共 10 个维度", allDomains.length === 10, `got ${allDomains.length}`);
  check(
    "10 个维度分全部 = 3.0",
    allDomains.every((d) => approx(d.score, 3)),
    JSON.stringify(allDomains.map((d) => [d.key, d.score]))
  );
  check(
    "10 个维度的 band 均为 medium",
    allDomains.every((d) => d.band?.tone === "medium")
  );
  const comp = scaleOf(result, "ai_adoption").composite;
  check("合成指数 = 3.0", approx(comp.score, 3), `got ${comp.score}`);
  check("Big Five 无合成指数", scaleOf(result, "big_five").composite === null);
  check(
    "返回体不含人口学 / 作答原文",
    !("ageRange" in res.json) && !("gender" in res.json) && !JSON.stringify(res.json).includes('"items"')
  );
  check("附带非诊断免责说明", Array.isArray(res.json.interpretationNotes) && res.json.interpretationNotes.length >= 3);
}

// ---------------------------------------------------------------------------
console.log("\n[2] 全 5 分作答（默认同意偏差）→ 手算核对");
{
  const pid = await newParticipant();
  await post("/api/responses", {
    participantId: pid,
    items: codes.map((c) => ({ itemId: c, value: 5 })),
  });
  const res = await get(`/api/results/${pid}`);
  const result = res.json.result;

  const big5 = ["O", "C", "E", "A", "N"];
  check(
    "Big Five 5 维度全部 = 3.0（反向题抑制默认同意）",
    big5.every((k) => approx(domainOf(result, "big_five", k).score, 3)),
    JSON.stringify(big5.map((k) => [k, domainOf(result, "big_five", k).score]))
  );
  check(
    "PU/TR/WA/LA = 3.0",
    ["PU", "TR", "WA", "LA"].every((k) => approx(domainOf(result, "ai_adoption", k).score, 3)),
    JSON.stringify(["PU", "TR", "WA", "LA"].map((k) => [k, domainOf(result, "ai_adoption", k).score]))
  );
  check(
    "CN = 4.0（3 正 1 反，全 5 分 → recoded 5,5,5,1）",
    approx(domainOf(result, "ai_adoption", "CN").score, 4),
    `got ${domainOf(result, "ai_adoption", "CN").score}`
  );
  check(
    "合成指数 = 2.5 = (3 + (6-4)) / 2",
    approx(scaleOf(result, "ai_adoption").composite.score, 2.5),
    `got ${scaleOf(result, "ai_adoption").composite.score}`
  );
}

// ---------------------------------------------------------------------------
console.log("\n[3] 只答 O 维度（正向 5 / 反向 1）→ O = 5.0，其余 incomplete");
{
  const pid = await newParticipant();
  const oItems = items.filter((i) => i.domain === "O");
  check("O 维度 8 题", oItems.length === 8, `got ${oItems.length}`);
  await post("/api/responses", {
    participantId: pid,
    items: oItems.map((i) => ({ itemId: i.code, value: i.reverse ? 1 : 5 })),
  });
  const res = await get(`/api/results/${pid}`);
  const result = res.json.result;
  const o = domainOf(result, "big_five", "O");
  check("O = 5.0（若漏掉反向重编码则为 3.0）", approx(o.score, 5), `got ${o.score}`);
  check("O 完整、无填补", o.answered === 8 && o.missing === 0 && !o.imputed && !o.incomplete);
  check("C 维度 incomplete、score 为 null", domainOf(result, "big_five", "C").score === null);
  check("C 维度 incomplete 标记为 true", domainOf(result, "big_five", "C").incomplete === true);
  check("合成指数为 null（CN 不可用，不做部分合成）", scaleOf(result, "ai_adoption").composite.score === null);
  check("completionRate = 8/60 ≈ 0.1333", approx(result.completionRate, 0.1333, 1e-4), `got ${result.completionRate}`);
}

// ---------------------------------------------------------------------------
console.log("\n[4] 反向题只在题目级翻转一次（CN4 专测）");
{
  const pid = await newParticipant();
  await post("/api/responses", {
    participantId: pid,
    items: [
      { itemId: "CN1", value: 5 },
      { itemId: "CN2", value: 5 },
      { itemId: "CN3", value: 5 },
      { itemId: "CN4", value: 1 }, // 很担心 → 反向题给 1 → recoded 5
    ],
  });
  const res = await get(`/api/results/${pid}`);
  const cn = domainOf(res.json.result, "ai_adoption", "CN");
  check("CN = 5.0（最大担忧，CN4 仅翻转一次）", approx(cn.score, 5), `got ${cn.score}`);
}

// ---------------------------------------------------------------------------
console.log("\n[5] 错误处理");
{
  const missing = await get(`/api/results/00000000-0000-0000-0000-000000000000`);
  check("未知 participantId → 404", missing.status === 404, `got ${missing.status}`);

  const fresh = await post("/api/participants", {});
  const noAnswers = await get(`/api/results/${fresh.json.id}`);
  check("已创建但未作答 → 404", noAnswers.status === 404, `got ${noAnswers.status}`);
}

// ---------------------------------------------------------------------------
console.log("\n[6] Step 7 · 结果解读文案（配置驱动）");
{
  const pid = await newParticipant();
  await post("/api/responses", {
    participantId: pid,
    items: codes.map((c) => ({ itemId: c, value: 3 })),
  });
  const res = await get(`/api/results/${pid}`);
  const result = res.json.result;

  const allDomains = result.scales.flatMap((s) => s.domains);
  check(
    "10 个维度全部附带非空解读文案",
    allDomains.every(
      (d) => typeof d.interpretation === "string" && d.interpretation.length > 5
    ),
    JSON.stringify(allDomains.filter((d) => !d.interpretation).map((d) => d.key))
  );
  check(
    "AI 合成指数附带非空解读文案",
    typeof scaleOf(result, "ai_adoption").composite.interpretation === "string" &&
      scaleOf(result, "ai_adoption").composite.interpretation.length > 5
  );
  check(
    "解读文案版本号随响应返回",
    typeof res.json.interpretationConfig?.version === "string",
    JSON.stringify(res.json.interpretationConfig)
  );
  check(
    "边界说明包含「CN 反向语义」提示",
    res.json.interpretationNotes.some((n) => n.includes("担忧") && n.includes("反向")),
    JSON.stringify(res.json.interpretationNotes)
  );
  check(
    "CN 维度 polarity 声明为 higher = more concern",
    domainOf(result, "ai_adoption", "CN").polarity === "higher = more concern",
    `got ${domainOf(result, "ai_adoption", "CN").polarity}`
  );
  check(
    "N 维度展示名已中性化为「情绪敏感性」（不出现「神经质」）",
    domainOf(result, "big_five", "N").name.includes("情绪敏感性") &&
      !JSON.stringify(result).includes("神经质"),
    `got ${domainOf(result, "big_five", "N").name}`
  );
}

// ---------------------------------------------------------------------------
console.log("\n[7] Step 7 · 解读文案随分带变化（O 维度三段互异）");
{
  // 同一维度（O）在 low / medium / high 三个分带下应给出不同文案，
  // 否则说明分带没有真正参与文案选择。
  const makeWithO = async (positive, reverse) => {
    const pid = await newParticipant();
    const items60 = items.map((i) => {
      if (i.domain === "O") return { itemId: i.code, value: i.reverse ? reverse : positive };
      return { itemId: i.code, value: 3 };
    });
    await post("/api/responses", { participantId: pid, items: items60 });
    const res = await get(`/api/results/${pid}`);
    return domainOf(res.json.result, "big_five", "O");
  };

  const high = await makeWithO(5, 1); // O = 5.0
  const low = await makeWithO(1, 5); // O = 1.0
  const mid = await makeWithO(3, 3); // O = 3.0

  check("O 高分带 = high", high.band?.tone === "high", `got ${high.band?.tone}`);
  check("O 低分带 = low", low.band?.tone === "low", `got ${low.band?.tone}`);
  check("O 中分带 = medium", mid.band?.tone === "medium", `got ${mid.band?.tone}`);
  check(
    "三段文案互不相同且均非空",
    new Set([high.interpretation, low.interpretation, mid.interpretation]).size === 3 &&
      [high, low, mid].every((d) => d.interpretation && d.interpretation.length > 5)
  );
}

// ---------------------------------------------------------------------------
console.log("\n[8] Step 7 · 结果页可达性");
{
  const pid = await newParticipant();
  await post("/api/responses", {
    participantId: pid,
    items: codes.map((c) => ({ itemId: c, value: 3 })),
  });

  const withPid = await get(`/result?pid=${pid}`);
  check("GET /result?pid=… → 200", withPid.status === 200, `got ${withPid.status}`);
  // 注意：报告主体依赖运行时 fetch，属于客户端渲染，不会出现在初始 HTML 中。
  // 因此这里只断言「应用外壳」成立（全局顶栏 + 页脚免责声明都由布局注入），
  // 而非断言维度分数文案——那需要真实浏览器 E2E（见 CONTINUATION 待办）。
  check(
    "结果页返回应用外壳（全局顶栏 + 页脚免责声明）",
    withPid.text.includes("心理测评平台") && withPid.text.includes("不构成任何临床诊断"),
    withPid.text.slice(0, 120)
  );

  const noPid = await get("/result");
  check("GET /result（无 pid）→ 200 且给出引导", noPid.status === 200, `got ${noPid.status}`);

  // 【回归守卫】结果页曾整页空白：引擎输出的量表缺少 type 字段，
  // 而前端按 `type === "personality" / "attitude"` 定位量表 → 找不到 → 图表与明细全空。
  // 这是"客户端渲染"盲区的替代守卫：不启浏览器，但断言前端依赖的字段真的存在。
  const payload = await get(`/api/results/${pid}`);
  const scales = payload.json?.result?.scales ?? [];
  check("结果 API → 200", payload.status === 200, `got ${payload.status}`);
  check("结果 API 返回 2 个量表", scales.length === 2, `got ${scales.length}`);
  check(
    "每个量表都带合法 type（前端据此定位量表，缺失即整页无内容）",
    scales.length === 2 &&
      scales.every((s) => s.type === "personality" || s.type === "attitude"),
    JSON.stringify(scales.map((s) => ({ key: s.scaleKey, type: s.type })))
  );
  check(
    "每个量表都有 5 个维度且维度分为有限数值",
    scales.length === 2 &&
      scales.every(
        (s) =>
          Array.isArray(s.domains) &&
          s.domains.length === 5 &&
          s.domains.every((d) => typeof d.score === "number" && Number.isFinite(d.score))
      ),
    JSON.stringify(scales.map((s) => s.domains.map((d) => d.score)))
  );
  check(
    "每个维度都有展示名与分带标签（UI 直接消费这两个字段）",
    scales.length === 2 &&
      scales.every((s) =>
        s.domains.every(
          (d) => typeof d.name === "string" && d.name.length > 0 && Boolean(d.band?.label)
        )
      ),
    "维度名或分带缺失"
  );
  check(
    "AI 量表带合成指数（含数值、分带与公式）",
    (() => {
      const ai = scales.find((s) => s.scaleKey === "ai_adoption");
      return Boolean(
        ai?.composite &&
          typeof ai.composite.score === "number" &&
          ai.composite.band?.label &&
          ai.composite.formula
      );
    })(),
    JSON.stringify(scales.find((s) => s.scaleKey === "ai_adoption")?.composite)
  );
}

// ---------------------------------------------------------------------------
console.log("\n[9] Step 8 · 管理端鉴权契约");
{
  check(
    "可从 .env 读到管理端凭据（登录契约测试的前提）",
    Boolean(ADMIN_USER && ADMIN_PASS),
    "缺少 ADMIN_USERNAME / ADMIN_PASSWORD"
  );

  // 9.1 未登录 → 受保护资源一律 401
  for (const p of ["/api/admin/stats", "/api/admin/export?format=csv"]) {
    const r = await get(p);
    check(`无 cookie: ${p} → 401`, r.status === 401, `got ${r.status}`);
  }

  // 9.2 session 探针是「查状态」而非「受保护资源」→ 200 + authenticated:false
  const probe = await get("/api/admin/session");
  check("无 cookie: /api/admin/session → 200", probe.status === 200, `got ${probe.status}`);
  check(
    "session 探针返回 authenticated:false，且未登录时不泄露任何配置信息",
    probe.json?.authenticated === false && Array.isArray(probe.json?.credentialWarnings) && probe.json.credentialWarnings.length === 0,
    JSON.stringify(probe.json)
  );

  // 9.3 伪造 / 篡改令牌一律 401
  const forged = "eyJzdWIiOiJhZG1pbiIsImlhdCI6MCwiZXhwIjo5OTk5OTk5OTk5fQ.AAAA";
  const forgedRes = await get("/api/admin/stats", { Cookie: `admin_session=${forged}` });
  check("伪造令牌 → 401（签名校验生效）", forgedRes.status === 401, `got ${forgedRes.status}`);

  // 9.4 错误凭据：三种错法必须返回完全相同的响应，杜绝账号枚举
  const wrong = [];
  for (const cred of [
    { username: ADMIN_USER, password: "definitely-wrong" },
    { username: "not-the-admin", password: ADMIN_PASS },
    { username: "not-the-admin", password: "definitely-wrong" },
  ]) {
    const r = await post("/api/admin/login", cred);
    wrong.push(`${r.status}:${r.text}`);
  }
  check("密码错 → 401", wrong[0].startsWith("401"), wrong[0]);
  check(
    "用户名错 / 密码错 / 两者皆错 的响应逐字相同（不泄露是哪一项错了）",
    wrong[0] === wrong[1] && wrong[1] === wrong[2],
    wrong.join(" | ")
  );

  // 9.5 正确凭据 → 200 + 属性齐备的会话 cookie
  const login = await post("/api/admin/login", {
    username: ADMIN_USER,
    password: ADMIN_PASS,
  });
  check("正确凭据 → 200", login.status === 200, `got ${login.status} ${login.text}`);

  const setCookie = login.setCookie ?? "";
  const token = sessionTokenOf(login);
  check("登录响应带 admin_session cookie", Boolean(token), setCookie);
  check("cookie 为 HttpOnly（JS 读不到，XSS 偷不走）", /HttpOnly/i.test(setCookie), setCookie);
  check("cookie 为 SameSite=lax（抵御 CSRF）", /SameSite=lax/i.test(setCookie), setCookie);
  check("cookie Path=/（否则 /api/admin/* 收不到）", /Path=\//i.test(setCookie), setCookie);
  check(
    "本地 HTTP 下不置 Secure（否则浏览器丢弃 cookie，登录后仍被判未登录）",
    !/;\s*Secure/i.test(setCookie),
    setCookie
  );
  check("未持有凭据的匿名请求拿不到 cookie", sessionTokenOf(await post("/api/admin/login", { username: ADMIN_USER, password: "nope" })) === null);

  const authed = { Cookie: `admin_session=${token}` };

  // 9.6 带会话 → 统计可用，且缺口径正确
  const stats = await get("/api/admin/stats", authed);
  check("带 cookie: /api/admin/stats → 200", stats.status === 200, `got ${stats.status}`);
  const s = stats.json ?? {};
  check(
    "统计含 totals / completionRate / elapsed / domains / index",
    Boolean(s.totals && s.domains && s.index && s.elapsed && "completionRate" in s),
    Object.keys(s).join(",")
  );
  check("返回 10 个维度", Array.isArray(s.domains) && s.domains.length === 10, `got ${s.domains?.length}`);
  check(
    "每个维度都带 n / mean / sd / bands（n 是逐维的，不是一个全局值）",
    (s.domains ?? []).every(
      (d) => typeof d.n === "number" && "mean" in d && "sd" in d && typeof d.bands?.low === "number"
    )
  );
  check(
    "sd 为 null 时必有 n < 2（不把「无法估计」写成 0）",
    (s.domains ?? []).every((d) => d.sd !== null || d.n < 2),
    JSON.stringify((s.domains ?? []).filter((d) => d.sd === null).map((d) => [d.key, d.n]))
  );
  check(
    "n=0 的维度 mean 为 null（不是 0 分）",
    (s.domains ?? []).filter((d) => d.n === 0).every((d) => d.mean === null)
  );
  check(
    "完成率与 totals 自洽（participants=0 时为 null 而非 0%）",
    s.totals.participants === 0
      ? s.completionRate === null
      : Math.abs(s.completionRate - s.totals.completed / s.totals.participants) < 1e-4,
    JSON.stringify({ totals: s.totals, rate: s.completionRate })
  );
  check(
    "合成指数直方图为 1–5 等宽 8 箱，且总人数 = 指数可用样本数",
    s.index.histogram?.length === 8 &&
      s.index.histogram.reduce((a, b) => a + b.count, 0) === s.index.n,
    `bins=${s.index.histogram?.length} sum=${s.index.histogram?.reduce((a, b) => a + b.count, 0)} n=${s.index.n}`
  );
  check(
    "恒定附带边界说明（分带启发式 / 非常模 / 非诊断）",
    Array.isArray(s.notes) && s.notes.length >= 4 && s.notes.join("|").includes("常模")
  );

  // 9.7 CSV 导出
  // 注意：必须拿原始字节来验 BOM —— WHATWG 的 `res.text()` 会按规范**剥掉** BOM，
  // 用 text() 永远看不到 EF BB BF，会得到一个假阴性。
  const csvRes = await fetch(BASE + "/api/admin/export?format=csv", {
    headers: authed,
    redirect: "manual",
  });
  const csvBuf = Buffer.from(await csvRes.arrayBuffer());
  const csvText = csvBuf.toString("utf8");
  const csvLines = csvText
    .replace(/^\uFEFF/, "")
    .split("\r\n")
    .filter((l) => l.length > 0);
  const csvHeader = csvLines[0] ?? "";
  const csvCols = csvHeader.split(",");

  check("带 cookie: 导出 → 200", csvRes.status === 200, `got ${csvRes.status}`);
  check(
    "Content-Type 为 text/csv; charset=utf-8",
    /text\/csv/.test(csvRes.headers.get("content-type") ?? ""),
    String(csvRes.headers.get("content-type"))
  );
  check(
    "带 attachment 文件名（浏览器下载而非内联）",
    /attachment/.test(csvRes.headers.get("content-disposition") ?? ""),
    String(csvRes.headers.get("content-disposition"))
  );
  check(
    "CSV 以 UTF-8 BOM 开头（Excel 中文列名不乱码）",
    csvBuf[0] === 0xef && csvBuf[1] === 0xbb && csvBuf[2] === 0xbf,
    [...csvBuf.subarray(0, 3)].map((b) => b.toString(16)).join(" ")
  );
  check("CSV 使用 CRLF 换行", csvBuf.toString("utf8").includes("\r\n"));
  check(
    "表头含全部 10 个维度与合成指数",
    ["O", "C", "E", "A", "N", "PU", "TR", "WA", "LA", "CN", "ai_adoption_index"].every(
      (k) => csvCols.includes(k)
    ),
    csvHeader
  );
  check(
    "表头不含任何 PII 列",
    !/name|email|phone|cookie|user_agent/i.test(csvHeader),
    csvHeader
  );
  check(
    "数据行数 = 参与者总数",
    csvLines.length - 1 === s.totals.participants,
    `rows=${csvLines.length - 1} participants=${s.totals.participants}`
  );
  check(
    "每行列数与表头一致（不可用维度留空，而不是少列）",
    csvLines.every((l) => l.split(",").length === csvCols.length),
    `cols=${csvCols.length}`
  );
  check(
    "不支持的导出格式 → 400（不静默返回 CSV）",
    (await get("/api/admin/export?format=json", authed)).status === 400
  );

  // 9.8 登出
  const out = await post("/api/admin/logout", {});
  check("登出 → 200", out.status === 200, `got ${out.status}`);
  check(
    "登出清空 cookie（Max-Age=0）",
    /admin_session=;/.test(out.setCookie ?? "") && /Max-Age=0/i.test(out.setCookie ?? ""),
    String(out.setCookie)
  );
  const afterLogout = await get("/api/admin/stats", {
    Cookie: `admin_session=${token}`,
  });
  check(
    "已知取舍：登出只清客户端 cookie；服务端无状态，故旧令牌在过期前仍有效",
    afterLogout.status === 200,
    `got ${afterLogout.status}（若变成 401 说明已实现服务端吊销，请同步更新交接文档）`
  );
}

// ---------------------------------------------------------------------------
console.log("\n[10] Step 8 · 管理端页面守卫");
{
  // 未登录：受保护页面必须跳转登录页
  for (const p of ["/admin", "/admin/export", "/admin/analytics"]) {
    const r = await get(p);
    check(
      `未登录访问 ${p} → 跳转 /admin/login`,
      isRedirect(r.status) && (r.location ?? "").includes("/admin/login"),
      `status=${r.status} location=${r.location}`
    );
  }

  const loginPage = await get("/admin/login");
  check("未登录访问 /admin/login → 200", loginPage.status === 200, `got ${loginPage.status}`);
  check(
    "登录页含标题与表单字段",
    loginPage.text.includes("管理端登录") && loginPage.text.includes("密码")
  );

  const login = await post("/api/admin/login", {
    username: ADMIN_USER,
    password: ADMIN_PASS,
  });
  const token = sessionTokenOf(login);

  if (!token) {
    check("登录后继续页面测试", false, "未拿到会话令牌，后续页面断言无法执行");
  } else {
    const authed = { Cookie: `admin_session=${token}` };

    const dash = await get("/admin", authed);
    check("已登录 /admin → 200", dash.status === 200, `got ${dash.status}`);
    check(
      "仪表盘渲染了各区块（说明服务端聚合真的跑通了，而不是空壳）",
      ["管理端 · 仪表盘", "完成漏斗", "各维度均值", "AI 采纳指数分布", "样本量与分带明细"].every(
        (t) => dash.text.includes(t)
      ),
      dash.text.slice(0, 160)
    );
    check("仪表盘有「退出登录」入口", dash.text.includes("退出登录"));
    check(
      "仪表盘声明了「未建立常模」的边界",
      dash.text.includes("不代表人群百分位")
    );
    check("明细表标注 CN 的「语义反向」", dash.text.includes("语义反向"));
    check(
      "弱凭据在仪表盘顶部亮出告警（不静默带着默认密码上线）",
      dash.text.includes("请勿直接上线")
    );

    const exp = await get("/admin/export", authed);
    check("已登录 /admin/export → 200", exp.status === 200, `got ${exp.status}`);
    check(
      "导出页含下载入口与公式注入说明",
      exp.text.includes("下载 CSV") && exp.text.includes("公式注入")
    );

    const ana = await get("/admin/analytics", authed);
    check("已登录 /admin/analytics → 200", ana.status === 200, `got ${ana.status}`);

    const again = await get("/admin/login", authed);
    check(
      "已登录访问 /admin/login → 跳转 /admin（不出现「已登录却停在登录页」）",
      isRedirect(again.status) && (again.location ?? "").includes("/admin"),
      `status=${again.status} location=${again.location}`
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n[11] Step 9 · 分析契约（信度 / 相关 / 题项分布）");
{
  // 11.1 三个新端点必须与其它管理端点一样受守卫保护
  for (const p of ["/api/admin/reliability", "/api/admin/correlation", "/api/admin/items"]) {
    const r = await get(p);
    check(`无 cookie: ${p} → 401`, r.status === 401, `got ${r.status}`);
  }

  const login = await post("/api/admin/login", {
    username: ADMIN_USER,
    password: ADMIN_PASS,
  });
  const token = sessionTokenOf(login);

  if (!token) {
    check("登录后继续分析契约测试", false, "未拿到会话令牌");
  } else {
    const authed = { Cookie: `admin_session=${token}` };
    const q = await get("/api/questionnaire");
    const expectedDomains = q.json.scales.flatMap((s) => s.domains.map((d) => d.key));
    const allCodes = q.json.scales.flatMap((s) => s.items.map((i) => i.code));
    const stats = await get("/api/admin/stats", authed);

    // 11.2 信度
    const rel = await get("/api/admin/reliability", authed);
    check("已登录: /api/admin/reliability → 200", rel.status === 200, `got ${rel.status}`);

    const rows = rel.json?.rows ?? [];
    check(
      `信度覆盖全部 ${expectedDomains.length} 个维度`,
      rows.length === expectedDomains.length &&
        expectedDomains.every((k) => rows.some((r) => r.domainKey === k)),
      `${rows.length} 行`
    );
    check(
      "每行都含 α / 区间 / k / n / 剔除数 / 题目平均相关 / 等级 字段",
      rows.every(
        (r) =>
          "alpha" in r &&
          "ci" in r &&
          "k" in r &&
          "n" in r &&
          "droppedIncomplete" in r &&
          "meanInterItemR" in r &&
          "grade" in r
      )
    );
    check(
      "α 无定义时必须给出原因，且不得用 0 或 1 顶替",
      rows.every(
        (r) =>
          r.alpha !== null || (typeof r.reason === "string" && r.reason.length > 0)
      )
    );
    check(
      "α 无定义时区间与等级同为 null（不给出误导性的区间）",
      rows.every((r) => r.alpha !== null || (r.grade === null && r.ci === null))
    );
    check(
      "置信区间下界 ≤ 上界",
      rows.every((r) => r.ci === null || r.ci.lo <= r.ci.hi)
    );
    check(
      "k 与题库声明的题数逐一对应",
      rows.every((r) => {
        const expected = q.json.scales
          .flatMap((s) => s.items)
          .filter((i) => i.domain === r.domainKey).length;
        return r.k === expected;
      })
    );
    check(
      "各维度的 listwise 样本量不超过已完成会话数",
      rows.every((r) => r.n <= (stats.json?.totals?.completed ?? 0))
    );
    check(
      "α 区间由固定种子生成：同一份数据两次请求返回完全相同的 JSON",
      JSON.stringify((await get("/api/admin/reliability", authed)).json) ===
        JSON.stringify(rel.json),
      "两次结果不同 → bootstrap 种子未固定，仪表盘数字会随机漂移"
    );
    check(
      "信度说明声明了「惯例阈值 ≠ 常模」与「listwise 口径」",
      rel.json.notes.join(" ").includes("不是本平台常模") &&
        rel.json.notes.join(" ").includes("listwise")
    );

    // 11.3 相关
    const cor = await get("/api/admin/correlation", authed);
    check("已登录: /api/admin/correlation → 200", cor.status === 200, `got ${cor.status}`);

    const keys = cor.json.keys;
    const m = cor.json.matrix;
    check(`相关矩阵含全部 ${expectedDomains.length} 个维度`, keys.length === expectedDomains.length, `${keys.length}`);
    check(
      "矩阵为方阵",
      m.length === keys.length && m.every((r) => r.length === keys.length)
    );
    check(
      "矩阵对称（热力图只画下三角的前提）",
      keys.every((_, i) =>
        keys.every((__, j) => m[i][j] === m[j][i] && cor.json.counts[i][j] === cor.json.counts[j][i])
      )
    );
    check(
      "对角线为 1 或 null（零方差/样本不足时刻意不给假 1）",
      m.every((row, i) => row[i] === 1 || row[i] === null)
    );
    check(
      "r 全部落在 [−1, 1] 或为空",
      m.every((row) => row.every((v) => v === null || (v >= -1.0001 && v <= 1.0001)))
    );
    check(`pairCount = C(${expectedDomains.length}, 2)`, cor.json.pairCount === (expectedDomains.length * (expectedDomains.length - 1)) / 2, `${cor.json.pairCount}`);
    check(
      "Bonferroni 阈值 = 0.05 / 配对数",
      Math.abs(cor.json.bonferroniAlpha - 0.05 / cor.json.pairCount) < 1e-6,
      String(cor.json.bonferroniAlpha)
    );
    check(
      "每格的成对样本量 ≤ 参与者总数",
      cor.json.counts.every((row) => row.every((n) => n <= cor.json.n))
    );
    check(
      "校正后显著数 ≤ 未校正显著数",
      cor.json.sigCorrected <= cor.json.sigUncorrected
    );
    check(
      "相关说明声明了「相关不等于因果」与「成对剔除」",
      cor.json.notes.join(" ").includes("相关不等于因果") &&
        cor.json.notes.join(" ").includes("成对剔除")
    );

    // 11.4 题项分布
    const items = await get("/api/admin/items", authed);
    check("已登录: /api/admin/items → 200", items.status === 200, `got ${items.status}`);

    const allItems = items.json.groups.flatMap((g) => g.items);
    check(
      `覆盖题库全部 ${allCodes.length} 道题`,
      allItems.length === allCodes.length &&
        allCodes.every((c) => allItems.some((i) => i.code === c)),
      `${allItems.length} 题`
    );
    check(
      "每题「有效作答 + 未作答」恒等于参与者总数（计数守恒）",
      allItems.every(
        (i) => i.options.reduce((a, o) => a + o.count, 0) + i.missing === items.json.n
      ),
      `n=${items.json.n}`
    );
    const likertValues = JSON.stringify(items.json.likertOptions.map((o) => o.value));
    check(
      "选项档位与 Likert 配置一致（含 0 计数的档，保证图表不塌陷）",
      allItems.every((i) => JSON.stringify(i.options.map((o) => o.value)) === likertValues)
    );
    check(
      "每题都输出重编码后分布（地板/天花板按它判定）",
      allItems.every(
        (i) =>
          Array.isArray(i.recodedOptions) &&
          i.recodedOptions.length === i.options.length &&
          i.recodedOptions.reduce((a, o) => a + o.count, 0) === i.n
      )
    );
    check(
      "反向题的原始均值与重编码均值互补（和为 6）",
      allItems
        .filter((i) => i.reverse && i.n > 0)
        .every((i) => Math.abs(i.rawMean + i.recodedMean - 6) < 1e-3),
      "说明反向重编码在题项层面确实生效"
    );
    check(
      "sd 在有效作答 < 2 时为 null（不写 0）",
      allItems.every((i) => i.n >= 2 || i.rawSd === null)
    );

    // 11.5 分析页（服务端渲染 → 可直接断言正文）
    const ana = await get("/admin/analytics", authed);
    check("已登录 /admin/analytics → 200", ana.status === 200, `got ${ana.status}`);
    check(
      "分析页渲染了三个板块（服务端聚合真的跑通，而不是骨架）",
      ["信度分析", "相关分析", "题项反应分布", "Cronbach"].every((t) =>
        ana.text.includes(t)
      ),
      ana.text.slice(0, 160)
    );
    check(
      "分析页声明「惯例阈值不是常模」",
      ana.text.includes("不是本平台常模")
    );
    check("分析页给出多重比较（Bonferroni）风险提示", ana.text.includes("Bonferroni"));
    check(
      "分析页提供原始作答下载入口（独立复核所需的输入）",
      ana.text.includes("format=raw")
    );

    // 11.6 原始作答导出（交叉验证的输入通道）
    const raw = await get("/api/admin/export?format=raw", authed);
    check("已登录: /api/admin/export?format=raw → 200", raw.status === 200, `got ${raw.status}`);
    const rawLines = raw.text
      .replace(/^\uFEFF/, "")
      .split("\r\n")
      .filter((l) => l.length > 0);
    const rawHeader = (rawLines[0] ?? "").split(",");
    check(
      "raw 表头含全部题目 code（每列一道题）",
      allCodes.every((c) => rawHeader.includes(c)),
      `共 ${rawHeader.length} 列`
    );
    check(
      "raw 行数 = 参与者总数",
      rawLines.length - 1 === stats.json.totals.participants,
      `rows=${rawLines.length - 1} participants=${stats.json.totals.participants}`
    );
    check(
      "仍拒绝不支持的格式 → 400（新增 raw 没有放宽校验）",
      (await get("/api/admin/export?format=json", authed)).status === 400
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n[12] Step 10 · 部署安全契约（响应头 / cookie / 不泄露内部信息）");
{
  // 12.1 安全响应头
  const home = await get("/");
  const csp = home.headers.get("content-security-policy") ?? "";
  check("首页返回 CSP", csp.length > 0);
  check("CSP 禁止被内嵌（frame-ancestors 'none'）", csp.includes("frame-ancestors 'none'"));
  check("CSP 禁止 object/embed（object-src 'none'）", csp.includes("object-src 'none'"));
  check("CSP 限制外连（connect-src 'self'）", csp.includes("connect-src 'self'"));
  check(
    "CSP 生产环境不含 'unsafe-eval'（dev 才需要）",
    process.env.NODE_ENV === "development" || !csp.includes("'unsafe-eval'"),
    csp
  );
  check("X-Content-Type-Options: nosniff", home.headers.get("x-content-type-options") === "nosniff");
  check("X-Frame-Options: DENY", home.headers.get("x-frame-options") === "DENY");
  check(
    "Referrer-Policy 已设置",
    (home.headers.get("referrer-policy") ?? "").startsWith("strict-origin"),
    home.headers.get("referrer-policy")
  );
  check("未暴露 X-Powered-By（减少技术指纹）", home.headers.get("x-powered-by") === null);
  check(
    "Permissions-Policy 关闭摄像头/麦克风/定位",
    (home.headers.get("permissions-policy") ?? "").includes("camera=()"),
    home.headers.get("permissions-policy")
  );

  // 12.2 管理端与接口不被收录
  const sessionProbe = await get("/api/admin/session");
  check(
    "/api/* 带 noindex 头",
    (sessionProbe.headers.get("x-robots-tag") ?? "").includes("noindex"),
    sessionProbe.headers.get("x-robots-tag")
  );
  const adminAnon = await get("/admin");
  check(
    "/admin/* 带 noindex 头（即使被未登录访问也应带）",
    (adminAnon.headers.get("x-robots-tag") ?? "").includes("noindex"),
    adminAnon.headers.get("x-robots-tag")
  );

  // 12.3 未授权响应不泄露任何线索
  const unauth = await get("/api/admin/stats");
  const unauthKeys = Object.keys(unauth.json ?? {});
  check("未登录访问受保护接口 → 401", unauth.status === 401, `got ${unauth.status}`);
  check(
    "401 响应体只有单一 error 字段（无 details / stack / 变量名）",
    unauthKeys.length === 1 && unauthKeys[0] === "error",
    JSON.stringify(unauth.json)
  );
  const unauthText = (unauth.text ?? "").toLowerCase();
  check(
    "401 文案不提 cookie / token / secret / signature 等实现细节",
    !["cookie", "token", "secret", "signature", "hmac", "env"].some((w) => unauthText.includes(w)),
    unauth.text
  );

  // 12.4 登录响应与 cookie 属性
  const bad = await post("/api/admin/login", { username: "nobody", password: "wrong-password-123" });
  check("错误凭据 → 401", bad.status === 401, `got ${bad.status}`);
  check(
    "登录失败文案统一（不区分用户名错/密码错，防账号枚举）",
    bad.json?.error === "Invalid credentials",
    JSON.stringify(bad.json)
  );

  const okLogin = await post("/api/admin/login", { username: ADMIN_USER, password: ADMIN_PASS });
  check("正确凭据 → 200", okLogin.status === 200, `got ${okLogin.status}`);
  const setCookie = okLogin.setCookie ?? "";
  check("会话 cookie 带 HttpOnly", /HttpOnly/i.test(setCookie), setCookie);
  check("会话 cookie 带 SameSite=lax（CSRF 纵深）", /SameSite=lax/i.test(setCookie), setCookie);
  check("会话 cookie 带 Max-Age>0", /Max-Age=(?!0\b)\d+/i.test(setCookie), setCookie);
  check(
    "登录响应体不含密码明文（回显凭据是典型的低级泄露）",
    !okLogin.text.includes(ADMIN_PASS),
    "响应体里出现了 ADMIN_PASSWORD 的值"
  );
  check(
    "登录响应体不含会话签名密钥",
    !okLogin.text.includes(process.env.ADMIN_SESSION_SECRET ?? "\u0000never"),
  );

  // 12.5 服务端渲染页面不得把服务端配置带进 HTML
  const token = sessionTokenOf(okLogin);
  const authHeaders = { Cookie: `admin_session=${token}` };
  const dash = await get("/admin", authHeaders);
  check("已登录可访问 /admin", dash.status === 200, `got ${dash.status}`);
  for (const needle of ["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "ADMIN_USERNAME", "DATABASE_URL"]) {
    check(
      `/admin 的 HTML 不含服务端变量名 ${needle}`,
      !dash.text.includes(needle)
    );
  }
  check(
    "/admin 的 HTML 不含密码明文",
    !dash.text.includes(ADMIN_PASS)
  );
  check(
    "/admin 的 HTML 不含数据库连接串特征",
    !dash.text.includes("postgresql://") && !dash.text.includes("file:./dev.db"),
    "HTML 中出现了连接串特征"
  );
  check(
    "/admin 的 HTML 不含会话令牌明文",
    !dash.text.includes(token),
    "令牌被渲染进了 HTML"
  );
}

// ---------------------------------------------------------------------------
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail === 0 ? 0 : 1);
