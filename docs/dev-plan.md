# Development Plan · 软件开发规划
# Web 心理测评平台（Agentic AI Web Assessment Challenge）

> 版本：v1.0.0 ｜ 状态：待评审 ｜ 原则：确认后再开发，每阶段附"设计理由 / 潜在问题 / 验证方式"

---

## 1. 完整项目目录结构

采用 **Next.js 全栈单代码库**（理由见第 2 节）。以下为规划结构（确认后由 Sprint 1 脚手架化，当前仅文档）：

```
web-assessment-platform/
├── docs/                      # 全部文档交付物
│   ├── architecture.md        # 第一阶段：系统架构
│   ├── assessment-framework.md# 第二阶段：测评内容设计（已交付）
│   ├── dev-plan.md            # 本文件：开发规划
│   ├── technical-report.md    # Sprint 5/6：技术报告
│   ├── ai-dev-record.md       # Sprint 5/6：AI 开发记录
│   └── pilot-evaluation.md    # Sprint 5/6：试点评估方案
├── data/
│   └── question-bank.json     # 配置驱动题库（已交付，60 题）
├── prisma/                    # 数据库
│   ├── schema.prisma          # Scale/Item/Participant/Session/ResponseItem
│   ├── seed.ts                # 从 question-bank.json 载入量表与题目
│   └── migrations/            # 版本化迁移
├── src/
│   ├── app/                   # 前端页面 + API（App Router）
│   │   ├── layout.tsx
│   │   ├── page.tsx           # 引导页（用途/匿名/非诊断声明）
│   │   ├── consent/page.tsx   # 知情同意（门槛）
│   │   ├── assessment/page.tsx# 作答（进度/草稿续答）
│   │   ├── result/page.tsx    # 结果可视化（雷达/柱状 + 中性解读）
│   │   ├── admin/
│   │   │   ├── login/page.tsx
│   │   │   ├── page.tsx       # 仪表盘：人数/完成率/均值/分布
│   │   │   ├── analytics/page.tsx # 信度α/相关矩阵/题项分布
│   │   │   └── export/page.tsx# CSV 导出
│   │   └── api/
│   │       ├── participants/route.ts     # POST 创建匿名参与者
│   │       ├── consent/route.ts          # POST 记录同意
│   │       ├── questionnaire/route.ts    # GET 题库配置
│   │       ├── responses/route.ts        # POST 提交作答
│   │       ├── results/[pid]/route.ts    # GET 评分结果
│   │       └── admin/
│   │           ├── login/route.ts        # POST 管理员登录
│   │           ├── stats/route.ts        # GET 统计（需鉴权）
│   │           ├── reliability/route.ts  # GET Cronbach α
│   │           ├── correlation/route.ts  # GET Pearson 矩阵
│   │           ├── items/route.ts        # GET 题项反应分布
│   │           └── export/route.ts       # GET CSV 导出
│   ├── components/
│   │   ├── ui/                # Button/Card/ProgressBar 等基础组件
│   │   ├── questionnaire/     # LikertScale/QuestionCard/ProgressTracker
│   │   ├── charts/            # RadarChart/Histogram/Heatmap（Recharts）
│   │   └── admin/             # StatCard/DataTable
│   ├── lib/
│   │   ├── db.ts              # Prisma 客户端单例
│   │   ├── auth.ts            # 管理员会话（签名 cookie / JWT）
│   │   ├── questionnaire/loader.ts  # 读取 question-bank.json
│   │   ├── scoring/
│   │   │   ├── score.ts       # 纯函数：反向重编码 + 维度均值 + AI 指数
│   │   │   ├── reliability.ts # Cronbach α
│   │   │   ├── correlation.ts # Pearson r
│   │   │   └── types.ts
│   │   └── validation.ts      # 输入校验（zod）
│   ├── tests/
│   │   ├── unit/              # 评分/α/相关 已知答案单测
│   │   ├── fixtures/          # 手工核算作答样本
│   │   ├── integration/       # API 契约测试
│   │   └── e2e/               # Playwright 用户流程
│   └── styles/
├── public/
├── .env.example               # 环境变量模板（含 ADMIN 凭据占位）
├── .env.local                 # 本地密钥（gitignore）
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── README.md
└── .gitignore
```

**结构理由**
- 单一代码库同时承载前端页面与 API 路由，减少部署单元与失败面（契合"可靠性优先"）。
- `lib/scoring/*` 为**纯函数 + 独立 tests**，是"评分算法必须测试"的落点，与 DB 解耦。
- `data/question-bank.json` 为单一事实源；`prisma/seed.ts` 从中载入，引擎不硬编码题目。
- 测试分 unit / integration / e2e 三层，对应不同验证目标。

---

## 2. 技术栈比较与推荐

| 维度 | A. React(Vite)+Node+Postgres | B. Next.js + Supabase | C. Next.js 全栈 + Prisma + Postgres(Vercel+Neon) ★推荐 |
|---|---|---|---|
| 开发速度 | 中（前后端分离，样板多） | 高（Auth/DB/存储开箱即用） | 高（单代码库，API 路由即后端） |
| AI 辅助能力 | 良（均常见） | 良 | 优（Next.js+Prisma 在 AI 语料极常见，生成质量高） |
| 部署难度 | 中-高（前端/后端/DB 分别托管，配 CORS、env） | 低-中（Vercel+Supabase 托管） | 低（Vercel 一键 + Neon 托管 DB，env 隔离） |
| 稳定性 | 高（成熟、完全可控） | 高（但依赖外部服务；自定义分析需 SQL/Edge） | 高（自定义信度/相关用 TS 纯函数，逻辑可控） |

**推荐方案 C 的理由**
1. 本项目**匿名收集、无需用户认证**，Supabase Auth 的核心价值有限；仅管理员登录可用轻量签名会话解决。
2. 信度（Cronbach α）、相关（Pearson）为**自定义统计计算**，用 TypeScript 纯函数比 Supabase SQL/Edge Function 更直观、更易单测。
3. 单一代码库 + Vercel + Neon，部署失败面最小，符合"可靠性优先、不堆无意义功能"。
4. Prisma 让本地 SQLite（试点）与生产 Postgres（Neon）**同 schema 零改代码**切换。

**备选**：若你偏好托管 DB/Auth，Option B 可行，但需额外处理 RLS 与 Edge 分析函数，复杂度上升。

> 此推荐同时回应第一阶段遗留决策："推荐技术栈"即定为方案 C；G 盘目录名沿用 `G:\web-assessment-platform`。

---

## 3. Sprint 计划与验收标准

### Sprint 1 — 基础项目（Foundation）
**目标**：可启动的工程骨架 + 数据模型 + 题库载入。
**任务**
- 初始化 Next.js(TS) + Tailwind + Prisma；配置 ESLint/Prettier/TS strict。
- 编写 `schema.prisma`（Scale, Item, Participant, ResponseSession, ResponseItem）与迁移。
- `seed.ts` 从 `question-bank.json` 载入量表与 60 题。
- `.env.example`、CI 骨架（lint + typecheck + test）、README 骨架。
**验收标准（DoD）**
- `npm run dev` 本地可启动；`prisma migrate dev` + `seed` 后数据库含 5 大五维度 + 5 AI 维度 + 60 题。
- `GET /api/questionnaire` 返回完整题库配置（不含答案）；lint/typecheck 全绿。
- README 含运行与迁移说明。

### Sprint 2 — Questionnaire（用户端流程）
**目标**：匿名作答闭环可用。
**任务**
- 引导页、Consent 页（门槛：未同意不可作答）、Assessment 页（顶部进度条 + localStorage 草稿 + 刷新续答）、Result 页占位。
- API：participants / consent / responses（提交校验）。
**验收标准（DoD）**
- 端到端匿名提交成功；进度在刷新后保留；Consent 为强制门槛。
- 非法/缺失提交返回 400；数据库**不含任何 PII（无姓名/邮箱/IP）**。
- 未完成会话标记为 `incomplete`，不计入完成率。

### Sprint 3 — Scoring（评分引擎）
**目标**：评分正确且经测试，结果可视化。
**任务**
- `lib/scoring/score.ts`：反向重编码、维度均值、AI 合成指数（纯函数）。
- 已知答案单元测试（覆盖反向、缺失 1 题填补、缺失 >1 题 incomplete、全 3 分=3.0 等）。
- `GET /api/results/:pid` + 结果页可视化（Big Five 雷达图、AI 维度柱状图）+ 中性解读与免责声明。
**验收标准（DoD）**
- 单测全绿，误差 < 1e-6；`/api/results` 输出与手算一致（契约测试）。
- 图表正确渲染；解读措辞为"相对倾向/自我洞察"，含"非临床诊断"声明。

### Sprint 4 — Dashboard（管理端）
**目标**：管理端分析与导出可用且安全。
**任务**
- 管理员登录（env 凭据 + 签名会话）；统一鉴权中间件。
- 仪表盘：参与人数、完成率、各维度均值、分数分布直方图、题项反应分布。
- 分析 API：可靠性（Cronbach α 每维度/量表）、相关（Pearson 矩阵热力图）。
- CSV 导出（脱敏）。
**验收标准（DoD）**
- 管理端所有端点无令牌请求返回 401；登录后可访问。
- stats / α / correlation 对样本的输出与独立 Excel 核算一致（交叉验证）。
- 导出 CSV 不含 PII；α 在零方差时返回 `null` 并提示。

### Sprint 5 — Testing（质量与文档）
**目标**：质量门禁通过 + 文档成形。
**任务**
- E2E（Playwright）用户流程；集成/契约测试补全。
- 安全审查清单（无 IP、鉴权、HTTPS、数据最小化）；移动端/可访问性抽检。
- 起草 technical-report.md、ai-dev-record.md、pilot-evaluation.md。
**验收标准（DoD）**
- E2E 绿；管理端点鉴权测试绿；安全清单全过。
- α / 相关在试点样本上复算通过；三份文档初稿完成。

### Sprint 6 — Deployment（部署上线）
**目标**：公网可达、稳定运行。
**任务**
- Vercel 部署 + Neon Postgres；环境变量隔离（生产/本地）。
- 生产迁移 + 种子；部署后冒烟测试；基础监控/错误告警。
**验收标准（DoD）**
- 公网 HTTPS 可达；生产库迁移+种子成功；管理员登录、匿名提交→结果全流程在线上跑通。
- README / AI 开发记录 / 技术报告最终定稿；提供 Source code 仓库链接。

---

## 4. 总体质量门禁（贯穿各 Sprint）
- 每次合并前：lint + typecheck + 单测必须通过。
- 所有评分/统计逻辑有对应单测；管理端 API 必须有鉴权测试。
- 任何涉及"结论"的文案不得越界为临床诊断；数据默认匿名。

---

## 5. 待确认（合并前两阶段遗留）
1. 技术栈确认采用 **方案 C**（Next.js 全栈 + Prisma + Neon + Vercel）？
2. 第一阶段遗留：Big Five 40 题（推荐）还是 20 题短式？AI 维度/合成指数/语言（双语？）？
3. 管理端鉴权接受"env 凭据 + 签名会话"？
4. 确认后由 Sprint 1 实际脚手架化本目录结构（当前仅文档）。

> 注：本阶段未创建任何应用代码/文件夹，仅产出规划文档。
