# CONTINUATION.md · 项目交接摘要

> 用途：让**全新的 AI Agent**（完全不了解之前聊天）读完本文件即可无缝接管本项目。
> 项目名：`web-assessment-platform` ｜ 位置：`G:\web-assessment-platform`
> 最后交接状态（**2026-09-13 更新**）：**项目已正式部署并公开可用**（Vercel + Neon，公开 URL 见 §10 第 13 条）。Step 1–10 全部完成并验证；Step 7 结果页整页空白缺陷已修复并补渲染级守卫；Step 9 分析页落地并完成「独立评分交叉验证」；Step 10 部署安全加固 + 上线均已完成。部署后追加了：心理测量审查与评分解释层修正、UX 审查与体验修正、**管理端提交明细（按填写时间排序 + 逐条删除）**、结果页读图提示布局修复、知情同意措辞修正、交付物 C/E 文档。**仅剩真实用户试点（交付物 D）待开展**（见 §10 第 17 条与 §2「部署后补充」）。
> 时间锚点：2026-09-13（更新于正式部署完成后，同步交付物与文档）

---

## 1. 项目目标与当前任务

**总目标**：构建一个可运行、可展示、可评估的 **Web-based interactive psychological assessment platform**（Agentic AI Web Assessment Challenge 参赛项目）。

**核心功能**
- 用户端闭环：知情同意 → 双量表作答（进度/续答）→ 自动评分 → 结果可视化。
- 管理端：参与人数、完成率、分数分布、均值、题项反应分布、信度分析（Cronbach α）、相关分析（Pearson r）、CSV 导出。
- 数据：匿名存储（**不收集任何 PII**），支持多人聚合分析。
- 必须公网部署上线，最终交付：Source code + README + AI 开发记录 + 技术报告 + 试点评估支持。

**两个测评量表**
1. **Big Five 人格**（O/C/E/A/N），40 题（每维度 4 正 + 4 反）。
2. **AI Technology Adoption Attitude Scale**（PU/TR/WA/LA/CN），20 题（每维度 3 正 + 1 反）+ 合成指数。

**当前任务**：Step 1–10 全部完成并**已正式部署上线**（公开可用，URL 见 §10 第 13 条）。部署后已完成：心理测量审查 + 评分解释层修正、UX 审查 + 体验修正、管理端提交明细（按填写时间排序 + 逐条删除）、结果页读图提示布局修复、知情同意措辞修正，以及交付物 C/E 文档。**唯一剩余的人工动作是开展真实用户试点（交付物 D，≥10 名独立参与者）**；若此前重置过 Neon 密码，需同步更新 Vercel 的 `DATABASE_URL`（Pooled 串）后 Redeploy。

**管理端鉴权（Step 8 落地，务必延续）**：`src/lib/auth.ts`（纯逻辑：HMAC-SHA256 签名会话 + 常量时间凭据比较）+ `src/lib/admin/guard.ts`（Next 胶水：`guardAdminApi()` / `requireAdminPage()`）。**刻意不用 middleware**——Edge Runtime 拿不到 Node 加密原语，会逼出第二套实现从而产生鉴权分叉。新增管理 API 时**必须**在首行调用 `guardAdminApi(req)`，否则 `guard-coverage.test.ts` 会失败。

**解读文案为配置驱动**：所有面向用户的心理措辞在 `data/interpretations.json`（维度 key × 分带 low/medium/high），**不在组件里硬编码**；修改文案不需要改代码，也不需要重跑评分测试。

**开发规则（用户硬性要求，务必遵守）**
- 每次**只完成一个模块**，完成后等待用户确认再继续。
- 每完成一个模块必须汇报：① 修改了哪些文件 ② 为什么这样设计 ③ 如何运行 ④ 如何测试 ⑤ 潜在 Bug。
- 所有评分算法必须写测试；所有结论文案不得越界为临床诊断；数据默认匿名。

---

## 2. 当前已完成的功能

**文档**
- `docs/assessment-framework.md` — 心理测量设计（Big Five + AI 量表的维度、题目、Likert、评分方法、验证方案）。**这是评分逻辑的权威来源**。
- `docs/dev-plan.md` — 目录结构、技术栈对比（已选方案 C）、Sprint 计划与验收标准（DoD）。
- `docs/AI-DEVELOPMENT-RECORD.md` — **交付物 C**：AI 辅助开发记录（如何使用 agentic AI、AI 犯过的错与纠正）。
- `docs/TECHNICAL-REPORT.md` — **交付物 E**：技术报告（11 问；含构念、评分、技术栈、部署 URL、试点计划）。
- `docs/process/` — **过程日志归档**：心理测量审查、UX 审查及对应修复记录，以及本交接文档（CONTINUATION.md）。

**配置驱动题库（已交付且通过结构校验）**
- `data/question-bank.json` — 60 题完整机器可读定义（Big Five 40 + AI 20）。结构与题目与 `assessment-framework.md` 严格对应，已校验"声明 itemIds == 实际 items"。

**Step 1 · 初始化项目（已验证）**
- 配置与骨架：`package.json`、`tsconfig.json`（strict + `@/*` 别名）、`next.config.mjs`、`.gitignore`、`.env.example`、`.env`、`.env` 本地 SQLite、Tailwind/PostCSS 配置、`src/app/{globals.css,layout.tsx,page.tsx}`（占位引导页）。
- **`readlink-polyfill.cjs`**（关键修复，见第 9 节）：修复本机 G: 盘 webpack 崩溃。
- `vitest.config.ts`：单测/集成测试配置（含 `src` 别名）。
- 验证结果：`npm run typecheck` 绿；`npm run build` 产出 `.next/BUILD_ID`；`npm run dev` 后 `GET /` 返回 200 且含标题"Web 心理测评平台"。

**Step 2 · 数据库（已验证）**
- `prisma/schema.prisma`：5 张表（Scale/Item/Participant/ResponseSession/ResponseItem），零 PII、不存 IP、级联删除。
- `prisma/migrations/20260912041119_init/`：首次迁移已应用。
- `prisma/seed.ts`：读 `question-bank.json` 写入 2 量表 + 60 题。
- `prisma/dev.db`：本地 SQLite 已生成并 seed。
- 校验结果：2 量表（personality=`big_five` / attitude=`ai_adoption`）、60 题（Big Five 40 + AI 20）、反向题 29（=20+9，与设计一致）、`O5.reverse=true`。

**Step 3 · 用户端 Backend API（已验证）**
- `src/lib/db.ts`：Prisma 客户端单例（避免 hot-reload 多次实例化）。
- `src/lib/questionnaire/loader.ts`：加载 `question-bank.json`，导出 `getItemIndex()`（code→item）、`getQuestionnairePayload()`（对外题库，不含答案）。
- `src/lib/validation.ts`：Zod 校验（participant / consent / submitResponses / questionnaire 查询）。
- API 路由（4 个，匿名、输入经 Zod 校验）：
  - `api/participants/route.ts`：POST 创建匿名参与者，返回 UUID。
  - `api/consent/route.ts`：POST 记录同意版本与时间。
  - `api/questionnaire/route.ts`：GET 返回量表+题目配置（不含答案）。
  - `api/responses/route.ts`：POST 提交作答（**已修复外键解析**，见第 9 节）。
- 验证结果：独立 Node(fetch) 集成测试 6 项全 PASS —— participants 201 / consent 200 / questionnaire 40+20 / responses 201 / 未知 itemId 400 / 越界 value 400。

**Step 4 · Frontend UI（已验证）**
- `tailwind.config.ts`：设计令牌（brand/dimension/ai 配色）+ 圆角/字体；颜色语义走 CSS 变量（`globals.css` 的 `rgb(var(--x)/<alpha>)`）。
- `src/app/globals.css`：light 主题令牌、body 背景、聚焦可见性。
- 基础组件库 `src/components/ui/`：`Container`、`Card`、`Button`(+`buttonClasses`)、`ProgressBar`、`Alert`、`Badge`、`SectionHeading`、`LikertScale`(client, 受控 5 点量表)、`SiteHeader`、`AdminNav`。
- `src/lib/utils.ts`：`cn()` 类名合并（避免引入 clsx）。
- 页面骨架（8 个路由）：`/`、`/consent`、`/assessment`、`/result`、`/admin`、`/admin/login`、`/admin/analytics`、`/admin/export`；根布局注入统一顶栏 + 页脚免责声明。
- 验证结果：`npm run typecheck` 绿；dev 下 8 个路由全部 200 且含预期文案（Likert 标签/顶栏/表单等）。
- **⚠️ 结果 API 尚未实现**：`api/results` 依赖评分引擎（Step 6），目前未建。

**Step 5 · Questionnaire 用户流程（已验证）**
- `src/lib/client/api.ts`：客户端 API 封装（`createParticipant` / `submitConsent` / `fetchQuestionnaire` / `submitResponses`），全程匿名。
- `src/lib/client/storage.ts`：localStorage 草稿与 participantId 管理（`CONSENT_VERSION="v1"`；键：`wap_participant_id`、`wap_draft_<pid>`）。
- `src/app/consent/page.tsx`：**重写为真实门槛**——勾选同意后才可开始；创建匿名参与者 → 记录同意 → 存 participantId → 跳转 `/assessment`。
- `src/app/assessment/page.tsx`：**重写**——从 `/api/questionnaire` 拉真实题库（60 题）；顶部吸顶进度条；每题选择即时写入本机草稿（刷新/关闭可续答）；可选人口学（匿名分桶）；全部作答后可提交 → 清草稿 → 跳转 `/result?pid=…`。
- `src/app/result/page.tsx`：改为**提交成功确认页**（读 `?pid`）；真正的维度报告待 Step 6/7。
- `src/lib/questionnaire/loader.ts`：公开题库 item 字段更名 `id → code`，与 `POST /api/responses` 的 code→id 解析契约对齐（消除歧义）。
- 测试（首次落地）：`src/lib/questionnaire/loader.test.ts`（6）+ `src/lib/client/storage.test.ts`（7），`npm test` 13/13 绿。
- 验证结果：typecheck 绿；`npm run build` 通过（11 路由）；独立 Node(fetch) 端到端 **7 项全 PASS**（participants 201 / consent 200 / questionnaire 60 题且均含 `code` / responses 201 / 未知 itemId 400 / 越界 value 400 / 未知 participant 404）。

**Step 6 · Scoring Engine（已验证，本项目质量重点）**
- `src/lib/scoring/stats.ts`：统计基础纯函数 —— `sum/mean/sampleVariance(n−1)`、`round`、`logGamma`(Lanczos)、`regularizedIncompleteBeta`(连分式)、`studentTCdf`、`pearsonR`、`pearsonPValue`。
- `src/lib/scoring/score.ts`：**评分引擎核心** —— `reverseRecode`(6−value)、`scoreDomain`（含缺失策略）、`computeAiAdoptionIndex`（合成指数）、`scoreScale`、`scoreAll`、`interpretBand`。
- `src/lib/scoring/reliability.ts`：Cronbach α（**先重编码再计算** + listwise 剔除不完整被试）、`buildDomainMatrix`、`alphaForDomain`。
- `src/lib/scoring/correlation.ts`：Pearson r 成对剔除矩阵（`pearsonPairwise` / `correlationMatrix` / `buildDomainSeries`）。
- `src/app/api/results/[pid]/route.ts`：**GET 结果 API** —— 读 participant → 最近一次 session 的作答 → `scoreAll()` → 返回维度分/分带/合成指数 + 3 条边界说明；未知参与者或未作答 → 404。
- 测试（**新增 66 个，总数达 79**）：`score.test.ts`(29) / `reliability.test.ts`(15) / `correlation.test.ts`(22)。
  - 已知答案算例（手工核算，误差 < 1e-6）：全 3 分 → 全维度 3.0；全 5 分 → Big Five 全 3.0、CN=4.0、合成指数=2.5；框架文档 §5 示例 [5,5,5,5]含 2 反向 → 3.0。
  - 反向题专项：正向 5 / 反向 1 → 维度分 5.0（漏掉重编码则为 3.0）；CN4 只翻转一次。
  - 缺失两分支：缺失 1 题 → imputed 且分数不变；缺失 2 题 → incomplete 且 score=null。
  - α 已知算例：完全一致 → 恰为 1；手算 α=0.41667；负协方差 → α=−12（允许负值不截断）；零方差 → null 并给出原因。
  - 相关：手算 r=2/√52；完全正/负相关 ±1；**p 值用统计表临界值反向校验**（df=8 临界 r=0.632 → p≈0.05，r=0.765 → p≈0.01）。
- `scripts/e2e-results.mjs` + `npm run test:e2e`：**端到端契约测试固化进仓库**（框架文档 §5 第 7 条要求）。28 项断言全 PASS，含「全 5 分手算核对」「只答 O 维度→其余 incomplete、合成指数 null」「错误处理 404」。
- 验证结果：typecheck 绿；`npm test` **79/79 绿**；`npm run build` 通过（`/api/results/[pid]` 已注册为动态路由）；E2E **28/28 PASS**。

**Step 6 附带 · UI 去重（用户反馈）**
- `src/components/ui/SiteHeader.tsx`：改为 client 组件 + `usePathname()` **自适应顶栏** —— 首页 `/` 只保留「管理端」（主 CTA 已在 hero，不再重复）；作答流程页显示「参与测评」+「管理端」；`/admin*` 显示「返回测评首页」。
- `src/app/page.tsx`：hero 移除与顶栏重复的「管理端」按钮，次按钮改为「查看测评内容」（锚点跳转到 `#scales` 双量表卡）。
- 验证：首页顶栏仅 1 个 `/admin` 链接、无「参与测评」；`/consent` 顶栏两个入口正常；`/admin` 显示「返回测评首页」。

**Step 7 · Result Visualization（已验证）**
- `data/interpretations.json`：**解读文案配置（新）**——10 个维度 + 1 个合成指数 × low/medium/high 三段中性文案；含顶层 `usage`/`note` 声明（非诊断、无常态模、N 与 CN 高分段不做好坏定性）。
- `src/lib/design/colors.ts`：**可视化配色单一来源**（`DIMENSION_COLORS`/`AI_COLORS`/`BAND_COLORS`），供 Recharts 消费（Recharts 只吃具体色值，无法读 Tailwind 类）。与 `tailwind.config.ts` 的 `dimension.*`/`ai.*` 保持同步（文件内有维护约定注释）。
- `src/lib/questionnaire/loader.ts`：新增 `getInterpretations()` / `getDomainInterpretation(key, tone)` / `getCompositeInterpretation(key, tone)`；**未配置时返回 `null` 而非临时编造文案**。
- `src/app/api/results/[pid]/route.ts`：响应新增每维度/合成指数的 `interpretation` 字段 + `interpretationConfig.version`；边界说明增至 4 条（新增「CN 为反向语义维度」提示）。
- `src/lib/result/view-model.ts`：**结果视图模型（纯函数）**——`toRadarData`（固定 O→C→E→A→N 轴序，缺分以 0 占位并标 `missing`）、`toBarData`（CN 标 `concern` + 独立配色）、`isConcernDomain`（依据配置 `polarity` 判定，CN 兜底）、`hasIncompleteDomains`、`findScaleByType`、`formatScore`、`formatCompletion`。
- `src/components/charts/BigFiveRadar.tsx`：Recharts 雷达图，**固定 0–5 半径刻度、不做样本归一化**（小样本归一化会把"相对分"伪装成"绝对水平"）。
- `src/components/charts/AiDomainBar.tsx`：AI 五维度条形图，柱顶标数值；图下固定"读图提示"说明 CN 为反向语义。
- `src/components/result/DomainBreakdown.tsx`：维度明细（分数 + 分带徽标 + 相对位置条 + 中性解读；incomplete/imputed 分别提示）。
- `src/app/result/page.tsx`：**重写为真实报告页**——`?pid` → `GET /api/results/:pid`；加载/错误/无 pid/重试四种状态；雷达图 + 条形图 + 合成指数卡（含公式与"担忧已翻正"说明）+ 边界说明卡；免责声明置于顶部固定展示。
- 内容调整（心理测量学建议）：维度 `N` 展示名由「神经质 Neuroticism」改为「**情绪敏感性 Neuroticism**」（key 仍为 `N`，评分与已有数据不受影响），减少污名化。
- 测试（**新增 19，总数达 98**）：`src/lib/result/view-model.test.ts`(15) —— 轴序稳定、缺分占位与 `missing` 标记、CN `concern` 判定（含配置驱动与兜底两情形）、数值不被翻转、格式化边界；`src/lib/questionnaire/interpretations.test.ts`(4) —— **文案配置完整性**（每个维度/合成指数三段俱全，漏配即失败）、取用接口 null 语义、N 与 CN 文案不含污名化词表。
- E2E 扩展（28 → **41 项断言**）：新增 [6] 解读文案配置契约、[7] 文案随分带三段互异（同一维度 low/medium/high 必须给出不同文案）、[8] 结果页可达性。
- 验证结果：typecheck 绿；`npm test` **98/98 绿**；`npm run build` 通过（`/result` 109 kB，Recharts 引入后体积符合预期）；E2E **41/41 PASS**（对生产构建运行）。

**Step 7 附带 · 开发环境健壮性（用户反馈「预览后进程未结束」）**
- 根因：此前用 `(npm run dev &)` 方式启动，进程被**孤儿化**并留在系统中；Git Bash 的 `pkill` 在 Windows 上拿不到其它会话的进程表，无法清理，于是每次预览都累积一个服务器（本次一次性清出 **7 个**）。
- `scripts/stop-dev.ps1` + `npm run dev:stop`：**一键清理**（仅结束监听本项目端口的 node 进程，不做任何文件删除）。
- **⚠️ 该 .ps1 必须保存为「UTF-8 with BOM」**：Windows PowerShell 5.1 会按 ANSI 读取无 BOM 的脚本，中文注释与输出会变乱码并直接引发语法错误（已实测踩坑，报错形如 `字符串缺少终止符`）。改动该文件后请确认 BOM 仍在（前三字节 `EF BB BF`）。
- 同时发现：本沙箱的**安全删除防护会拦截"批量删除 ≥50 个文件"**，导致 `next dev` 启动时清空 `.next` 失败并崩溃（报 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`）。规避：启动 dev 前先自行清空 `.next`，或直接改用生产模式预览。

**Step 8 · Admin Dashboard（已验证）**
- `src/lib/auth.ts`：**鉴权核心（纯逻辑，不 import next/*，因此可单测）**——`signSessionToken`/`verifySessionToken`（`base64url(payload).base64url(HMAC-SHA256)`，**先验签后解析**、`timingSafeEqual` 比较、过期即拒）；`checkCredentials` 用 SHA-256 定长化后常量时间比较，且**两次比较都执行**（写成 `&&` 短路会通过耗时泄露「用户名猜对了没」）；`weakCredentialReasons()` 报告弱凭据原因；`sessionCookieOptions` / `parseCookieHeader` / `isHttpsRequest`。**一律 fail closed**：密钥缺失/过短 → 拒绝一切令牌，没有「开发模式跳过校验」后门。
- `src/lib/admin/guard.ts`：Next 胶水层 —— `guardAdminApi(req)`（Route Handler 返回 401 或 null）、`requireAdminPage()`（页面未登录 `redirect('/admin/login')`）、`getAdminSession()` / `getAdminSessionFromRequest()`、`unauthorizedResponse()`。
- `src/lib/admin/throttle.ts` + `login-throttle.ts`：登录失败限流（默认 15 分钟窗口内 20 次失败，按来源 IP 分桶，`maxKeys` 防内存膨胀），`now` 可注入以便确定性单测。
- `src/lib/http.ts`：`readJsonBody(req, maxBytes)`（登录端点请求体上限 4096B，防超大 body 打满内存；先看 Content-Length 再复核实际长度）、`clientIp(req)`。
- `src/lib/admin/types.ts`：**无依赖的纯类型**（图表是客户端组件，而 stats.ts 间接 import `node:fs`，故类型单列一个文件以便客户端安全 `import type`）。
- `src/lib/admin/stats.ts`：**统计聚合纯函数** —— `computeAdminStats` / `summarizeDomains` / `summarizeIndex` / `summarizeElapsed` / `buildHistogram` / `median` / `formatDuration` / `buildExportTable` / `toCsv` / `csvCell`；`scoreRecords()` 预先评分一次供三处复用。
- `src/lib/admin/load.ts`：**取数（server-only）** —— `loadAdminRecords()` / `loadAdminStats()`；每名参与者只取**最新一次已完成会话**，与 `/api/results/:pid` 取 `sessions[0]` 的口径一致。
- `src/lib/admin/guard-coverage.test.ts`：**静态扫描** `src/app/api/admin/**/route.ts`，白名单（login/logout/session）之外漏调 `guardAdminApi` 即测试失败；同时断言白名单本身没被偷偷扩大。
- 管理端 API：`POST /api/admin/login`（统一 401 文案不做账号枚举、限流、503 表示密钥未配置）、`POST /api/admin/logout`（幂等、不要求登录）、`GET /api/admin/session`（探针，未登录返回 **200 + `authenticated:false`** 而非 401）、`GET /api/admin/stats`、`GET /api/admin/export?format=csv`（非 csv 显式 400）。
- 管理端页面：`/admin`（服务端聚合 + 指标卡 + 完成漏斗 + 维度均值图 + 指数直方图 + 逐维 n/sd 明细表 + 口径说明）、`/admin/login`（服务端判会话，已登录直接跳 `/admin`；客户端表单）、`/admin/export`（列出将导出的全部列 + 下载入口）、`/admin/analytics`（**已加守卫**，数据待 Step 9）。
- 图表：`src/components/charts/DomainMeanChart.tsx`（**Y 轴固定 0–5 不缩放**；**刻意不画误差棒**——n=1 时样本 sd 无定义，画 0 等于宣称「无差异」；改为悬浮提示 + 明细表给出 sd/n）、`IndexHistogram.tsx`（1–5 等宽 0.5，8 箱；标注 n 并声明「箱高由个别被试决定」）。
- 组件：`src/components/admin/{StatCard,DomainStatsTable,AdminLoginForm,AdminLogoutButton}.tsx`；`src/components/ui/AdminNav.tsx` 增加「退出登录」。
- **CSV 安全与兼容**：`csvCell()` 对以 `= + - @ \t \r` 开头的单元格加前导单引号（**CSV 公式注入**防护，人口学字段来自客户端自由文本）；含 `",\r\n` 的值按 RFC 4180 加引号并转义双引号；CRLF 换行；响应前置 **UTF-8 BOM**（否则 Excel 中文列名乱码）；`Content-Disposition: attachment`。
- **导出列**：`participant_id, status, created_at, consent_at, completed_at, elapsed_sec, age_range, gender, education` + 10 个维度列 + `ai_adoption_index` + `answered_items, item_total, completion_rate`；不可用维度**留空而非 0**。
- 弱凭据告警：仪表盘顶部在检测到示例默认凭据/过短密钥时亮出**醒目红色告警**（不在生产直接拒绝登录——本地预览本身就是 `NODE_ENV=production` 下跑 `npm start`，硬拒绝会让本地无法登录）。
- 测试（**新增 74，总数达 172**）：`auth.test.ts`(35)、`throttle.test.ts`(7)、`stats.test.ts`(29：逐维 n / sd-null 与 sd-0 的区分 / 空数据 null 语义 / 分带计数 / 直方图边界 / CSV 注入与转义 / 表头列名)、`guard-coverage.test.ts`(4)。E2E 扩展 41 → **93 项断言**（新增 [9] 管理端鉴权契约、[10] 管理端页面守卫）。
- 验证结果：typecheck 绿；`npm test` **172/172 绿**；`npm run build` 通过（`/admin` 198 kB，含 Recharts）；E2E **93/93 PASS**（对生产构建运行）。
- **⚠️ E2E 踩坑**：`res.text()` 会按 WHATWG 规范**剥离 BOM**，所以校验 BOM 必须用 `res.arrayBuffer()` 看原始字节，否则永远假阴性。

**Step 8 附带 · 清理脚本加固（用户反馈「dev:stop 曾静默失手」）**
- 现象：初版 `stop-dev.ps1` 只用 `Get-NetTCPConnection` 探测；该 cmdlet 在受限/沙箱会话下会**静默返回空**，脚本随即打印「没有发现被占用的端口」并 exit 0 —— 用户以为清理过了，实际一个进程都没杀（正是最坏的一类失败）。
- 修复：改为**双通道探测** —— `netstat -ano`（纯 exe，最稳）+ `Get-NetTCPConnection`（补充），取并集按 PID 去重；**两条通道都不可用时显式报错并 exit 3**，绝不静默 no-op；新增 `-DryRun`（只列出不杀，`npm run dev:stop:dry`）；非 node 进程只报告不处理；结束后台端口复检并返回非 0。
- ⚠️ 该脚本在**沙箱化的 PowerShell 工具里两条通道都会被屏蔽**（会正确报 exit 3）；从 `npm run dev:stop`（普通 shell）调用则工作正常 —— 已实测：DryRun 正确列出 PID、真实运行正确释放端口。

**Step 7 修复 · 结果页整页空白（2026-09-12，用户实测发现）**
- **现象**：用户打开结果页，只看到页头、免责声明与「大五人格画像 / AI 技术采纳态度」两张卡片的**标题**，卡内**没有任何维度名称、分数、图表**。
- **根因（数据契约断裂）**：`data/question-bank.json` 的两个量表**从未声明 `type` 字段**（只有 `key/name/source/domains/items`）。但：
  - `loader.ts` 的 `BankScale` 声明了 `type: string; // "personality" | "attitude"`；
  - `score.ts` 输出 `type: scale.type` → 实际为 `undefined`；
  - **`JSON.stringify` 会静默丢弃 `undefined` 字段** → HTTP 响应里的 scale 根本没有 `type`；
  - 结果页用 `findScaleByType(result, "personality" / "attitude")` 定位量表 → 找不到 → `BigFiveRadar`/`AiDomainBar` 拿到空数组直接 `return null`、`DomainBreakdown` 的 domains 为空 → 只剩卡片标题。
  - `prisma/seed.ts` 里的 `scale.key === "big_five" ? "personality" : "attitude"` 是**硬编码**，正因为题库没有该字段：DB 有 type、引擎没有，形成两份真相。
- **修复**：`type` 补进题库（`big_five → "personality"`、`ai_adoption → "attitude"`，**单一事实源**）；`seed.ts` 改为直接读 `scale.type`，取值非法时**显式抛错**（不再写入 undefined）；`seed.ts` 本地 `BankScale` 类型补上该字段。
- **为何此前完全没被发现**：`view-model.test.ts` 用**手写 fixture**，`type` 是手填的 → fixture 与真实产出漂移；结果页是客户端渲染，E2E 只能断言 Suspense 外壳 + 200。**两个盲区叠加 = 页面全空而测试全绿。**
- **新增三道守卫**（均已实测能拦住该缺陷）：
  1. `loader.test.ts`：断言每个量表都有合法且互不重复的 `type`（数据层，最便宜）。
  2. `src/lib/result/pipeline.test.ts`（新，6 项）：走**真实链路** 题库 → `scoreAll()` → **`JSON.parse(JSON.stringify(…))`** → 视图模型，断言能定位量表、雷达 5 轴、条形 5 柱、合成指数可展示、全答 3 分时各维度分恰为 3。**JSON 往返是刻意保留的**——故障正是由它抹掉 `undefined` 造成的。实测：去掉题库的 `type` 后该文件立刻 7 项变红（`expected null not to be null`，与线上症状一致）。
  3. `scripts/smoke-render.mjs`（新，`npm run test:render`，11 项）：用**本机 Chrome/Edge 无头模式**（`--headless=new --dump-dom --virtual-time-budget`）真实执行客户端 JS，断言页面上出现 API 返回的**全部 10 个维度名与 10 个格式化分数**、分带标签、内联 `<svg>`、合成指数，且**不再停留在「正在加载」**。以 API 为真值、不硬编码维度名（配置驱动）。找不到浏览器内核时**显式打印「跳过」并 exit 0**，不伪造成功。
- **教训**：验证渲染逻辑时，输入必须来自**真实产出**，不能只用手捏的 fixture；客户端渲染的页面**必须有一条真实浏览器的断言**，否则「全绿但空白」会长期潜伏。

**Step 9 · Analytics 管理端分析页（2026-09-12 完成并验证）**
- 交付：`/admin/analytics` 由骨架升级为**真实数据页**（**服务端渲染**——分析含 bootstrap 计算，放服务端省客户端资源，也避免 Step 7 那类「客户端取数失败 → 标题在、内容空」的失败模式）。
- **分析聚合层** `src/lib/admin/analysis.ts`（纯函数，复用 Step 6 引擎，不重写统计）：
  - `analyzeReliability()`：逐维度 Cronbach α + **95% 百分位 bootstrap 区间** + k / listwise n / 被剔除人数 + **题目平均两两相关**（由 Spearman-Brown 反解，剔除 k 对 α 的影响，使 k=4 与 k=8 的维度可比）+ 惯例等级描述。
  - `analyzeCorrelation()`：10×10 Pearson r 矩阵（成对剔除 → 每格自带 n）+ 双尾 p + **Bonferroni 阈值与校正前后显著数** + r 的 95% 近似半宽（Fisher z）。
  - `analyzeItems()`：单题 1–5 各档人数（**原始 + 重编码两套**）、未作答数、原始/重编码均值、sd、零变异与地板/天花板标记。
- **API**：`/api/admin/{reliability,correlation,items}`（三个都调 `guardAdminApi`，否则 `guard-coverage.test.ts` 失败）；`/api/admin/export` 新增 **`format=raw`**（逐题原始作答宽表）。
- **组件**：`CorrelationHeatmap.tsx`（**只画下三角**、每格同时显示 r 与 n、色阶不饱和到顶以保证文字可读、**不依赖客户端能力 → 保持服务端组件**）、`AlphaTable.tsx`、`ItemDistributionChart.tsx`（原生 `<details>` 折叠，服务端渲染即可用）。
- **独立评分交叉验证（框架文档 §5 第 5 条要求，首次落地）**：`scripts/verify-scoring.mjs`（`npm run verify:scoring`）**刻意不 import 项目任何代码**，独立重写一遍评分口径，然后用两条独立通道对账：`format=csv`（程序输出）vs `format=raw`（原始作答）→ **独立重算**；再抽样与 `/api/results/:pid` 第三条通道比对；并输出 `verify-output/crosscheck-*.csv`（列为 `<维度>_indep / _prog / _diff`）供人工在 Excel 再看一遍，最后打印**手算样例**（含逐题原始→重编码→均值的完整算路）。
  - 实测：**96 名参与者 / 1056 个数值逐格一致（容差 1e-4）**，抽样结果页一致，8/8 断言通过。
  - 为什么必须重写实现：若两边共用同一份代码，「验证」就退化成「用程序的结果验证程序」，口径整体错掉也照样全绿。唯一共享的是**题库配置**（题目归属与反向标记属「数据」而非「实现」）。
- 测试（**新增 46，总数达 218**）：`analysis.test.ts`(32：α 无定义/null 语义、**负 α 如实返回**、listwise 剔除计数、bootstrap 同种子可复现、相关对称性与 Bonferroni、**计数守恒**、**反向题不因原始分被误报为地板效应**)、`stats.test.ts` 新增原始导出与 `elapsedSecOf`(6)。E2E 93 → **139 项断言**（新增 [11] 分析契约 46 项）。
- 验证结果：typecheck 绿；`npm test` **240/240**（Step 9 收尾 218，Step 10 新增 22；**当前全量 258，含部署后新增 18，见 §4**）；`npm run build` 通过；E2E **164/164**（Step 10 新增 28 项部署安全契约）；`test:render` **11/11**；`verify:scoring` **8/8**（1056 个数值一致）。
- ⚠️ **当前库内含大量 E2E 制造的测试数据**（全 3 分、全 5 分、只答单维度等），因此分析页上的 α 与相关数值**不具实质心理测量学意义**（会看到 α 极低甚至为负、维度间相关接近 0）。要看真实结果需先清库（`npm run db:reset`）再收集真人数据。

**部署后补充（2026-09-13，已验证）**
- **两轮只读专家审查**：先以「心理测量算法审查专家」角色审查评分系统（结论：计算层正确，仅解释/呈现层有 P1–P9 问题），再以「UX Designer」角色审查 Consent / 问卷 / 结果 / 管理四端（P0–P1）。两轮都**先只读出报告、不改代码**，确认清单后再按优先级落地，且只动体验/解释层、不动计算层。
- **评分解释层修正（仅呈现，不动计算）**：分带改为「相对量表中点 3.0」的中性表述；CN 保留为独立反向语义维度；AI 合成指数由"得分"降级为明确标注的「等权探索性指数」（五域算术平均 /5，每域权重 0.20）；结果 API 增加 `qualityFlags`（直线作答 / 低区分度粗筛，仅提示不计分）；管理端分析页补充"AI 子维度仅 4 题、α 易偏低"的局限说明。
- **UX 修正**：结果页"读图提示"改为带边框浅底的独立提示框，并与逐维度分数列表间加分隔线拉开间距（避免与分数粘连）；移动端 Likert 显示缩写标签 + 44px 点击热区；问卷页加"保存并稍后继续"CTA、回到顶部悬浮按钮、吸顶"去提交"入口；新增零后端反馈入口（`mailto` + 第三方表单，见 `src/lib/site-config.ts`）。
- **管理端提交明细（新增）**：`/admin/submissions` 列出每条提交（填写时间 / 状态 / 题数 / 匿名 ID / 操作），支持按时间排序（默认提交时间倒序），每行带删除按钮（二次确认后级联删除该参与者的全部作答）。**专为测试期反复提交污染聚合统计而做**（见 §5、§6 与 §10 第 13 条）。
- **知情同意措辞修正**：原"提交后无法自行删除单条记录"与管理端可删除功能矛盾，已改为"参与者可经反馈渠道申请删除、管理员可在管理端随时删除任意提交"。
- **交付物 C/E 文档完成**：`docs/AI-DEVELOPMENT-RECORD.md`、`docs/TECHNICAL-REPORT.md` 已按挑战赛要求撰写（技术报告第 7 问如实标注试点 D 尚未开展）。
- **⚠️ 剩余：真实用户试点（交付物 D）**：尚无 ≥10 名独立参与者完成的证据；反馈机制（`site-config.ts` 已配真实反馈邮箱 + 结果页"留下反馈"入口）已就绪，待部署稳定后招募。

---

## 3. 当前未完成的功能（按 Step 顺序）

| Step | 模块 | 状态 | 说明 |
|------|------|------|------|
| 1 | 初始化项目 | ✅ 已完成 | 依赖安装、构建、dev、typecheck、polyfill 均验证通过 |
| 2 | 数据库 | ✅ 已完成 | schema + 迁移 + seed，库含 60 题、29 反向题 |
| 3 | Backend API（用户端） | ✅ 已完成 | participants/consent/questionnaire/responses 已验证；results 待 Step 6 接线 |
| 4 | Frontend UI | ✅ 已完成 | 设计令牌 + 基础组件库 + 8 个页面骨架（含顶栏/页脚） |
| 5 | Questionnaire | ✅ 已完成 | Consent 门槛、真实题库、进度条、localStorage 草稿续答、提交；E2E 7 项通过 |
| 6 | Scoring Engine | ✅ 已完成 | 4 个纯函数模块 + 66 个新单测 + `/api/results/[pid]`；E2E 28 项通过 |
| 7 | Result Visualization | ✅ 已完成 | 雷达图 + 条形图 + 合成指数 + 配置驱动中性解读；E2E 41 项通过。**曾因题库缺 `scale.type` 导致整页空白，已修复并补 `pipeline.test.ts` / `test:render` 两道守卫** |
| 8 | Admin Dashboard | ✅ 已完成 | 签名会话鉴权（API 401 / 页面 307）+ 统计仪表盘 + 分布图 + CSV 导出；E2E 93 项通过 |
| 9 | Analytics | ✅ 已完成 | 分析页（服务端渲染）+ 三个分析 API + α(bootstrap CI)/相关热力图/题项分布 + **独立评分交叉验证**；E2E 164 项通过 |
| 10 | Deployment | ✅ 已部署上线（公开可用） | 生产环境自检（构建期+运行期双层硬拦截）/ 密钥泄露扫描（6 类检查，经探针验证）/ 安全响应头 / 强随机凭据生成 / Postgres 派生方案 / `SECURITY.md`。**代码侧与生产配置均完成**；若曾重置 Neon 密码，需同步更新 Vercel `DATABASE_URL`（Pooled 串）后 Redeploy（见 §10 第 13–14 条） |

> Step 9 分析引擎与鉴权均已就位；Step 10 加固已全部落地并**已在 Vercel + Neon 上验证**。**上线前请按 [`SECURITY.md`](../../SECURITY.md) 执行，不要跳过 `npm run deploy:check`。**
> ⚠️ Step 10 新增了一条**所有管理端 API 都会经过**的部署健康闸门（`guard.ts::deploymentBlockedResponse()`）：生产环境下若凭据或数据库连接不合格，接口一律 503。本地以 `NODE_ENV=production` 预览依赖 `.env` 中的 `ALLOW_INSECURE_DEFAULTS=1`（**该变量绝不可出现在部署平台**）。
> ⚠️ 新增管理 API 时**必须**首行调用 `guardAdminApi(req)`，否则 `guard-coverage.test.ts` 会失败。

---

## 4. 已确定的技术架构与设计决策

**技术栈（方案 C，已在 package.json 落地）**
- 框架：Next.js 14（App Router）+ React 18 + TypeScript（strict）。
- 样式：Tailwind CSS 3。
- 可视化：Recharts 2（Step 7 起实际使用：结果页雷达/条形图、管理端均值图/直方图）。
- ORM/DB：Prisma 5；**本地 SQLite（`file:./dev.db`），生产 PostgreSQL（Neon）**，同 schema 零改代码切换（仅改 provider + `DATABASE_URL`）。
- 输入校验：Zod 3（已用）。
- 鉴权：自研轻量方案（不引入外部 IdP）——`ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_SESSION_SECRET` + HMAC-SHA256 签名会话、httpOnly cookie、8 小时有效；无状态、无会话表。
- 测试：Vitest 2（已配置，**已落地 258 个单测并全绿**（Step 9 收尾 218，Step 10 新增 22，部署后新增 18：提交明细/排序 `submissions.test.ts` 等）：题库契约 7（含 `type` 硬契约）+ 解读文案完整性 4 + 草稿持久化 7 + 评分 29 + 信度 15 + 相关 22 + 结果视图模型 15 + **结果数据链 6** + 鉴权 35 + 限流 7 + 管理端统计 35（含原始作答导出 / `elapsedSecOf`）+ **管理端分析 32** + 守卫覆盖 4 + 凭据强度规则 7 + 生产环境自检 15 + 提交明细/排序 18）。另有 `test:e2e`(164)、`test:render`(11) 与 `verify:scoring`(8)。
- 三层测试命令：`npm test`（**258 单测**）、`npm run test:e2e`（**164 项** HTTP 契约断言，含 Step 10 部署安全契约）、`npm run test:render`（**11 项**真实浏览器渲染断言 —— 用**本机** Chrome/Edge 无头模式，专门覆盖「客户端渲染的页面上到底有没有分数」这个盲区）。
- **Playwright 交互级 E2E 仍未做**：点击选项、表单提交、刷新续答等**交互动作**未验证；渲染结果层已由 `test:render` 覆盖（见 §9 第 8 条）。
- 部署：Vercel（前端+API 一体）+ Neon Postgres。

**架构核心思想（务必延续）**
- **配置驱动**：题目/维度/反向题全部在 `data/question-bank.json`，评分引擎只读配置，**新增/改题不碰引擎代码**。
- **纯函数评分引擎**：`src/lib/scoring/{stats,score,reliability,correlation}.ts` 与 DB 完全解耦（`scoreAll(answers)` 只吃 `{code: 1..5}`），是"评分必须测试"的落点。
- **单一代码库**：前端页面与 API 路由同在 `src/app`，减少部署单元与失败面。

**系统分层**
```
Browser(用户端/管理端)
   ↓ REST / JSON
Next.js Route Handlers (src/app/api/*)
   ↓ 调用
lib/scoring (纯函数, 已建) + lib/db (Prisma 单例)
   ↓
SQLite(dev) / Postgres(prod)
```
管理端所有统计/导出 API 必须**统一走 `guardAdminApi(req)`**（无令牌 → 401）；受保护页面走 `requireAdminPage()`（未登录 → 307 `/admin/login`）。**刻意不用 middleware**：Edge Runtime 拿不到 Node 加密原语，会逼出第二套验签实现，而「鉴权实现分叉」是最危险的一类缺陷。

**⚠️ 本机构建修复（务必保留）**：`readlink-polyfill.cjs` 必须存在，且 `dev/build/start` 脚本用 `node -r ./readlink-polyfill.cjs next …` 调用。原因与行为见第 9 节；该补丁在 macOS/Linux/Vercel 上是安全的空操作（`lstat` 不返回 S_IFLNK 时不重写），只在 G: 盘 Windows 环境生效。

---

## 5. 当前项目文件结构（实际落地）

```
G:\web-assessment-platform\
├── docs/
│   ├── assessment-framework.md   # 测评内容设计（评分逻辑权威源）
│   ├── dev-plan.md               # 目录/技术栈/Sprint/DoD
│   ├── AI-DEVELOPMENT-RECORD.md  # 交付物 C：AI 辅助开发记录
│   ├── TECHNICAL-REPORT.md       # 交付物 E：技术报告（11 问）
│   └── process/                  # 过程日志归档（审查/修复记录 + CONTINUATION.md）
├── data/
│   ├── question-bank.json        # 配置驱动题库（60 题，单一事实源）
│   └── interpretations.json      # 解读文案（维度 × 分带，Step 7；改文案不动代码）
├── prisma/
│   ├── schema.prisma             # 5 张表，已迁移+seed
│   ├── seed.ts                   # 读 JSON 写库 60 题
│   ├── dev.db                    # 本地 SQLite（已含数据，gitignore 忽略）
│   └── migrations/20260912041119_init/
├── src/
│   ├── app/
│   │   ├── globals.css           # 设计令牌（light 主题）
│   │   ├── layout.tsx            # 根布局：SiteHeader + 页脚免责声明
│   │   ├── page.tsx              # 引导页（hero + 双量表卡 + 免责）
│   │   ├── consent/page.tsx      # 知情同意（真实门槛：勾选→建参与者→跳转）
│   │   ├── assessment/page.tsx   # 作答页（真实题库+进度+草稿续答+提交）
│   │   ├── result/page.tsx       # ★ 结果报告页（雷达图+条形图+合成指数+中性解读，Step 7）
│   │   ├── admin/login/page.tsx  # ★ 登录页（服务端判会话；已登录直接跳 /admin，Step 8）
│   │   ├── admin/page.tsx        # ★ 仪表盘（服务端聚合 + 图表 + 明细表，Step 8）
│   │   ├── admin/analytics/page.tsx  # 分析页（已加守卫；α/相关/题项数据待 Step 9）
│   │   ├── admin/export/page.tsx # ★ 导出页（列出全部导出列 + 下载入口）
│   │   ├── admin/submissions/page.tsx # ★ 提交明细页（按填写时间排序 + 逐条删除，部署后新增）
│   │   └── api/
│   │       ├── participants/route.ts   # POST 匿名参与者
│   │       ├── consent/route.ts        # POST 记录同意
│   │       ├── questionnaire/route.ts  # GET 题库（无答案）
│   │       ├── responses/route.ts      # POST 提交作答（已修外键）
│   │       ├── results/[pid]/route.ts  # GET 结果（评分引擎消费，Step 6）
│   │       └── admin/                  # ★ 管理端 API（Step 8）
│   │           ├── login/route.ts      # POST 登录（限流 + 统一 401，不枚举账号）
│   │           ├── logout/route.ts     # POST 登出（幂等，不要求登录）
│   │           ├── session/route.ts    # GET 会话探针（未登录 200 + authenticated:false）
│   │           ├── stats/route.ts      # GET 聚合统计（guardAdminApi）
│   │           ├── export/route.ts     # GET CSV 导出（format=csv 维度分 / format=raw 逐题原始分；注入防护 + BOM）
│   │           ├── reliability/route.ts # ★ GET 信度 α + bootstrap CI（Step 9）
│   │           ├── correlation/route.ts # ★ GET Pearson r 矩阵 + Bonferroni（Step 9）
│   │           ├── items/route.ts      # ★ GET 题项反应分布（Step 9）
│   │           ├── submissions/route.ts # ★ GET 提交明细列表（guardAdminApi，按 sort/dir 排序，部署后新增）
│   │           └── submissions/[pid]/route.ts # ★ DELETE 级联删除某参与者全部作答（部署后新增）
│   ├── lib/
│   │   ├── db.ts                 # Prisma 单例
│   │   ├── utils.ts              # cn() 类名合并
│   │   ├── http.ts               # ★ readJsonBody（请求体上限）/ clientIp（Step 8）
│   │   ├── auth.ts               # ★ 鉴权核心（纯逻辑：HMAC 签名会话 + 常量时间凭据，Step 8）
│   │   ├── design/colors.ts      # ★ 可视化配色单一来源（与 tailwind 同步）
│   │   ├── admin/                # ★ 管理端（Step 8–9）
│   │   │   ├── guard.ts          # Next 胶水：guardAdminApi / requireAdminPage
│   │   │   ├── guard-coverage.test.ts # 静态扫描：漏加守卫即失败（4）
│   │   │   ├── login-throttle.ts # 登录限流单例
│   │   │   ├── throttle.ts       # 限流实现（失败计数 + 窗口，now 可注入）
│   │   │   ├── throttle.test.ts  # 限流测试（7）
│   │   │   ├── types.ts          # 无依赖纯类型（供客户端 import type）
│   │   │   ├── stats.ts          # 统计聚合 + CSV 构建（纯函数，含 buildRawExportTable）
│   │   │   ├── stats.test.ts     # 聚合/缺失语义/CSV 注入/原始导出测试（35）
│   │   │   ├── analysis.ts       # ★ 分析聚合（纯函数：α+bootstrap / 相关 / 题项分布，Step 9）
│   │   │   ├── analysis.test.ts  # ★ 分析测试（32：null 语义 / 负 α / 可复现 / 计数守恒）
│   │   │   ├── load.ts           # 取数（server-only，Prisma；loadAdminAnalysis 一次算齐三份）
│   │   │   └── submissions.ts   # 提交明细取数（server-only；loadParticipantsList + 排序纯函数，部署后新增）
│   │   ├── auth.test.ts          # 鉴权测试（35：验签/篡改/过期/常量时间/弱凭据/cookie）
│   │   ├── questionnaire/
│   │   │   ├── loader.ts         # 题库 + 解读文案加载（公开输出 code）
│   │   │   ├── loader.test.ts    # 题库契约测试（7，含每个量表必须有合法 type）
│   │   │   └── interpretations.test.ts  # 解读文案完整性（4）
│   │   ├── result/
│   │   │   ├── view-model.ts     # ★ 结果视图模型（纯函数：雷达/条形数据映射）
│   │   │   ├── view-model.test.ts # 视图模型测试（15，手写 fixture）
│   │   │   └── pipeline.test.ts  # ★ 结果数据链回归（6）：真实引擎 → JSON → 视图模型
│   │   ├── scoring/              # ★ 评分引擎（纯函数，Step 6）
│   │   │   ├── stats.ts          # 均值/样本方差/t 分布/Pearson/p 值
│   │   │   ├── score.ts          # 反向重编码+维度分+缺失策略+合成指数
│   │   │   ├── score.test.ts     # 已知答案测试（29）
│   │   │   ├── reliability.ts    # Cronbach α + 维度矩阵构建
│   │   │   ├── reliability.test.ts  # α 已知算例/边界（15）
│   │   │   ├── correlation.ts    # Pearson r 成对剔除矩阵
│   │   │   └── correlation.test.ts # 相关/p 值临界值校验（22）
│   │   ├── client/
│   │   │   ├── api.ts            # 客户端 API 封装（含 fetchResult + 类型）
│   │   │   ├── storage.ts        # 草稿 / participantId（localStorage）
│   │   │   └── storage.test.ts   # 草稿持久化测试（7）
│   │   └── validation.ts         # Zod 校验
│   └── components/
│       ├── ui/                   # 基础组件库（已建）
│       │   ├── Container.tsx  Card.tsx  Button.tsx  ProgressBar.tsx
│       │   ├── Alert.tsx  Badge.tsx  SectionHeading.tsx
│       │   ├── LikertScale.tsx (client)  AdminNav.tsx
│       │   └── SiteHeader.tsx (client, 路由自适应去重)
│       ├── charts/               # ★ 图表组件
│       │   ├── BigFiveRadar.tsx  # 结果页雷达图（固定 0–5 刻度；client）
│       │   ├── AiDomainBar.tsx   # 结果页 AI 维度条形图（含 CN 反向语义提示；client）
│       │   ├── DomainMeanChart.tsx  # 管理端各维度均值图（固定 0–5；刻意不画误差棒）
│       │   ├── IndexHistogram.tsx   # 管理端合成指数分布直方图（8 箱，标注 n）
│       │   ├── CorrelationHeatmap.tsx     # ★ 相关热力图（只画下三角；每格含 r 与 n；服务端组件）
│       │   └── ItemDistributionChart.tsx  # ★ 题项分布（原生 details 折叠；服务端组件）
│       ├── admin/                # ★ 管理端组件（Step 8–9）
│       │   └── AlphaTable.tsx    # ★ 信度表（α / bootstrap CI / k / n / 剔除 / 题目平均相关）
│       │   ├── StatCard.tsx  DomainStatsTable.tsx
│       │   ├── AdminLoginForm.tsx (client)  AdminLogoutButton.tsx (client)
│       │   └── DeleteParticipantButton.tsx (client)  # 提交明细删除按钮（部署后新增）
│       └── result/
│           └── DomainBreakdown.tsx  # 维度明细（分数+分带+解读）
├── scripts/
│   ├── e2e-results.mjs           # HTTP 契约测试（npm run test:e2e，139 断言）
│   ├── smoke-render.mjs          # ★ 真实浏览器渲染冒烟（npm run test:render，11 断言；用本机 Chrome/Edge 无头）
│   ├── verify-scoring.mjs        # ★ 独立评分交叉验证（npm run verify:scoring；不 import 项目代码）
│   └── stop-dev.ps1              # 一键清理残留 dev 服务器（npm run dev:stop[:dry]，需 UTF-8 BOM）
├── verify-output/               # ★ 交叉验证产出的对账表（crosscheck-*.csv，已 gitignore）
├── public/                       # (待建)
├── .env                          # 本地环境变量（gitignore 忽略，已生成）
├── .env.example                  # 环境变量模板
├── .gitignore
├── package.json                  # 脚本用 node -r polyfill 调 next
├── package-lock.json
├── tsconfig.json
├── next.config.mjs               # 防御性 webpack 设置（无 fs 补丁，补丁已移出）
├── postcss.config.mjs
├── tailwind.config.ts
├── vitest.config.ts              # 测试配置（已建，待写测试）
├── readlink-polyfill.cjs         # ⚠️ 本机构建修复（勿删）
├── next-env.d.ts                 # next build 生成
├── tsconfig.tsbuildinfo
├── README.md                     # 已含运行说明 + readlink 说明
└── CONTINUATION.md               # 本文件
```

---

## 6. 重要代码文件及其作用

| 文件 | 作用 | 状态 |
|------|------|------|
| `package.json` | 依赖与脚本；`dev/build/start` 通过 `node -r ./readlink-polyfill.cjs` 调 next；`db:*`、`test` 就绪 | 已建 |
| `data/question-bank.json` | **单一事实源**：`meta.likert` / `meta.scoring` / `scales[].type`（**"personality" \| "attitude"，缺失会导致结果页整页空白**） / `scales[].domains` / `scales[].items`（含 `reverse`） / `scales[].composite` | 已建+校验 |
| `prisma/schema.prisma` | 5 张表；`Item.code` 唯一、`ResponseItem` 外键 `itemId→Item.id`；`value Int 1..5` | 已迁移+seed |
| `prisma/seed.ts` | 读 JSON 写 Scale/Item（60 题），保证 `domain`/`reverse` 正确；**`type` 直接取自题库（不再按 key 硬编码），取值非 `personality`/`attitude` 时显式抛错** | 已跑通 |
| `src/lib/db.ts` | Prisma 客户端全局单例（避免 dev hot-reload 重复连接） | 已建 |
| `src/lib/questionnaire/loader.ts` | 加载 JSON；导出 `getItemIndex()`（code→元数据）、`getPublicQuestionnaire()`（公开题库，item 输出 `code`）、**`getInterpretations()`/`getDomainInterpretation()`/`getCompositeInterpretation()`（Step 7 解读文案，未配置返回 null）** | 已建 |
| `src/lib/validation.ts` | Zod：`submitResponsesSchema`（items value 1–5、code 必存在）、participant/consent 校验 | 已建 |
| `src/app/api/responses/route.ts` | 提交作答：code→id 解析后写 `ResponseSession`+`ResponseItem`；事务内校验 participant 存在 | 已建+验证 |
| `src/lib/scoring/stats.ts` | 统计基础：`mean`/`sampleVariance(n−1)`/`logGamma`/`regularizedIncompleteBeta`/`studentTCdf`/`pearsonR`/`pearsonPValue` | ✅ 已建 |
| `src/lib/scoring/score.ts` | **评分引擎核心**：`reverseRecode`、`scoreDomain`（缺失策略）、`computeAiAdoptionIndex`、`scoreScale`、`scoreAll`、`interpretBand` | ✅ 已建 |
| `src/lib/scoring/reliability.ts` | Cronbach α（重编码后 + listwise 剔除）、`buildDomainMatrix`、`alphaForDomain` | ✅ 已建 |
| `src/lib/scoring/correlation.ts` | Pearson r 成对剔除矩阵、`buildDomainSeries` | ✅ 已建 |
| `src/app/api/results/[pid]/route.ts` | **结果 API**：DB 读作答 → `scoreAll()` → 维度分/分带/合成指数 **+ 每维度 `interpretation` 文案** + 4 条边界说明 + 文案版本；404 处理 | ✅ 已建+验证 |
| `src/lib/result/view-model.ts` | **结果视图模型（纯函数，Step 7）**：`toRadarData`/`toBarData`/`isConcernDomain`/`hasIncompleteDomains`/`findScaleByType`/`formatScore`/`formatCompletion` | ✅ 已建+测试 |
| `src/lib/result/pipeline.test.ts` | **结果数据链回归（真实引擎 → JSON 往返 → 视图模型）**。专门锁住「量表 type 缺失 → 整页空白」这类 fixture 漂移缺陷 | ✅ 已建+实测可拦截 |
| `scripts/smoke-render.mjs` | **真实浏览器渲染冒烟**（`npm run test:render`，11 断言）：本机 Chrome/Edge 无头执行客户端 JS，断言 10 个维度名与分数、分带、`<svg>`、合成指数已渲染且不停留在加载态；无浏览器内核时显式跳过 | ✅ 已建+通过 |
| `src/lib/design/colors.ts` | **可视化配色单一来源**（DIMENSION_COLORS/AI_COLORS/BAND_COLORS），供 Recharts 消费 | ✅ 已建 |
| `src/components/charts/*` | `BigFiveRadar`（雷达图，固定 0–5）/ `AiDomainBar`（条形图，含 CN 反向提示）/ `DomainMeanChart` / `IndexHistogram` / **`CorrelationHeatmap`（下三角 + 每格 r 与 n，服务端组件）** / **`ItemDistributionChart`（原生 details 折叠，服务端组件）** | ✅ 已建 |
| `src/components/result/DomainBreakdown.tsx` | 维度明细：分数 + 分带徽标 + 相对位置条 + 中性解读；incomplete/imputed 分别提示 | ✅ 已建 |
| `scripts/e2e-results.mjs` | HTTP 契约测试（**139 断言**），`npm run test:e2e`；含就绪等待、失败即退、管理端 401/登录/导出/页面守卫契约、**结果 API 字段契约**，以及 **Step 9 分析契约**（α 结构/n-bootstrap 可复现、相关矩阵对称性与 Bonferroni、题项计数守恒、raw 导出） | ✅ 已建+验证 |
| `scripts/verify-scoring.mjs` | **独立评分交叉验证**（`npm run verify:scoring`）：**不 import 项目代码**，独立重写评分口径 → 用 `format=raw` 重算并与 `format=csv` 逐格对账（容差 1e-4）+ 抽样比对 `/api/results/:pid`；输出 `verify-output/crosscheck-*.csv` 与手算样例 | ✅ 已建+通过 |
| `scripts/stop-dev.ps1` | 一键清理残留 dev 服务器（`npm run dev:stop`；`-DryRun` 只列出）。**双通道探测（netstat + cmdlet），两者皆不可用则 exit 3**；**必须 UTF-8 with BOM** | ✅ 已建+验证 |
| `src/lib/auth.ts` | **鉴权核心（纯逻辑）**：HMAC-SHA256 签名会话（先验签后解析 / timingSafeEqual / 过期即拒）、常量时间凭据比较、弱凭据原因、cookie 选项与 Cookie 头解析、HTTPS 判定 | ✅ 已建+测试 |
| `src/lib/http.ts` | `readJsonBody`（请求体上限，含 Content-Length 预检）、`clientIp`（限流分桶；注释明示 x-forwarded-for 不可信、不是安全边界） | ✅ 已建 |
| `src/lib/admin/guard.ts` | Next 胶水：`guardAdminApi(req)`（API 401）、`requireAdminPage()`（页面 307）、`getAdminSession*` | ✅ 已建 |
| `src/lib/admin/stats.ts` | **管理端统计聚合 + CSV 构建（纯函数）**：`computeAdminStats`/`summarizeDomains`/`summarizeIndex`/`summarizeElapsed`/`buildHistogram`/`median`/`formatDuration`/`elapsedSecOf`/`buildExportTable`（维度分）/`buildRawExportTable`（逐题原始分）/`toCsv`/`csvCell`（公式注入防护） | ✅ 已建+测试 |
| `src/lib/admin/analysis.ts` | **分析聚合（纯函数，Step 9）**：`analyzeReliability`（α + bootstrap CI + 题目平均相关 + 惯例等级）、`analyzeCorrelation`（r 矩阵 + p + Bonferroni + 置信半宽）、`analyzeItems`（原始/重编码双分布 + 零变异与地板天花板）、`bootstrapAlphaCI`/`mulberry32`/`percentile`/`meanInterItemR` | ✅ 已建+测试 |
| `src/lib/admin/load.ts` | 取数（server-only）：`loadAdminRecords`（参与者全量 + 最新已完成会话）、`loadAdminStats`、**`loadAdminAnalysis`（一次取数算齐三份分析，页面用）**、`loadReliability`/`loadCorrelation`/`loadItems` | ✅ 已建 |
| `src/lib/admin/throttle.ts` | 登录失败限流（窗口 + 失败计数 + maxKeys 防膨胀，`now` 可注入） | ✅ 已建+测试 |
| `src/lib/admin/types.ts` | 无依赖纯类型（客户端组件可安全 `import type`，避免拖入 `node:fs`）；含分析结果类型 `AlphaRow`/`CorrelationResult`/`ItemRow` 等 | ✅ 已建 |
| `src/app/api/admin/{login,logout,session,stats,export}/route.ts` | 管理端 API：登录（限流/统一 401/503）、登出（幂等）、会话探针（200 + authenticated:false）、统计、CSV 导出（`csv`/`raw`，其它 → 400） | ✅ 已建+验证 |
| `src/app/api/admin/{reliability,correlation,items}/route.ts` | **Step 9 分析 API**：均首行 `guardAdminApi`（漏加则 `guard-coverage.test.ts` 失败），与页面共用 `analysis.ts`，保证两处数字一致 | ✅ 已建+验证 |
| `src/app/api/admin/submissions/route.ts` · `[pid]/route.ts` | **提交明细 API（部署后新增）**：`GET` 列表（按 `sort`/`dir` 排序，均调 `guardAdminApi`）+ `DELETE` 级联删除某参与者全部作答；`guard-coverage.test.ts` 已自动要求 | ✅ 已建+验证 |
| `src/app/admin/page.tsx` | **仪表盘**：指标卡 + 完成漏斗 + 维度均值图 + 指数直方图 + 逐维 n/sd 明细表 + 弱凭据红警 + 口径说明 | ✅ 已完成 |
| `src/app/admin/login/page.tsx` | 登录页：服务端判会话（已登录跳 `/admin`）+ 客户端表单（401/429/503 分别提示） | ✅ 已完成 |
| `src/app/admin/export/page.tsx` | 导出页：列出将导出的全部列 + 下载入口 + 隐私/注入/BOM 说明 | ✅ 已完成 |
| `src/app/admin/analytics/page.tsx` | **分析页（Step 9 完成）**：服务端聚合 → 概览指标卡 + 警示 + α 表 + 相关热力图 + 题项分布折叠区 + 口径/限制/独立复核入口 | ✅ 已完成 |
| `src/app/admin/submissions/page.tsx` | **提交明细页（部署后新增）**：列出每条提交（填写时间/状态/题数/匿名 ID/操作），默认按提交时间倒序，支持按时间排序；每行带删除按钮 | ✅ 已完成 |
| `src/components/admin/DeleteParticipantButton.tsx` | 删除按钮（client）：二次确认后 `DELETE /api/admin/submissions/:pid` 并 `router.refresh()` | ✅ 已完成 |
| `src/lib/admin/submissions.ts` | 提交明细取数（server-only）：`loadParticipantsList()` + 排序纯函数 | ✅ 已完成 |
| `readlink-polyfill.cjs` | **构建修复**：EISDIR→EINVAL；须保留且被 dev/build/start 预加载 | 已建（勿删） |
| `src/lib/utils.ts` | `cn()` 类名合并工具（无第三方依赖） | 已建 |
| `src/components/ui/*` | 基础组件：Container/Card/Button/ProgressBar/Alert/Badge/SectionHeading/LikertScale(client)/SiteHeader/AdminNav | 已建 |
| `src/app/page.tsx` | 引导页（hero + 双量表卡 + 免责声明） | 已建（重写） |
| `src/lib/client/api.ts` | 客户端 API：createParticipant/submitConsent/fetchQuestionnaire/submitResponses（全匿名） | 已建 |
| `src/lib/client/storage.ts` | localStorage 草稿与 participantId（`CONSENT_VERSION="v1"`；`wap_participant_id`、`wap_draft_<pid>`） | 已建 |
| `src/app/consent/page.tsx` | 知情同意**真实门槛**：勾选→建参与者→记录同意→跳转 `/assessment` | 已完成 |
| `src/app/assessment/page.tsx` | 作答页：真实题库(60)+进度条+草稿续答+可选人口学+提交 | 已完成 |
| `src/app/result/page.tsx` | 结果报告页：`?pid` → `GET /api/results/:pid`，雷达图 + 条形图 + 合成指数 + 中性解读 + 边界说明 | 已完成（Step 7 重写） |
| `src/app/admin/*` | 管理端五页：**仪表盘/登录/导出（Step 8）、分析页（Step 9）、提交明细（部署后新增）均已完成** | ✅ 完成 |

---

## 7. 数据库结构（已落地 & 已 seed）

5 张核心表，参与者用随机 UUID（非 cuid，避免可排序泄露），**不绑定任何 PII，不存 IP**：

| 表 | 关键字段 | 说明 |
|----|---------|------|
| `Scale` | id(cuid), key(unique), name, type, description | 量表元数据：`big_five` / `ai_adoption` |
| `Item` | id(cuid), scaleId(fk), **code**(如 "O1"), text, orderIndex, **reverse(Bool)**, domain, options(Json 字符串), `@@unique([scaleId, code])` | `reverse` 标记反向计分；`domain`=O/C/E/A/N 或 PU/TR/WA/LA/CN |
| `Participant` | id(uuid), createdAt, consentVersion?, consentAt?, status, ageRange?/gender?/education? | 匿名；人口学可选分桶，默认 NULL；status: created\|consented\|completed\|abandoned |
| `ResponseSession` | id(cuid), participantId(fk), startedAt, completedAt?, status | 一次完整作答；status: in_progress\|completed\|abandoned |
| `ResponseItem` | id(cuid), sessionId(fk), itemId(fk→Item.id), value(Int 1..5), createdAt, `@@unique([sessionId, itemId])` | 单题作答值 |

**关系**：Scale 1—N Item（Cascade）；Participant 1—N ResponseSession（Cascade）；ResponseSession 1—N ResponseItem（Cascade）；Item 1—N ResponseItem（Cascade）。
**索引**：Item(`scaleId`)、ResponseItem(`itemId`,`sessionId`)、ResponseSession(`participantId`)。
**当前数据**：2 Scale、60 Item、29 反向（big_five 20 + ai_adoption 9）、已迁移+seed 验证通过。

**⚠️ 切换生产 Postgres 步骤**：schema 中 `provider` 由 `"sqlite"` 改为 `"postgresql"`；`.env` 的 `DATABASE_URL` 改为 Neon 连接串；重新 `prisma migrate deploy` + `db:seed`。模型无需改动。

---

## 8. 核心算法逻辑（评分 —— 重点，源自 `assessment-framework.md` §4；**已于 Step 6 实现并测试**）

> 实现位置：`src/lib/scoring/{stats,score,reliability,correlation}.ts`（纯函数，DI-free，只依赖题库 JSON）。
> 关键 API：`scoreAll(answers: Record<code, 1..5>) → { scales, answeredTotal, itemTotal, completionRate }`。
> 已覆盖的验证：79 个单测 + 28 项 E2E 断言全绿（详见 §2 Step 6）。

**统一 Likert**：5 点，1=非常不符合 … 5=非常符合。

**1) 单维度评分（Big Five 与 AI 各维度通用）**
```
reverse 重编码: recoded = (scale+1) − value = 6 − value   // 仅 reverse:true 的题
维度分 DomainScore = mean(该维度所有题的 recoded 值)        // 范围 1–5
缺失策略:
  - 维度内缺失 ≤ 1 题 → 用已答题均值填补，flag imputed=true
  - 维度内缺失 > 1 题 → 标记 domain.incomplete，score = null（不参与均值）
```
⚠️ **致命坑（务必注意）**：CN（担忧）维度的 CN4 是反向题，已在"维度内重编码"阶段反转为"越高越担忧"。**合成指数里不要再二次反转 CN 原始值**，应直接对 `mean(CN)`（已是担忧维度分）做 `(6 − mean(CN))`。见下。
✅ 已在 `computeAiAdoptionIndex()` 中实现并由 CN4 专项测试锁定（`CN1..3=5, CN4=1 → CN=5.0`；`CN1..3=5, CN4=5 → CN=4.0`）。

**2) AI 采纳态度合成指数（Composite Index）** —— JSON 中 `ai_adoption.composite.formula` 为权威公式（**实际实现见 `src/lib/scoring/score.ts::computeAiAdoptionIndex`，下述口径与之严格一致**）：
```
concern_score = mean(CN)                    // CN 维度分（已含 CN4 题目级反向重编码，越高=越担忧）
AI_Adoption_Index = ( PU + TR + WA + LA + (6 − concern_score) ) / 5
                 = mean( PU, TR, WA, LA, 6 − concern_score )   // 五域算术平均，每域权重 0.20
```
即五个域（PU/TR/WA/LA 正向 + 域级翻正的 CN）**等权**算术平均，范围 1–5，越高=采纳态度越积极。权重为**等权**（已在文档声明不作未验证权重声称）。

**3) 信度 Cronbach α**（每维度/每量表，逐被试×逐题矩阵）：
```
k = 题数
item_vars = Σ variance(每题得分)               // 用样本方差 n−1
total_var = variance(被试总分)
α = (k/(k−1)) × (1 − item_vars / total_var)
零方差 或 单题维度 或 n<2 → 返回 null 并给出中文原因（不返回 0/1 误导）
```
✅ 实现要点（`reliability.ts`，容易做错的两点已处理）：
- **必须先反向重编码再算 α**，否则反向题与同维度其它题负相关、α 被人为压低。
- **listwise 剔除**不完整被试（不按 0 或均值填补，否则改变方差结构），并回报 `droppedIncomplete`。
- α 允许为负（数据矛盾时数学成立），如实返回不截断。有已知算例测试：完全一致 → 恰为 1；手算 0.4167；负协方差 → −12。

**4) 相关分析 Pearson r**：对 Big Five 五维度 + AI 五维度计算 r 矩阵；小样本标注 n，避免过度解读。
✅ 实现要点（`correlation.ts`）：**成对剔除**（pairwise），每格返回自己的 `n` 与双尾 `p`；n<3 或零方差 → null。`buildDomainSeries()` 把多份作答转成 10 条维度分序列，供 Step 9 管理端直接消费。

**5) 解读分带（启发式，非常模）**：≤2.5 偏低(tone=low) / (2.5, 3.5) 中等(medium) / ≥3.5 偏高(high)。结果文案一律"相对倾向/自我洞察"，含"非临床诊断"声明。

**6) 数值与输出约定（新增，改动会破坏测试）**
- 引擎内部全精度计算；`score`/`α`/`r` 输出前 `round(x, 4)`，`completionRate` 亦为 4 位小数。
- 维度 `incomplete` 时 `score=null`、`band=null`；**绝不用估计值替代**。
- 合成指数任一子维度不可用 → `null`，**不做部分合成**。
- `scoreAll()` 只统计题库中真实存在的 code，脏键不计入 `answeredTotal`。

**验证方式（Step 6 已全部落地）**
- ✅ 已知答案单测：框架文档 §5 示例 `[5,5,5,5]` 含 2 反向 → 3.0；全 3 分 → 所有维度 3.0；全 5 分 → Big Five 全 3.0、CN=4.0、合成指数=2.5。误差 < 1e-6。
- ✅ 反向专项：正向 5/反向 1 → 5.0（漏掉重编码则为 3.0）；CN4 只翻转一次。
- ✅ 缺失两分支：缺失 1 题 → imputed 且分数不变；缺失 2 题 → incomplete 且 score=null。
- ✅ α 合理性：完全一致 → 恰为 1；零方差 → null；负协方差 → −12；手算 0.4167。
- ✅ 相关/p 值：手算 r=2/√52；p 值用统计表临界值反向校验（df=8，r=0.632→p≈0.05，r=0.765→p≈0.01）。
- ✅ E2E 契约测试：`npm run test:e2e`（`scripts/e2e-results.mjs`），**99 项断言**，覆盖真实 HTTP 提交→查结果→手算比对 + 解读文案契约 + 管理端鉴权/导出/页面守卫 + **结果 API 字段契约（`type`/domains/composite）**。
- ✅ **结果页真实渲染断言**（新增）：`npm run test:render`（`scripts/smoke-render.mjs`），**11 项断言**，用本机 Chrome/Edge 无头模式执行客户端 JS，断言维度名/分数/分带/图表 SVG/合成指数确实出现在页面上。**这条命令是「页面全空但测试全绿」的唯一有效防线**——curl 与 E2E 都看不到客户端渲染内容。
- ✅ **管理端无令牌 401 断言**（Step 8 已补）：`/api/admin/stats`、`/api/admin/export` 无 cookie → 401；伪造令牌 → 401。
- ⬜ **Excel 交叉验证**（框架文档 §5 第 5 条）：尚未做，**建议在 Step 9 出报告时补做**（`/api/admin/export` 已可导出 CSV → 表格独立手算 5–10 名被试 → 与程序输出对账）。**注意**：手算前必须知道 CSV 的维度列已是**反向重编码后**的均值，直接对原始作答取平均会得到错误的对账结果。
- ⬜ **交互级浏览器 E2E**：仍是空白（点击选项、表单提交、刷新续答）。渲染结果层已由 `test:render` 覆盖；**注意不要在 Step 9 新增维度时忘了页面渲染**——若新增量表，务必跑一次 `test:render`。

---

## 8.1 结果呈现约定（Step 7，心理测量学约束，务必延续）

> 实现位置：`src/lib/result/view-model.ts`（纯函数）+ `src/components/charts/*` + `src/components/result/*` + `data/interpretations.json`。

1. **主信息是 1–5 的原始数值，分带只作辅助**。分带徽标视觉弱化，数值才是主角——只给一句结论（"你偏内向"）属于夸大。
2. **不做样本归一化、不给人群百分位**。平台尚无常模，任何"排名/百分位"说法都是编造。雷达图**固定 0–5 半径刻度**。
3. **CN（对 AI 的担忧）绝不翻转到图表里**。合成指数里的域级反转是唯一一次反转；图表展示 CN 原始维度分（越高=越担忧）+ 独立配色 + 明确文案提示，避免"柱子高=态度积极"的误读。
4. **`incomplete` 维度显示"未给出分数"，绝不填估计值**。雷达图保留轴位置（轴集合稳定）但标 `missing`，因为动态删轴会被误读为"该维度不存在"。
5. **缺失 1 题（imputed）也要显式告知**（"分数按已答题目均值计算"）。
6. **`N` 与 `CN` 高分段不做"好/坏"定性**，只描述特征与两面性（如 N 高既可能内耗更重，也常伴随对细节与风险的敏锐察觉）。文案中禁止出现「不稳定/患有/障碍/抑郁」等词——**已有单测词表锁定**（`interpretations.test.ts`）。
7. **免责声明与边界说明固定展示、不折叠**；每条边界说明由 API 的 `interpretationNotes` 下发，前端不得自行改写。
8. **维度/合成指数文案必须三段俱全**（low/medium/high），由 `interpretations.test.ts` 的完整性测试保证。

---

## 8.2 管理端统计与导出约定（Step 8，务必延续）

> 实现位置：`src/lib/admin/stats.ts`（纯函数）+ `src/lib/admin/load.ts`（取数）+ `src/components/charts/{DomainMeanChart,IndexHistogram}.tsx`。

1. **逐维报 n**。维度缺失 > 1 题即判为不可用（引擎口径），因此各维度有效样本数**天然不同**（实测：O 维度 n=35、其余 n=30，因为 E2E 有一例只答了 O）。任何"整体 n"的统一标注都是谎报精度；`DomainStatsTable` 直接把 n 摆成一列。
2. **n < 2 时 sd 为 `null`，绝不写 0**。样本标准差在 n=1 时数学上未定义；写 0 等于宣称"该维度毫无差异"，是一个可测量的错误结论。同理 `DomainMeanChart` **刻意不画误差棒**——用 0 长度误差棒图省事就会犯这个错。
3. **无数据一律 `null`，不写 0**。`completionRate` 在 participants=0 时是 `null`（"还没有人参与" ≠ "完成率 0%"）；不可用维度在 CSV 里**留空**而非 0。
4. **均值图 Y 轴固定 0–5，不做自适应缩放**。自适应会把 3.1 与 3.4 拉成视觉上的巨大差异，在小样本下凭空制造"发现"。保留 3.0 虚线作为量表中位参照。
5. **直方图纵轴是人数的绝对计数**，且图下必须标注 n 并声明"样本量小时箱高由个别被试决定，不宜讨论分布形态"。
6. **分带只作辅助，且阈值必须与结果页一致**（≤2.5 / 2.5–3.5 / ≥3.5，启发式、非常模）。
7. **管理端与个人结果页口径必须一致**：两者都取"参与者最新一次已完成会话"（`sessions[0]`，按 `completedAt desc`），且都调同一个 `scoreAll()`。任何"管理端另算一套"的做法都会导致两处数字对不上。
8. **`cn`（担忧）在管理端同样不翻转**：明细表对其打「语义反向」徽标，文案与结果页一致。
9. **导出安全**：单元格以 `= + - @ \t \r` 开头时加前导单引号（CSV 公式注入）；含 `",\r\n` 时按 RFC 4180 引用并转义；CRLF 换行；UTF-8 BOM 前置；`Content-Disposition: attachment`。**导出列白名单由测试锁定**（`stats.test.ts` 断言表头不含 name/email/phone/cookie/user_agent 等）。
10. **`elapsed_sec` 语义**：`createdAt → completedAt` 的端到端间隔，含阅读知情同意与中途停留，**不等于纯作答时长**。中位数 < 5 秒时仪表盘会主动提示"疑似脚本提交"，而不是把它当真人作答时长展示。

---

## 8.3 分析约定（Step 9，心理测量学约束，务必延续）

> 实现位置：`src/lib/admin/analysis.ts`（纯函数）+ `src/components/{admin/AlphaTable,charts/CorrelationHeatmap,charts/ItemDistributionChart}.tsx` + `scripts/verify-scoring.mjs`。

1. **α 无定义时给 `null` 与原因，绝不给 0 或 1**。`cronbachAlpha` 在 n<2、k<2、总分方差为 0 时返回 `reason`；页面显示「无法估计（原因）」。0 会被读成"信度极差"、1 会被读成"完美"，两者都是可测量的错误结论。
2. **α 允许为负，必须如实返回，不在引擎层截断**。负 α（题目间平均相关为负）是"存在未正确反向计分的题目"的强信号，截断为 0 会掩盖它。页面在出现负 α 时给出专门的警示。
3. **α 必须与不确定性同屏**：服务端计算 **95% 百分位 bootstrap 区间**（`DEFAULT_BOOTSTRAP = 1000`，`BOOTSTRAP_SEED = 20260912` **固定种子**）。不用解析近似公式（Feldt / Iacobucci）是因为它们假设 α 的抽样分布近似正态，在小样本、α 接近 0/1 时失真，而本平台正是小样本场景。**固定种子不可改成随机**——否则仪表盘每刷新一次区间都会变，用户会以为数据在变；E2E 有一条断言专门锁这一点。
4. **α 必须并列 k、listwise n 与剔除人数**。α 依赖完整作答（缺失任一题整行剔除），因此 α 的样本可能明显小于完成人数；且 α 会随 k 升高。**只报 α 一个数等于隐去可比性**，故同时给出 `meanInterItemR`（由 Spearman-Brown 反解，剔除 k 的影响，使 k=4 的 AI 维度与 k=8 的大五维度可比）。
5. **α 等级阈值（0.60/0.70/0.80/0.90）标注为"通用惯例"**，不得表述为本平台常模或效度证据。页面固定声明「不是本平台常模」「不等于量表效度已被验证」。
6. **相关矩阵使用成对剔除（pairwise）→ 每格必须显示自己的 n**。热力图把 n 直接画在格子里（不只放悬浮提示）；断言矩阵对称性（只画下三角的前提）与 `counts[i][j] <= n`。
7. **相关必须给 Bonferroni 校正与多重比较警示**。10 个维度 = 45 个配对，按 α=0.05 判定时**期望约 2.25 个"显著"纯属偶然**；页面同时显示校正前后显著数，并在「未校正显著 > 0 但校正后 = 0」时明说"这与纯属偶然完全一致，不应作为发现来报告"。同时给出 r 的 95% 近似半宽（Fisher z：`1.96/√(n−3)`）以量化"多小的 r 与 0 无法区分"。
8. **相关不等于因果**：`analyzeCorrelation().notes` 固定包含该声明（有测试断言），页面亦展示。
9. **地板 / 天花板效应按「构念方向」（重编码后）判定，绝不按原始分**。反向题原始选 1 在构念上其实是高分——按原始分判会把它误报成地板效应。因此 `ItemRow` 同时输出 `options`（原始）与 `recodedOptions`（重编码），判定使用后者，分布主图也画后者；原始分布放在悬浮提示与「原始均值 → 重编码均值」一列中。
10. **题项计数守恒**：对每道题恒有 `Σ各档计数 + missing = 参与者总数`。这是数据完整性的可断言不变量（单测与 E2E 都有断言），任何静默丢数据的改动都会被它抓住。
11. **分析页用服务端渲染**：分析含 bootstrap 计算，放服务端省客户端资源，也避免 Step 7 那类「客户端取数失败 → 标题在、内容空」的失败模式。`CorrelationHeatmap` / `ItemDistributionChart` 刻意不依赖任何客户端能力（无 hooks/事件），`<details>` 用原生 HTML 折叠，因此整页可直接用 curl 断言正文。
12. **独立复核必须与被复核实现分离**：`scripts/verify-scoring.mjs` **不 import 项目任何代码**（含 `src/lib/scoring/*`），独立重写评分口径后再对账。若两边共用实现，验证就退化成「用程序的结果验证程序」，口径整体错掉也照样全绿。唯一共享的是 `data/question-bank.json`（题目归属与反向标记属「数据」而非「实现」）。
13. **导出提供两条通道**：`format=csv`（程序算好的维度分）+ `format=raw`（逐题**原始**作答）。`raw` 刻意**不给**重编码值——否则复核者可能把重编码值当原始值再翻转一次，得到一个"看似合理的错误答案"。

---

## 9. 已发现的问题和 Bug（含已修复项）

1. **（已修复·严重）本机 G: 盘 `readlink` 致命 bug**：G: 盘上 Node `fs.readlink`/`readlinkSync` 对任意普通文件误报 `EISDIR`，导致 webpack 构建/启动直接崩溃。修复 = `readlink-polyfill.cjs`（拦截 EISDIR 重写为 EINVAL）+ npm 脚本 `node -r ./readlink-polyfill.cjs next …`。该补丁在 macOS/Linux/Vercel 上是安全空操作。验证：`npm run build` 产出 `.next/BUILD_ID`、`npm run dev` 正常启动。**务必保留，勿删。**
2. **（已修复）`cross-env` 在 Windows 下静默失效**：经 `next` 的 Windows shim 启动时无输出、无产物。已弃用 cross-env，改为直接 `node -r ./polyfill node_modules/next/dist/bin/next …`。
3. **（已修复）`responses` 外键不匹配**：`ResponseItem.itemId` 外键指向 `Item.id`(cuid)，但客户端提交的是题目 **code**（如 `O1`），最初直接写入触发 `P2003`。修复 = 路由内 `prisma.item.findMany` 把 code 解析为真实 id 再写入；并对未知 code 返回 400。验证：集成测试 responses 201 + 未知 code 400。
4. **（已解决·设计陷阱）合成指数二次反转**：Step 6 已在 `computeAiAdoptionIndex()` 实现并加 `CN4` 专项测试锁定（详见 §8）。今后修改评分逻辑时仍需守住这条。
5. **（已修）题库 JSON 的 `composite` 缺 `label` 字段**：`loader.ts` 的类型声明为 `{ label: string; formula }`，但 JSON 实际只有 `key/formula/range/weighting` → 运行时 `label` 为 undefined。已修正 loader 类型为 `{ key; label?; formula; range?; weighting? }` 并给 JSON 补中文 `label`。
6. **`.env.local` 缺失**：仅 `.env`（已被 gitignore 忽略，本地用）与 `.env.example` 存在，生产用强随机 `ADMIN_SESSION_SECRET` 与密码。
7. **小样本不稳定**：试点 n 小，α/相关波动大，报告须如实标注样本量与置信区间，不得夸大。`pearsonPValue` 已实现，但**不得单独解读显著性**——必须同时展示 n。
8. **（部分缓解）测试覆盖**：现有 **258 个单测 + 164 项 E2E + 11 项渲染冒烟 + 8 项独立交叉验证**。**渲染结果层已覆盖**（`npm run test:render` 用本机 Chrome/Edge 无头模式，断言维度名/分数/图表确实出现在页面上）；**数值正确性已由独立实现复核**（`npm run verify:scoring`，见 §8.3）。**仍未覆盖的是"交互动作"**——点击选项、刷新续答、登录表单提交等只在单测/HTML 外壳层面验证（`agent-browser` 需约 500MB Chromium，未安装）。建议 Step 10 补 Playwright 交互 E2E。
9. **（已修复·环境）残留 dev 服务器累积**：此前用 `(npm run dev &)` 启动导致进程孤儿化，且 Git Bash 的 `pkill` 在 Windows 拿不到其它会话进程，累积达 **7 个**。修复 = `npm run dev:stop`（`scripts/stop-dev.ps1`，只杀监听本项目端口的 node 进程）。**后续请优先用可管理的后台任务方式启动，或启动后主动 `dev:stop` 收尾。**
   - **⚠️ 二次修复（Step 8）**：初版只用 `Get-NetTCPConnection` 探测，该 cmdlet 在受限/沙箱会话下会**静默返回空**，脚本随即打印「没有发现被占用的端口」并 exit 0 —— 用户以为清理过了，实际一个进程都没杀（最坏的一类失败）。现已改为**双通道**（`netstat` + cmdlet）取并集按 PID 去重，**两者皆不可用时显式报错并 exit 3**；新增 `-DryRun` / `npm run dev:stop:dry` 先看后杀；非 node 进程只报告不处理。
10. **（环境·重要）沙箱安全删除防护会拦截批量删除**：`next dev` 启动时清空 `.next`，当文件数 ≥50 时被拦截并崩溃（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`）。规避：启动 dev 前先清空 `.next`，或直接用 `npm run build` + `npm start` 做生产模式预览（`next start` 不需要清 `.next`）。
11. **（环境）`next build` 与运行中的 dev 并发写 `.next` 会互相破坏**：表现为 dev 服务器开始对所有页面返回 500。**构建前必须先停掉 dev**（`npm run dev:stop`），构建后再重启。
12. **（已缓解·Step 6）dev 首次编译瞬时 404**：dev 模式下首次访问某 route 需现场编译，可能出现一次性 404/500。`scripts/e2e-results.mjs` 已加 `waitForServer()` 轮询 + 失败即退出（exit 2）并打印提示，避免把编译抖动误判为逻辑失败。
13. **（已缓解·Step 7）结果页主体无法用 curl 断言**：报告内容依赖运行时 `fetch`，属客户端渲染，初始 HTML 中只有 Suspense 外壳。E2E 的 [8] 因此只断言「应用外壳 + 200」，**不能**断言维度分数文案。
   - **✅ 已补防线**：`scripts/smoke-render.mjs`（`npm run test:render`）用本机 Chrome/Edge 无头模式**真实执行客户端 JS**，断言页面出现全部维度名与格式化分数、分带标签、内联 `<svg>`、合成指数，且不停留在「正在加载」。**这条通路的价值已被证实**：下方的整页空白缺陷正是 curl/E2E 全绿时漏掉的。
   - 仍建议 Step 9 后补 Playwright，覆盖**交互动作**（点击/提交/刷新续答），而不只是渲染结果。
14. **（Step 7 新增风险）`colors.ts` 与 `tailwind.config.ts` 存在配色重复**：Recharts 只接受具体色值，无法读 Tailwind 工具类，故维度色在两处各存一份。改色时**必须同步两处**（文件内已有维护约定注释），否则会出现"雷达图与图例不同色"。
15. **（Step 8 · 安全取舍）会话无状态，无法服务端吊销单个会话**：令牌自包含且无服务端会话表，因此「登出」只清客户端 cookie，**旧令牌在过期前仍然有效**。E2E 已**显式断言这一行为**，避免它日后被误当成 bug 或被悄悄"修"成不一致的状态。若需真吊销，须改为服务端会话表，或引入密钥轮换 + 令牌黑名单。
16. **（Step 8 · 限流局限）登录限流是「进程内」的**：多实例部署（Vercel 多并发函数）时各实例各算一份，攻击者可借并发/冷启动分散绕过。它只用于抬高脚本爆破成本，真正防线是强随机密码；Step 10 可换 Redis / Upstash。
17. **（Step 8 · 安全边界）`x-forwarded-for` 不可信**：仅用于限流分桶，**不作为任何安全边界**。生产必须由平台覆写该头，或在可信代理后取值。
18. **（Step 8 · 环境）沙箱化的 PowerShell 工具里两条端口探测通道都被屏蔽**：直接运行 `scripts/stop-dev.ps1` 会正确报 exit 3（而非静默成功）；从 `npm run dev:stop`（普通 shell）调用则工作正常。这是环境限制，不是脚本缺陷。
19. **（Step 8 · 实现陷阱）不要并行编辑同一个文件**：本轮有 4 处并发 `Edit` 落到同一个 `stats.ts`，后写覆盖先写，导致 import 与函数签名两处改动静默丢失，直到 typecheck 才暴露。同一文件的多处改动请**串行**执行。
20. **（Step 8 · 测试陷阱）`fetch().text()` 会剥离 BOM**：WHATWG 规范要求 UTF-8 解码时去掉前导 BOM，因此校验 CSV 的 `EF BB BF` 必须用 `res.arrayBuffer()` 看原始字节，否则断言永远假阴性（已踩）。
21. **（Step 8 · 数据模型局限）没有"作答开始时间"**：`ResponseSession.startedAt` 是在**提交时**创建的，与 `completedAt` 几乎同刻，因此"纯作答时长"无法从现有数据算出。仪表盘只呈现「创建 ID → 提交」的端到端间隔并如实标注；若要真实作答时长，需在首次作答时就创建会话（或前端记录开始时间戳并上报）。
22. **（Step 7 修复 · 严重 · 用户实测发现）结果页整页空白 —— 题库缺 `scale.type` 导致数据契约断裂**：
   - 现象：结果页只有页头、免责声明与两张卡片的**标题**，卡内无任何维度名、分数、图表。
   - 根因：`data/question-bank.json` 从未声明 `type`；而 `loader.ts` 声明了它、`score.ts` 输出 `type: scale.type`（实为 `undefined`）、**`JSON.stringify` 静默丢弃 `undefined`**、结果页按 `findScaleByType(…, "personality"/"attitude")` 定位量表 → 定位失败 → 图表组件拿到空数组直接 `return null`。同时 `seed.ts` 用 `key === "big_five" ? …` 硬编码了同一知识，形成两份真相。
   - 修复：`type` 补进题库（单一事实源）；`seed.ts` 改为读 `scale.type`，非法即抛错。修复后 `test:render` 11/11 通过（10 个维度名 + 10 个分数 + 分带 + 2 个 SVG + 合成指数均已渲染）。
   - **为何测试全绿却没发现**：见第 23 条。
23. **（测试方法论 · 本轮最大教训）fixture 漂移 + 客户端渲染盲区 = "全绿但页面空白"**：
   - `view-model.test.ts` 用手写 fixture，`type` 是手填的 → **fixture 与真实产出漂移**，测试永远绿；
   - 结果页是客户端渲染 → curl / E2E 只能看外壳 → **渲染层零断言**；
   - 两者叠加，缺陷可以长期潜伏。对策：**凡是"X 渲染成 Y"的逻辑，测试输入必须来自真实产出**（`pipeline.test.ts` 刻意做 `JSON.parse(JSON.stringify(scoreAll(...)))` 往返，就是为了保留这个故障模式）；**客户端渲染的页面必须有一条真实浏览器断言**。
   - 验证测试有效性的方式：**故意把 `type` 从题库删掉，确认测试变红**（已实测：`pipeline.test.ts` 与 `loader.test.ts` 共 7 项立刻失败，报错 `expected null not to be null`，与线上症状一致）。**写守卫测试后一定要做一次"故意破坏"验证，否则不知道它到底拦不拦得住。**
24. **（`test:render` 的局限）找不到浏览器内核时它会打印「跳过」并 exit 0**：这是为避免在无 Chrome 的环境里硬失败而刻意设计的，但代价是**"通过"可能实际是"没跑"**。在 CI / 部署流水线里必须确保存在 Chrome/Edge 或显式设置 `CHROME_PATH`，并检查输出里没有 `[跳过]`。
25. **（Step 9 · 统计诚实性）bootstrap 随机种子必须固定**：α 的置信区间由重抽样得到，若种子随机会导致**每次刷新页面数字都在变**，用户会以为数据在变（或以为系统不稳定）。已固定为 `BOOTSTRAP_SEED = 20260912`，并有一条 E2E 断言「同一份数据两次请求返回完全相同的 JSON」把它锁住。若要改种子，必须同步接受该断言的含义。
26. **（Step 9 · 验证方法论）"独立复核"必须真的独立**：`verify-scoring.mjs` **不 import 项目任何代码**。若图省事去 `import { scoreAll }`，两条通道就会共用同一份实现，**口径整体错掉也照样全绿**——这比没有验证更危险（它给了虚假的安全感）。同理，`format=raw` 刻意只导出原始作答、不给重编码值。
27. **（Step 9 · 数据现状 · 重要）当前数据库含大量 E2E 制造的测试数据**（全 3 分、全 5 分、只答单个维度、缺失 6 题等），因此分析页上的 α（可能极低甚至为负）与维度间相关（可能接近 0）**不具实质心理测量学意义**，只应视为"计算链路已跑通"的证据。要看真实结果需先 `npm run db:reset` 清库、再收集真人数据；这也意味着**上线前必须确保生产库是干净的**。
28. **（Step 9 · 实现陷阱）"不要并行编辑同一个文件"本轮又复发一次**：`analysis.test.ts` 的 helper 与 `types.ts` 的 `recodedOptions` 各有一处并发 `Edit` 被后写覆盖，靠 typecheck 才发现。**第 19 条的教训要当成硬规则执行：同一文件的多处改动一律串行**（不同文件之间可以并行）。
29. **（Step 9 · 断言陷阱）React 服务端渲染会在相邻文本节点之间插入 `<!-- -->`**：例如 `n={n}` 渲染成 `n=<!-- -->80`，`正在加载` 也可能被注释分隔。因此**用 curl/正则断言 SSR 文本时不能假设字面连续**，要么用宽容的正则（`n=<!-- -->\d+`），要么断言不含注释的短片段。本轮核对热力图时正是靠这一点才没把"渲染正常"误判为"没渲染"。
30. **（Step 9 · 前端取舍）分析页刻意保持服务端渲染**：`CorrelationHeatmap` / `ItemDistributionChart` 不用 `"use client"`、不依赖 hooks 或事件，因此整页正文可被 curl/E2E 直接断言。**新增分析类组件时请沿用**——只有确实需要交互（如缩放、筛选）才升级为客户端组件。
31. **（Step 10 · 配置陷阱 · 已修复）.gitignore 漏了不带 `.local` 的 `.env` 变体**：原规则是 `.env` + `.env*.local`，而 `.env.production` / `.env.development` 这类**不带 `.local`** 的文件并不匹配任何一条，会被 git 正常跟踪。已改为 `.env*` + `!.env.example`，并补 `*.pem` / `*.key` / `.vercel` 与派生的 Postgres schema。**结论：忽略机密文件失败时的典型写法不是"忘写"，而是"写了个自以为覆盖全部的通配符"。**
32. **（Step 10 · 工具可信度）扫描器的误报会直接摧毁它的价值**：`audit-secrets` 初版把本地 `file:./dev.db` 与 `postgresql://…:NEON_PASSWORD@…` 占位串当成"真实密钥外泄"，一次报了 6 处假阳性。已加 `looksLikeRealSecret()` 克制判定：`DATABASE_URL` 只有「远程连接串 + 非占位密码」才算秘密，用户名另设 8 位下限。**一个总在报假警的检查，最后一定会被所有人忽略——比没有检查更糟。**
33. **（Step 10 · 方法论）扫描器必须先证明"抓得到"再相信它的绿灯**：绿灯只是"没发现"，不是"不存在"。因此用探针做过反向验证：故意植入含**真实密钥值**的探针源文件 + `.next/static` 产物 → 确认 **B / C / D / E / F 五类检查全部命中、exit 1、且输出无明文** → 清理后复跑至全绿。脚本还会在"没有任何真实值参与反查"时明确提示证明力有限（例如尚未生成生产凭据时）。
34. **（Step 10 · 环境陷阱）沙箱内的删除操作会被拦截，且 `ls` 视图可能与真实文件系统不一致**：清理探针文件时 `rm` 被 SIGTERM 终止，随后 Git Bash 的 `ls -la` 仍显示文件存在，而同机的 Node/Python（非沙箱通道）均报告 `existsSync=false`。**教训：删除类操作被静默拦截时，不要用同一个沙箱通道去"确认已删除"**——必须换一个运行时或非沙箱通道复核（本轮用 `node -e "fs.existsSync(...)"` 才确认真实状态）。同理，`write` 类脚本（如 `gen-secrets`）在沙箱里可能"看起来成功但没落盘"，关键产物都要独立复核一次。
35. **（Step 10 · 自身失误）改 package.json 脚本块时用整块替换，弄丢了 `dev:stop` / `dev:stop:dry`**（两个用于清理残留服务器的脚本），在随后核对时才发现并补回。**教训：整块替换 `scripts` 区块时，必须逐条比对替换前后的键集合，而不是只看"新增项在不在"。**
36. **（Step 10 · 依赖风险）构建期自检脚本依赖 `tsx`（devDependency）**：`npm run build` 的第一步是 `tsx scripts/check-prod-env.mts`，因此若部署平台以 `--production`（不装 devDependencies）方式安装依赖，构建会因找不到 `tsx` 而失败。Vercel 默认会安装 devDependencies，故当前可行；但若换平台或改安装参数，**必须把 `tsx` 移到 dependencies，或改为预编译后的 `.mjs`**。已记入 §11 待确认项。

---

## 10. 下一步具体开发步骤（接 Step 9 → Step 10）

**Step 6 — Scoring Engine（已完成并验证）**
1. ✅ `src/lib/scoring/{stats,score,reliability,correlation}.ts` 纯函数 + 66 个新单测（已知答案/反向/缺失/α/相关/p 值）。
2. ✅ 接线 `GET /api/results/:pid`（读作答 → 评分 → 返回维度分/分带/合成指数 + 边界说明）。
3. ✅ 验收：误差 < 1e-6；与手算一致（E2E 28 断言）；中性解读 + 免责声明（`interpretationNotes`）。
4. ✅ 附带：UI 去重（`SiteHeader` 路由自适应 + 首页 hero 移除重复「管理端」）。

**Step 7 — Result Visualization（已完成并验证）**
1. ✅ 结果页 `src/app/result/page.tsx` 升级为**真实报告页**：`?pid` → `GET /api/results/:pid`，雷达图 + 条形图 + 合成指数 + 边界说明；四种状态（加载/错误/无 pid/重试）。
2. ✅ 图表用 Recharts（雷达图 + 条形图）；配色抽到 `src/lib/design/colors.ts` 单一来源。
3. ✅ 每维度展示：分数（2 位小数）+ 分带徽标 + 相对位置条 + **配置驱动**中性解读；`incomplete` 显示"未给出分数"而非 0 分。
4. ✅ N 与 CN 语义方向已特殊处理（N 展示名中性化为「情绪敏感性」；CN 独立配色 + 反向语义提示 + 文案不翻转）。
5. ✅ 免责声明 + 边界说明（4 条，来自 API `interpretationNotes`）固定展示。
6. ✅ 验收：`npm test` 98/98、`npm run test:e2e` 41/41、`typecheck` 与 `build` 均通过。

**Step 7 修复 — 结果页整页空白（已完成并验证）**
1. ✅ 根因：题库缺 `scale.type` → 前端按 type 定位量表失败 → 卡片内全空（详见 §2「Step 7 修复」与 §9 第 22 条）。
2. ✅ 修复：`data/question-bank.json` 两个量表补 `type`；`prisma/seed.ts` 改为读 `scale.type`，取值非法即抛错；`seed.ts` 本地类型补该字段。
3. ✅ 新守卫四处：`loader.test.ts`（type 硬契约）、`src/lib/result/pipeline.test.ts`（真实链路 + JSON 往返，6 项）、`scripts/smoke-render.mjs` + `npm run test:render`（真实浏览器渲染，11 项）、E2E [8] 增加结果 API 字段契约（93 → **99**）。
4. ✅ 验收：**故意删除题库 `type` → `pipeline.test.ts` + `loader.test.ts` 共 7 项立即变红**（`expected null not to be null`，与线上症状一致），恢复后 `npm test` **180/180**、`test:e2e` **99/99**、`test:render` **11/11**、typecheck / build 全绿。
5. ✅ 人工复核：用户原链接（`?pid=fb3f307d-…`）现已渲染出大五 5 维分数 4.50 / 4.00 / 4.00 / 4.00 / 3.00、分带、逐维解读、AI 5 维分数与合成指数 4.00，以及 2 个图表 SVG。

**Step 8 — Admin Dashboard（已完成并验证）**
1. ✅ `src/lib/auth.ts`：env 凭据（`ADMIN_USERNAME` / `ADMIN_PASSWORD`）+ HMAC-SHA256 签名会话 cookie（`ADMIN_SESSION_SECRET`）。**未采用 `ADMIN_PASSWORD_HASH`**——单管理员场景下 bcrypt 只增加依赖与运维成本，不改变"密码来自环境变量"这一事实上限；已改为在仪表盘对弱凭据**显式告警**。
2. ✅ `POST /api/admin/login` / `POST /api/admin/logout` / `GET /api/admin/session`；页面守卫用 `requireAdminPage()`（307 而非 401，因为面向浏览器）。
3. ✅ `GET /api/admin/stats`：参与人数 / 完成率 / 端到端耗时 / 各维度均值与 sd 与逐维 n / 合成指数分布。
4. ✅ `GET /api/admin/export?format=csv`：脱敏长表（匿名 UUID + 粗粒度人口学 + 维度分），**无 PII**，含公式注入防护与 BOM。
5. ✅ `src/app/admin/page.tsx` 仪表盘填真实数据（复用 `src/lib/scoring/*` 与 `src/lib/admin/*`）。
6. ✅ 测试：E2E 41 → **93 断言**（含无令牌 401、伪造令牌 401、逐字一致的统一 401 文案、cookie 属性、导出列契约、页面守卫与跳转）；新增 **74 个单测**（鉴权 35 / 限流 7 / 统计与 CSV 29 / 守卫覆盖 4）。
7. ✅ 验收（DoD）：无令牌访问任一 admin API → 401；有令牌返回正确统计；导出文件无 PII；`npm test` **172/172**、`test:e2e` **93/93**、typecheck / build 全绿。
8. ✅ 附带：`stop-dev.ps1` 加固（双通道探测 + DryRun + 失败显性化），解决"静默失手"。

**Step 9 — Analytics（已完成并验证）**
1. ✅ `GET /api/admin/reliability`：逐维度 α + **95% bootstrap 区间**（固定种子）+ k / listwise n / 剔除人数 / `meanInterItemR` / 惯例等级；α 无定义时回传 `reason`（零方差 / n<2 / k<2），**不返回 0 或 1**；负 α 如实返回。
2. ✅ `GET /api/admin/correlation`：`buildDomainSeries()` + `correlationMatrix()`；每格自带 n 与 p；另给 **Bonferroni 阈值、校正前后显著数、r 的 95% 近似半宽**，并把「未校正显著但校正后不显著」明说为「与纯属偶然一致」。
3. ✅ `GET /api/admin/items`：题项原始 + 重编码双分布、未作答数、原始/重编码均值、sd、**零变异与地板/天花板标记（按构念方向判定）**。
4. ✅ `src/app/admin/analytics/page.tsx`：骨架替换为真实图表（概览卡 + 警示 + α 表 + 下三角相关热力图 + 题项分布折叠区 + 口径与独立复核入口）；**服务端渲染**。
5. ✅ **独立评分交叉验证**（框架文档 §5 第 5 条）：`scripts/verify-scoring.mjs`（`npm run verify:scoring`）**不 import 项目代码**，独立实现口径后与 `format=csv` 逐格对账 + 抽样比对 `/api/results/:pid`，并产出 `verify-output/crosscheck-*.csv`。实测 **1056 个数值全一致**。
6. ✅ 新增 `/api/admin/export?format=raw`（逐题原始作答宽表）；三个新 API 均调 `guardAdminApi`（`guard-coverage.test.ts` 已自动要求）。
7. ✅ 测试：新增 **32 个分析单测 + 6 个导出单测**（总数 180 → **218**）；E2E 99 → **139 断言**（新增 [11] 分析契约）。
8. ✅ 验收（DoD）：未登录访问三个新 API → 401；计数守恒、矩阵对称、α 结构契约全部成立；页面渲染出 55 个热力格子（每格含 n）、60 道题、10 个折叠区；`npm test` **218/218**、`test:e2e` **139/139**、`test:render` **11/11**、`verify:scoring` **8/8**、typecheck / build 全绿。
9. ⚠️ **当前库内是测试数据**：分析页数值无实质心理测量学意义（见 §9 第 27 条）。

**Step 10 — Deployment（代码侧已完成并验证；仅剩"填 Neon 凭据 + 点部署"这一人工动作）**

1. ✅ **生产环境自检（双层硬拦截）**：`src/lib/env-check.ts`（纯函数，`prodEnvProblems` / `assertProdEnv`）
   + `scripts/check-prod-env.mts`（构建期闸门）。生产环境下若 `ADMIN_*` 缺失或仍是示例默认值、
   或 `DATABASE_URL` 仍指向 `file:`（本地 SQLite）/ 含占位密码 → **构建失败**；
   运行期由 `guard.ts::deploymentBlockedResponse()` 让全部管理端 API 返回 503 且不签发会话。
   失败信息**只含变量名、不含任何值**，可安全写进 CI 日志（`env-check.test.ts` 有专项断言）。
2. ✅ **凭据强度规则抽为单一真源**：`src/lib/security/credential-rules.ts`。
   原先"运行期告警"与我的新"部署期拦截"会各写一套判断 → 必然漂移，故抽出后
   `auth.ts::weakCredentialReasons()` 与 `env-check.ts` 共用同一套规则（文案与变量名保持不变，`auth.test.ts` 未改）。
3. ✅ **逃生舱设计**：`ALLOW_INSECURE_DEFAULTS=1` 才放行弱值，且**只写在被 git 忽略的本地 `.env`**。
   原实现用 `NODE_ENV` 单一信号判断，导致无法硬拒绝（本地 `npm start` 也是 production）。
   现改为「默认拒绝、需显式声明例外」，`audit:secrets` 会检查该变量没被固化进任何入库文件。
4. ✅ **密钥生成**：`scripts/gen-secrets.mjs`（`npm run gen:secrets`）→ 生成强随机
   `ADMIN_USERNAME`（`op-<8hex>`）/ `ADMIN_PASSWORD`（28 位，去除易混字符 + 拒绝采样保证均匀）/
   `ADMIN_SESSION_SECRET`（32 字节 hex），写入 `.env.production.local`。
   **写前先确认目标文件被 `.gitignore` 覆盖，否则拒绝写入**；终端**只打印掩码指纹**，永不打印明文。
5. ✅ **密钥泄露扫描**：`scripts/audit-secrets.mjs`（`npm run audit:secrets`），6 类检查
   （A 机密文件未忽略 / B 真实值全树反查 / C 硬编码凭据形态 / D `NEXT_PUBLIC_` 泄密命名与逃生舱固化 /
   E 客户端组件引用服务端密钥 / F `.next/static` 构建产物泄密）。输出全程掩码 + 指纹，发现即 exit 1，可作 CI 闸门。
6. ✅ **扫描器经过探针验证（关键）**：曾故意植入含**真实密钥值**的探针源文件与 `.next/static` 产物，
   确认 **B/C/D/E/F 五类检查全部命中且 exit 1、输出无明文**，随后清理并复跑至全绿。
   —— 一个从未被抓到过任何东西的扫描器，其绿灯没有证明力。
7. ✅ **安全响应头**：`next.config.mjs` 增加 CSP（`frame-ancestors 'none'` / `object-src 'none'` /
   `base-uri` / `form-action` / `connect-src 'self'`）、`nosniff`、`X-Frame-Options: DENY`、
   `Referrer-Policy`、`Permissions-Policy`、`Cross-Origin-Opener-Policy`；
   生产追加 HSTS；关闭 `X-Powered-By`；`/admin/*` 与 `/api/*` 加 `X-Robots-Tag: noindex`。
8. ✅ **Postgres 切换方案（避免双份 schema 漂移）**：`scripts/prisma-postgres.mjs`
   （`db:postgres:prepare` / `db:postgres:push`）从**唯一真源** `prisma/schema.prisma` 机械派生
   `prisma/schema.generated.postgres.prisma`（只替换 provider 一行，派生文件已 gitignore）。
   不在仓库里维护两份模型定义。`push` 前会拒绝 `file:` 串与占位密码，连接串只以脱敏形式打印。
9. ✅ **`.gitignore` 加固**：原规则只有 `.env` 与 `.env*.local`，**漏掉了 `.env.production` 这类不带 `.local` 的文件**；
   改为 `.env*` + `!.env.example`，并补 `*.pem` / `*.key` / `.vercel` / 派生 schema。
10. ✅ **文档**：新增 [`SECURITY.md`](../../SECURITY.md)（威胁模型 / 密钥存放位置 / Neon+Vercel 步骤 /
    上线后验证命令 / 已知局限 / 泄露处置顺序）；README 增「信息安全」节与脚本说明。
11. ✅ 测试：新增 **22 个单测**（`credential-rules.test.ts` 7 + `env-check.test.ts` 15，总数 218 → **240**）；
    E2E 新增 **[12] 部署安全契约**（响应头齐全、`noindex`、401 响应体只有单一 `error` 字段且不含
    实现细节关键词、cookie 的 HttpOnly/SameSite/Max-Age、登录响应不回显凭据、`/admin` 的 SSR HTML
    不含任何服务端变量名与连接串特征）。
12. ✅ 已本地验证：`tsc --noEmit` 通过；`npm test` **240/240**；`check-prod-env` 对 `.env`（开发弱值）
    按预期**拒绝并对 `.env.production.local` 按预期通过**（含指纹输出）；`audit:secrets` 全绿；
    构建期闸门已验证会跳过本地非生产构建、并在模拟生产时生效。
13. ✅ **部署已上线（公开可用）**：上述 1)–5) 全部完成——Neon 项目已建、**Pooled** 连接串已配、已 `db:postgres:push` 建表、Vercel 项目已建并按 `SECURITY.md` §4.3 配 4 个环境变量、Build Command 已改为 `node scripts/prisma-postgres.mjs generate && next build`、已跑 `test:e2e` / `test:render` 与 `SECURITY.md` §5 线上核对、生产库已从干净状态开始。**公开 URL：`https://web-assessment-platform-q7km6nfsp-xin-yunpeng.vercel.app`**。
    ⚠️ **若曾重置 Neon 密码**：必须同步把 Vercel 的 `DATABASE_URL` 换成新的 Pooled 串（保留 `?sslmode=require`）后 Redeploy，否则线上数据库调用会失败。
14. ✅ **已在 Vercel 实测通过**：`db push` 建表、派生 Postgres schema 的 `prisma generate`、生产 CSP/HSTS 实际生效、管理端 503 闸门均已验证；公开 URL 可正常完成作答与查看结果。**交接时请保留"首次部署若报错，优先怀疑派生的 Postgres schema 与 Build Command"这一排查顺序。**
15. ⚠️ **限流的取舍（明确记录，避免后人误以为已解决）**：登录限流仍是**按 IP、进程内**实现。
    评估后**刻意不做**成持久化/分布式：缺共享存储时做出来的只是"看起来强、实则不生效"的假分布式；
    数据库计数会造成 E2E 计数跨轮累积、几天后把测试自己打挂；加全局失败上限会给单管理员系统引入
    **自锁 DoS**（攻击者狂发失败即可把管理员一起锁在门外）；加人为延迟会放大被攻击时的 serverless 计费。
    **结论：把限流交给 Vercel 平台侧（Firewall / Attack Challenge Mode），应用内限流只作为抬高脚本成本的兜底。**
16. ⚠️ **CSP 仍含 `script-src 'unsafe-inline'`**：Next App Router 的内联 hydration 脚本所致，
    收紧需 nonce 贯穿改造，已记为 §11 待收紧项（不要误认为 CSP 已是严格模式）。
17. 交付物：README ✅ 已同步「已正式部署」状态与交付物索引；AI 开发记录 ✅ 完成（`docs/AI-DEVELOPMENT-RECORD.md`）；技术报告 ✅ 完成（`docs/TECHNICAL-REPORT.md`，含 α / 相关 / 题项分布结果与**全部限制声明**）；试点评估 ⬜ 待开展（交付物 D，需 ≥10 名独立参与者）。

---

## 11. 不应改变的设计决策（锁定项）

- **技术栈方案 C（Next.js 全栈 + Prisma + SQLite↔Postgres + Vercel）**：已在 package.json 落地，不要回退到 A/B 或引入重型框架。
- **配置驱动题库**：所有题目/维度/反向标记只存在于 `data/question-bank.json`，评分引擎不得硬编码题目。**每个量表必须声明 `type`（`"personality"` / `"attitude"`）**——前端据此定位量表，缺失会导致结果页整页空白（`loader.test.ts` 与 `pipeline.test.ts` 双重锁定；`seed.ts` 取值非法即抛错）。
- **5 点统一 Likert 与反向公式 `6 − value`**：评分口径，改动会破坏所有已设计测试用例。
- **匿名优先、零 PII**：不收集姓名/邮箱/IP；人口学仅为可选分桶且默认 NULL。
- **非临床诊断立场**：全站结果措辞中性（"相对倾向/自我洞察"），每处含免责声明；不得输出"你属于某类人格/你有某疾患"等越界结论。
- **评分纯函数化 + 必测**：`src/lib/scoring/*` 与 DB 解耦，所有评分/统计逻辑必须有对应单测（误差 < 1e-6）。
- **Big Five 40 题 / AI 20 题 + 等权合成指数**：当前题库已按此实现；若用户后续要求改为 20 题短式或调整 AI 维度，需同步更新 `question-bank.json` **与** `assessment-framework.md` 并补测试，不能只改一处。
- **管理端轻量鉴权**：env 凭据 + 签名会话 cookie（不引入 Supabase Auth / IdP），所有 admin API 统一 401 中间件。
- **保留 `readlink-polyfill.cjs` 及 `node -r` 调用方式**：本机 Windows G: 盘构建修复，删除会导致 `npm run dev/build` 崩溃。
- **强制 light 主题设计令牌**：颜色语义走 `globals.css` CSS 变量 + Tailwind `rgb(var(--x)/<alpha>)`；`dimension`/`ai` 配色为可视化预留，已定义在 tailwind.config.ts 中。勿引入暗色表面或散落硬编码色值。
- **基础组件复用**：页面统一使用 `src/components/ui/*`（Container/Card/Button/ProgressBar/Alert/Badge/LikertScale 等），不要各页重复造样式。
- **题目标识契约**：客户端与 API 之间一律用题目 **`code`**（如 `O1`）作为题目标识（`GET /api/questionnaire` 的 items 输出 `code`；`POST /api/responses` 的 `itemId` 即 code，后端再解析为 `Item.id`）。切勿让前端提交数据库 cuid。
- **草稿存储键约定**：`wap_participant_id`（当前参与者）、`wap_draft_<pid>`（该参与者草稿，含 `answers`/`demographics`/`updatedAt`）。改键名会使老草稿失联。
- **评分口径不可变**：反向重编码 `6 − value`、维度分 = recoded 均值、缺失 ≤1 填补 / >1 判 incomplete、合成指数 `(PU + TR + WA + LA + (6 − mean(CN)))/5`（五域等权，每域 0.20）、分带阈值 (2.5 / 3.5)。改动会同时破坏 **258 个单测**、**164 项 E2E**、**11 项渲染断言**与 `verify:scoring` 的逐格对账。
- **数值输出约定**：引擎内部全精度，对外 `round(x, 4)`；`incomplete` → `score=null` + `band=null`；合成指数不可部分合成。
- **图表库用 Recharts**（已在 dependencies，Step 7 起使用），不引入其它图表库；配色复用 `dimension-*` / `ai-*` 令牌。
- **顶栏导航去重规则**（Step 6 用户反馈）：`SiteHeader` 保持路由自适应——首页不重复主 CTA，管理端页面不出现前台流程链接；新增页面时沿用此规则，不要把同一入口同时放在顶栏与页面 hero 里。
- **心理措辞一律配置驱动**（Step 7）：面向用户的解读文案只写在 `data/interpretations.json`，组件与 API 都不得硬编码文案；未配置时返回 `null`（宁可少一句，也不临时编造）。新增维度必须同时补齐三段文案，否则 `interpretations.test.ts` 会失败。
- **结果呈现五条铁律**（Step 7，详见 §8.1）：① 数值为主、分带为辅；② 不做样本归一化/百分位；③ **CN 不在图表里翻转**（反转只发生在合成指数）；④ `incomplete` 不填估计值；⑤ 免责声明固定展示不折叠。
- **`N` 维度展示名为「情绪敏感性 Neuroticism」**：key 仍为 `N`（评分与数据不受影响）。改为「神经质」会造成污名化，不要回退。
- **可视化配色单一来源 = `src/lib/design/colors.ts`**：图表只从这里取色，且必须与 `tailwind.config.ts` 的 `dimension.*`/`ai.*` 同步。
- **`scripts/stop-dev.ps1` 必须保存为 UTF-8 with BOM**：否则 Windows PowerShell 5.1 按 ANSI 读取会乱码并语法报错（已实测）。
- **鉴权方案锁定**（Step 8）：`ADMIN_USERNAME` / `ADMIN_PASSWORD` + `ADMIN_SESSION_SECRET`（HMAC-SHA256 签名会话，httpOnly cookie，8 小时 TTL）。**不引入外部 IdP、不用 `ADMIN_PASSWORD_HASH`、不建会话表。** 密钥缺失/过短 → fail closed，没有开发后门。
- **管理端鉴权不用 middleware**（Step 8）：Edge Runtime 拿不到 Node 加密原语，会逼出第二套验签实现 → 鉴权分叉。坚持 `guardAdminApi()` / `requireAdminPage()` 显式守卫 + `guard-coverage.test.ts` 静态查漏。**新增管理 API 必须首行调用 `guardAdminApi(req)`。**
- **登录失败必须统一 401 且文案逐字相同**（Step 8）：不能区分"用户名错"与"密码错"，否则可被用于账号枚举（E2E 已断言三种错法响应完全一致）。
- **管理端统计口径铁律**（Step 8，详见 §8.2）：逐维报 n；n<2 → sd 为 `null` 不写 0；无数据 → `null` 不写 0；均值图 Y 轴固定 0–5 不缩放；**不画误差棒**（n=1 时用 0 长度棒等于宣称"无差异"）；管理端与个人结果页共用同一个 `scoreAll()` 与"最新已完成会话"口径。
- **跨端数据契约必须用真实链路测试锁定**（Step 7 修复新增）：凡"引擎产出 → HTTP → 前端渲染"的链路，测试输入**必须来自真实产出**并经过 `JSON.parse(JSON.stringify(...))` 往返（`undefined` 字段会被丢弃，这正是整页空白故障的成因）。**禁止只用手写 fixture 验证渲染逻辑**——fixture 会与真实产出漂移，且不会有人察觉。
- **客户端渲染的页面必须有一条真实浏览器断言**（Step 7 修复新增）：`npm run test:render` 是这类页面唯一的有效防线，**新增/改动能影响结果页渲染时（如新增量表、改 view-model、升级 Recharts）必须跑它**。改动前请先确认它不是以「跳过」形态通过的（见 §9 第 24 条）。
- **CSV 导出必须做公式注入防护 + UTF-8 BOM + CRLF + 导出列白名单**（Step 8）：人口学字段是客户端自由文本，`=HYPERLINK(...)` 之类内容会在 Excel 里被当公式执行；列白名单由 `stats.test.ts` 锁定，**不得新增任何含 PII 的列**。
- **分析的诚实性铁律**（Step 9，详见 §8.3）：α 无定义 → `null` + `reason`（不给 0/1）；**负 α 如实返回不截断**；α 必须与 bootstrap 区间同屏且**随机种子固定**（可复现）；α 必须并列 k / listwise n / 剔除人数 / 题目平均相关；α 等级标注为「通用惯例」而非常模；相关每格必须显示自己的 n 且必须给 Bonferroni 校正与多重比较警示；相关不等于因果；**地板/天花板按构念方向判定**；题项计数守恒。
- **验证实现必须与被验证实现分离**（Step 9）：`scripts/verify-scoring.mjs` **不得 import 项目代码**（含 `src/lib/scoring/*`），只允许共享 `data/question-bank.json`。任何"图省事复用同一实现"的改动都会把交叉验证变成自我确认，**必须拒绝**。
- **分析类组件保持服务端渲染**（Step 9）：`CorrelationHeatmap` / `ItemDistributionChart` 不使用 `"use client"`、不依赖 hooks，`<details>` 用原生 HTML 折叠——这样整页正文可被 curl/E2E 直接断言。只有确实需要交互时才升级为客户端组件。
- **`npm run verify:scoring` 是评分口径的最终防线**（Step 9）：改动任何评分/导出逻辑后都必须跑一次，它比对的是「独立实现 vs 程序输出」而不是「程序 vs 它自己」。
- **代码与文档中只允许出现变量名，永远不允许出现变量值**（Step 10）：任何把 `ADMIN_PASSWORD` / `ADMIN_SESSION_SECRET` / `DATABASE_URL` 的**值**写进源码、测试、文档、注释、issue 的行为都必须拒绝。需要真实凭据的场景一律走部署平台的 env 面板或本地被 git 忽略的 `.env*` 文件。
- **`.gitignore` 必须保持 `.env*` + `!.env.example` + `.secrets/` 的形态**（Step 10）：生产密钥统一放在 `.secrets/` 子目录（**刻意不用 `.env.production.local`**——Next.js 在 `NODE_ENV=production` 会自动加载它并覆盖 `.env`，导致本地预览连不上 SQLite）。`gen-secrets` 在写入前会自行校验目标文件确实被忽略，**不要绕过这道检查**。
- **`ALLOW_INSECURE_DEFAULTS` 只属于本地 `.env`**（Step 10）：它是"我知道自己在用弱默认值"的显式声明，绝不可出现在部署平台环境变量或任何入库文件中（`audit:secrets` 的 D 类检查会捕获固化行为）。
- **生产环境自检是双层硬拦截，不得为"让部署先跑起来"而拆除**（Step 10）：构建期（`check-prod-env` 前置）与运行期（`deploymentBlockedResponse()` → 503）都要保留。若部署报错，正确做法是补齐环境变量，而不是加 `ALLOW_INSECURE_DEFAULTS`。
- **凭据强度规则只有一处实现**（Step 10）：`src/lib/security/credential-rules.ts`。`auth.ts`（运行期告警）与 `env-check.ts`（部署期拦截）都必须调用它，**不得各自新增一条判断**——两套判断漂移会产出"告警说安全、自检说危险"的自相矛盾状态。
- **审计工具的输出永远不得包含明文**（Step 10）：`audit-secrets` / `gen-secrets` / `check-prod-env` 只允许输出掩码与指纹（SHA-256 前 8 位）。新增任何打印语句前先问："这行会不会出现在截图/CI 日志里？"
- **`prisma/schema.prisma` 是唯一 schema 真源，provider 永远保持 `sqlite`**（Step 10）：Postgres 版本由 `scripts/prisma-postgres.mjs` 机械派生（只替换 provider 一行）。**不得**在仓库里维护第二份模型定义（`schema.postgres.prisma` 之类）——两份模型必然漂移。
- **隐私约束延伸到限流状态**（Step 10，沿用"零 PII"）：不要为了让限流变分布式而把原始 IP 落库。若未来引入共享存储，键必须是加盐哈希后的值，不能是可还原的 IP。

---

## 附：需向用户澄清的遗留决策（此前多轮尚未最终拍板）

> **2026-09-13 状态更新**：以下多数为部署前的开放决策，已在部署过程中**默认采纳**且经用户确认，不再阻塞：
> ① 技术栈方案 C 锁定；② Big Five 维持 40 题；③ AI 量表维持 5 维度；④ 合成指数维持等权（五域算术平均 /5，每域权重 0.20，已与 `score.ts` 对齐）；⑥ 登录限流维持"交给 Vercel 平台侧"方案；「管理端 env + 签名会话鉴权」维持；「不提供百分位、仅启发式分带」维持；`N` 维持中性化展示名「情绪敏感性」；α 等级维持"通用惯例、非常模"标注。
> **仍开放 / 待推进**：⑤ 是否需要英文版或双语（当前 zh-CN）；⑦ 构建期自检对 `tsx` 的依赖（仅在换部署平台时需处理）；⑧ CSP `unsafe-inline` 收紧为非 nonce（独立改造项）；⑨ 是否需要"真作答时长"指标（需改数据模型）；⑪ 超大样本下 bootstrap 性能；⑫ 是否需要可下载的 Excel 复核工作簿。以及**最大未决项：真实用户试点（交付物 D，≥10 名独立参与者）尚未开展**。

> 这些不影响继续开发与维护，但若有调整应在合适时机向用户确认，避免返工：
1. 技术栈是否正式锁定方案 C（目前按 C 在推进且已落地）。
2. Big Five 用 40 题（当前）还是 20 题短式？
3. AI 量表 5 维度是否合适，是否增删（如 Effort Expectancy）？
4. 合成指数等权是否接受，还是只报 5 维度分？
5. 是否需英文版 / 双语切换（当前 zh-CN）？——**若需要，`data/interpretations.json` 与 `question-bank.json` 都要做成多语言结构，越早决定越省事。**
6. **（Step 10 新增）登录限流是否接受"交给 Vercel 平台侧（Firewall / Attack Challenge Mode）"的方案**？应用内限流仍是按 IP、进程内实现，跨实例可被绕过；若你希望应用内也真正生效，需要引入共享存储（Upstash Redis 之类），这会新增一个外部依赖与一份凭据（同样要按 `SECURITY.md` 的规则管理）。详见 §10 第 15 条。
7. **（Step 10 新增）构建期自检依赖 `tsx`（devDependency）**：Vercel 默认安装 devDependencies 故当前可行；若你计划换部署平台或改用 `--production` 安装，需要把 `tsx` 移入 dependencies 或把自检脚本预编译为 `.mjs`。详见 §9 第 36 条。
8. **（Step 10 新增）是否同意把 CSP 的 `script-src 'unsafe-inline'` 收紧为非 nonce**？收紧后 CSP 才算严格模式，但需要把 nonce 贯穿到 Next 的内联脚本注入链路，属独立改造项（有回归风险，需配合 `test:render`）。
6. 管理端鉴权方案（env + 签名会话，已按 Step 8 实现）是否最终接受？若不接受，需明确的替代方案（否则会牵动 guard / 令牌格式 / E2E 断言三处）。
7. 结果页是否需要"样本相对位置/百分位"——需先积累样本量才可计算，建议 Step 9 后再评估，当前只展示启发式分带（**当前已按"不提供百分位"实现**）。
8. （Step 7 新增）维度展示名中性化已自行实施（`N` → 「情绪敏感性」）——若你认为应与学术原文保持一致，可改回，但需同步 `interpretations.json` 与 `question-bank.json`。
9. （Step 8 新增）仪表盘是否需要一个"真作答时长"指标？目前没有作答开始时间（见 §9 第 21 条），只能给「创建 ID → 提交」的端到端间隔。若需要真作答时长，需改数据模型（首次作答即创建会话，或前端上报起始时间戳）——**现在改成本最低，越晚越贵**。
10. （Step 9 新增）分析页的 α 等级阈值（0.60/0.70/0.80/0.90）用的是通用惯例。若你有学科特定的阈值标准（或希望**完全不给出等级描述、只报数值与区间**），可调整——目前是"给等级但明确标注为惯例、非常模"。
11. （Step 9 新增）α 置信区间目前用 **bootstrap（1000 次重抽样，单次请求成本约几十毫秒）**。若未来样本量增到数千人、页面变慢，可考虑：降低抽样次数、改为按需计算（点击才展开），或改用解析近似（但需接受其在小样本下的失真）。
12. （Step 9 新增）"独立交叉验证"目前是**脚本 + CSV 双通道**。是否需要把它做成**可下载的复核工作簿**（含 Excel 公式的 `.xlsx`，让人打开就能看到逐格计算过程）？当前给出的是 CSV（`verify-output/crosscheck-*.csv`）与手算样例文本。
