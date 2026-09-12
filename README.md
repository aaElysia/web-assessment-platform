# Web 心理测评平台 (Web Assessment Platform)

> Agentic AI Web Assessment Challenge 项目
> 匿名心理测评平台：Big Five 人格 + AI 技术采纳态度。教育 / 自我洞察用途，**非临床诊断**。

## 技术栈

- **框架**：Next.js 14（App Router, TypeScript）—— 前端页面与 API 路由同仓
- **样式**：Tailwind CSS
- **数据库**：Prisma ORM；本地 SQLite（`file:./dev.db`），生产 PostgreSQL（Neon）
- **可视化**：Recharts
- **校验**：Zod
- **鉴权**：自研轻量方案（env 凭据 + HMAC-SHA256 签名会话 cookie），不引入外部 IdP
- **测试**：Vitest（单测 / 集成）+ 自建端到端契约脚本
- **部署**：Vercel + Neon Postgres

## 目录结构

```
src/
  app/          页面与 API 路由（App Router）；api/admin/* 为管理端接口
  components/   ui/（基础组件） admin/（管理端组件） charts/（图表） result/（结果明细）
  lib/          auth / admin（guard·stats·analysis·load）/ db / scoring / questionnaire /
                result / client / design / http / validation
data/           question-bank.json（60 题题库） interpretations.json（解读文案）
prisma/         schema / seed / migrations / dev.db
scripts/        e2e-results.mjs（HTTP 契约测试） smoke-render.mjs（真实浏览器渲染冒烟）
                verify-scoring.mjs（独立评分交叉验证） stop-dev.ps1（清理残留服务器）
verify-output/  交叉验证产出的对账表（crosscheck-*.csv，自动生成）
docs/           assessment-framework.md / dev-plan.md / 后续技术报告与 AI 开发记录
readlink-polyfill.cjs  见下方"Windows 注意事项"
```

## 快速开始

```bash
npm install
cp .env.example .env          # 本地默认 SQLite；生产请替换为强随机凭据
npm run db:generate           # 生成 Prisma Client
npm run db:migrate            # 创建 / 应用迁移（首次：--name init）
npm run db:seed               # 从 data/question-bank.json 载入量表与题目
npm run dev                  # http://localhost:3000
```

### 非交互式预览（推荐）

开发服务器（`next dev`）在部分环境下启动时会因清空 `.next` 触发沙箱的安全删除防护而崩溃。
若只想预览界面，用生产模式更稳（不需要清 `.next`）：

```bash
npm run build
npm start -- -p 3000         # http://localhost:3000
```

### 停止残留的服务器

后台启动的开发服务器可能在终端关闭后继续存活，占用端口并让新实例顺延到 3001/3002…
累积多个后还可能出现"旧实例引用失效的 `.next` → 页面 500"。一键清理：

```bash
npm run dev:stop             # 仅结束监听本项目端口的 node 进程，不删除任何文件
npm run dev:stop:dry         # 只看会结束哪些进程，不动手
```

> 若脚本提示"无法探测端口占用"，说明当前会话（受限 / 沙箱）屏蔽了 `netstat` 与
> `Get-NetTCPConnection`；脚本会**显式报错并退出**，绝不会静默假装清理成功。

常用脚本：`dev` / `build` / `start` / `typecheck` / `test` / `test:e2e` / `test:render` / `verify:scoring` / `gen:secrets` / `audit:secrets` / `check:prod-env` / `deploy:check` / `db:postgres:prepare` / `db:postgres:push` / `dev:stop` / `dev:stop:dry` / `lint`。

## 信息安全

**上线前必读 [`SECURITY.md`](SECURITY.md)**（含威胁模型、密钥存放位置、Vercel + Neon 部署步骤、上线后验证清单、泄露处置顺序）。

本项目把"不泄露开发者关键信息"做成了**可执行、可回归的检查**，而不是靠自觉：

```bash
npm run gen:secrets      # 生成强随机生产凭据 → .secrets/production.env（git 忽略；终端只打印掩码指纹，不打印明文）
npm run audit:secrets    # 密钥泄露扫描：源码 / 客户端包 / 构建产物，5 类检查，只输出掩码
npm run check:prod-env   # 校验生产凭据是否达到上线标准（弱值/本地库会被拒绝）
npm run deploy:check     # 上线前一键闸门：泄密扫描 + 生产自检 + 类型检查 + 单测
```

`audit:secrets` 覆盖的真实事故类型：

| 检查 | 抓什么 |
|---|---|
| A. 机密文件未忽略 | `.env*` / `.secrets/` / `*.pem` / `*.key` 未被 `.gitignore` 覆盖 |
| B. 真实密钥外泄 | 从本地 `.env*` 与 `.secrets/` 读出真实值，全树反查（值出现在任何源码/文档即报警） |
| C. 硬编码凭据 | 带真实密码的连接串、`sk-` / `AKIA` / `ghp_` / 私钥块 / JWT |
| D. 命名泄密 | `NEXT_PUBLIC_*SECRET/PASSWORD/TOKEN*`（该前缀会被打进浏览器包）、逃生舱变量被固化 |
| E. 客户端读密钥 | `'use client'` 文件里引用 `process.env.ADMIN_*` / `DATABASE_URL` |
| F. 构建产物泄密 | `.next/static`（真正送到浏览器的字节）中出现密钥名或密钥值 |

> 该工具的输出**全程只有掩码与指纹**（如 `Wd********%9 (len=28)`）——审计工具自己不能成为泄露渠道。
> 其有效性经过**探针验证**：曾故意植入含真实值的探针文件与构建产物，A–F 六类检查全部命中后才清理。
> 绿灯只有在"确实有真实值参与反查"的前提下才有意义，脚本会在没有真实值时明确提示证明力有限。

生产环境自检是**双层硬拦截**：构建期（`next build` 前先跑 `check-prod-env`，Vercel 上不合格即构建失败）
与运行期（管理端守卫先过部署健康闸门，不通过一律 503 且不签发会话），
失败信息只含变量名、不含任何值，可安全写进 CI 日志。
本地以 `NODE_ENV=production` 预览时靠 `.env` 中的 `ALLOW_INSECURE_DEFAULTS=1` 显式放行——
**该变量只应存在于被忽略的本地 `.env`，`audit:secrets` 会检查它没被固化进任何入库文件。**

## 管理端

访问 `/admin`（未登录会自动跳到 `/admin/login`）。凭据来自环境变量：

```bash
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="change-me-in-prod"          # 生产务必替换为强随机值
ADMIN_SESSION_SECRET="dev-only-secret-change-me"   # 生产 ≥32 位随机值
```

> **本地开发**：`.env` 里带 `ALLOW_INSECURE_DEFAULTS=1`，用于声明"我知道自己在用开发默认值"，
> 这样以 `npm start`（NODE_ENV=production）本地预览时不会被生产自检拦住。
> **生产**：用 `npm run gen:secrets` 生成强随机值并通过部署平台的 env 面板注入，
> 且**绝不要**在部署平台设置 `ALLOW_INSECURE_DEFAULTS`。详见 [`SECURITY.md`](SECURITY.md)。

- 登录后为：仪表盘（参与量 / 完成率 / 各维度均值与逐维 n、sd / 合成指数分布）、
  分析（Cronbach α 与 bootstrap 区间 / 维度相关热力图 / 题项反应分布）、导出（CSV 下载）。
- 所有 `/api/admin/*`（除登录、登出、会话探针）均要求有效会话，否则 **401**。
- 若仍在使用示例默认凭据，仪表盘顶部会亮出**醒目红色告警**——不要带着默认密码上线。

## 测试

```bash
npm test                     # Vitest 单测（240 项）
BASE_URL=http://localhost:3000 npm run test:e2e      # HTTP 契约测试（164 项断言，需先启动服务）
BASE_URL=http://localhost:3000 npm run test:render   # 真实浏览器渲染冒烟（11 项断言，需先启动服务）
BASE_URL=http://localhost:3000 npm run verify:scoring # 独立评分交叉验证（需先启动服务）
```

端到端契约测试会真实创建匿名参与者、提交 60 题作答，再与**手工核算的期望分数**逐项比对，
用于锁定评分口径（反向重编码、缺失策略、合成指数、解读文案配置）不被回归破坏；
同时覆盖管理端鉴权契约（无令牌 401、伪造令牌 401、统一错误文案、cookie 属性、页面跳转）、
CSV 导出契约（列白名单、BOM、CRLF、行数 = 参与者数）与分析契约（α 结构、相关矩阵对称性与
Bonferroni、题项计数守恒、`format=raw`）。

`test:render` 用**本机已安装的 Chrome / Edge 无头模式**执行客户端 JS，断言结果页上确实渲染出
10 个维度名称、10 个格式化分数、分带标签、图表 SVG 与合成指数（以 API 返回值为真值，不硬编码维度名）。
**为什么需要它**：结果页是客户端渲染，curl 与 E2E 都只能看到 Suspense 外壳——曾有一个
"题库缺 `scale.type` → 前端定位不到量表 → 整页只有卡片标题"的缺陷，在所有单测与 E2E 全绿的情况下潜伏了很久。
未找到浏览器内核时脚本会打印 `[跳过]` 并以 exit 0 结束；CI 中请确保有 Chrome/Edge 或设置 `CHROME_PATH`。

`verify:scoring` 是**独立评分交叉验证**：脚本**不 import 项目任何代码**，自己重写一遍评分口径，
再用两条独立通道对账——`/api/admin/export?raw`（逐题原始作答）经独立重算 vs `/api/admin/export?csv`
（程序输出的维度分），并抽样比对 `/api/results/:pid`；结果写入 `verify-output/crosscheck-*.csv`
（列为 `<维度>_indep / _prog / _diff`，空 diff 即一致）供人工在 Excel 里再核一遍。
**为什么要重写一遍**：若两边共用同一份实现，"验证"就退化成"用程序的结果验证程序"，口径整体错掉也照样全绿。

> 测试会读取同目录 `.env` 以取得管理端凭据；缺失凭据时相关断言会明确失败而非跳过。

## ⚠️ Windows 注意事项（G: 盘 readlink bug 修复）

本机某些卷（如 G: 盘）上，Node 的 `fs.readlink` 对普通文件会误报 `EISDIR`，导致 webpack 构建 / 启动直接崩溃：
`EISDIR: illegal operation on a directory, readlink '...'`。

修复方式（`dev` / `build` / `start` 脚本已内置，无需手动操作）：

- `readlink-polyfill.cjs`：把 `EISDIR` 转译为 `EINVAL`（"非符号链接"），与 `resolve.symlinks=false` 语义一致。
- npm 脚本通过 `node -r ./readlink-polyfill.cjs node_modules/next/dist/bin/next ...` 在进程启动前注入。

该补丁在 macOS / Linux / Vercel 等正常文件系统上为**空操作**（readlink 本就正常，不会触发转译），可安全保留。

## 开发进度

- [x] Step 1 初始化项目（依赖 / 构建 / dev 启动 / 测试基座）
- [x] Step 2 数据库（Prisma schema + 迁移 + 题库 seed）
- [x] Step 3 用户端后端 API（participants / consent / questionnaire / responses）
- [x] Step 4 前端 UI（设计令牌 + 基础组件库 + 页面骨架）
- [x] Step 5 问卷（Consent 门槛 / 进度条 / 草稿续答 / 提交）
- [x] Step 6 评分引擎（纯函数 + 单测 + `/api/results/:pid`）
- [x] Step 7 结果可视化（雷达图 / 条形图 / 合成指数 / 配置驱动中性解读）
- [x] Step 8 管理端仪表盘（签名会话鉴权 / 统计与分布 / CSV 导出）
- [x] Step 9 分析（Cronbach α + bootstrap 区间 / Pearson 相关热力图 / 题项分布 / 独立交叉验证）
- [ ] Step 10 部署（Vercel + Neon）

> 交接文档见 `CONTINUATION.md`（含当前状态、评分口径、锁定决策与下一步清单）。
> 设计文档见 `docs/`（`assessment-framework.md` 为评分逻辑权威来源）。

