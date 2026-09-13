# 部署与信息安全清单（SECURITY.md）

> 本文件是**上线操作手册**，不是安全声明。它回答三个问题：
> 哪些信息算关键信息、它们该放在哪里、以及怎么验证没放错。
>
> 适用场景：把本项目部署到 Vercel + Neon，并对外发布测评链接。
> 所有命令都在项目根目录执行。

---

## 1. 什么算「关键信息」

| 类别 | 具体内容 | 泄露后果 |
|---|---|---|
| **管理端口令** | `ADMIN_PASSWORD` | 攻击者可直接登录管理端，读取/导出全部作答数据 |
| **会话签名密钥** | `ADMIN_SESSION_SECRET` | 可伪造任意管理员会话，**绕过登录**（比口令泄露更危险：改口令也没用，必须换密钥） |
| **数据库凭据** | `DATABASE_URL` 中的用户名/密码 | 直连生产库，可读可写可删全部数据 |
| **管理员用户名** | `ADMIN_USERNAME` | 非口令，但泄露后攻击者省去猜账号这一步，故一并保护 |
| 参与者作答数据 | 数据库内容 | 本项目**不收集可识别身份的信息**，但作答数据本身仍属敏感 |
| 平台侧凭据 | Vercel / Neon / GitHub 的登录态与 token | 连锁失守（可改部署、可读环境变量） |

**不属于关键信息**（泄露影响可控，但仍不建议公开）：题库内容、解读文案、量表结构。

---

## 2. 密钥只应该出现在哪里

| 变量 | 唯一合法存放位置 | 绝对不要出现在 |
|---|---|---|
| `ADMIN_USERNAME` | 部署平台环境变量面板 / 本地 `.env`、`.secrets/production.env` | 源码、文档、测试、聊天记录、截图、issue/工单 |
| `ADMIN_PASSWORD` | 同上 | 同上 |
| `ADMIN_SESSION_SECRET` | 同上 | 同上 |
| `DATABASE_URL` | 同上 | 同上（含**只贴主机名也不行**——连接串是整体凭据） |

规则的核心只有一条：**代码与文档里只出现变量名，永远不出现变量值。**

`.gitignore` 已把 `.env*`（除 `.env.example`）、`*.pem`、`*.key`、`.secrets/`（生产密钥集中目录）、`.vercel` 全部排除；
`npm run audit:secrets` 会机械地复核这条规则是否被破坏。

> 为什么不用 `.env.production.local`：Next.js 在 `NODE_ENV=production` 会**自动加载**该文件且优先级高于 `.env`，
> 导致本地 `npm start` 预览被生产占位连接串覆盖、连不上本地 SQLite。改用 `.secrets/` 子目录后 Next **不会**加载，
> 本地与生产凭据彻底隔离；真实值仍由你手工粘进部署平台 env 面板，不入仓库。

---

## 3. 生成密钥

```bash
npm run gen:secrets        # 生成强随机 ADMIN_* 并写入 .secrets/production.env（git 忽略）
npm run gen:secrets -- --force   # 轮换（覆盖旧值；轮换后必须同步更新部署平台）
```

脚本行为（每一条都是为了"不制造泄露"）：

- 写入前先确认目标文件**确实被 `.gitignore` 覆盖**，否则拒绝写入；
- 终端**只打印掩码指纹**（SHA-256 前 8 位），不打印明文 —— 截图、录屏、贴日志都安全；
- 已存在时默认不覆盖，避免把线上正在用的密钥冲掉；
- `DATABASE_URL` 留为占位符，需你从 Neon 控制台替换。

指纹的用途：部署完后用它核对"线上跑的是不是这一份密钥"，而无需把明文贴来贴去。

```bash
npm run check:prod-env     # 校验 .secrets/production.env 是否达到上线标准（打指纹 + 逐项检查）
```

---

## 4. 部署步骤

### 4.1 建数据库（Neon）

1. Neon 控制台 → 新建项目（区域就近，例如 Singapore / US East）；
2. Connection Details → 选 **Pooled connection**（Serverless 场景必须用 Pooler，否则连接数会打满）；
3. 复制连接串，形如
   `postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/DBNAME?sslmode=require`
   —— **务必保留 `?sslmode=require`**；
4. 把连接串填进 `.secrets/production.env` 的 `DATABASE_URL`（替换占位符）。

### 4.2 建表

```bash
npm run check:prod-env       # 先确认凭据合规
npm run db:postgres:push     # 从单一 schema 真源派生 Postgres schema 并在目标库建表
npm run db:generate          # 把本地 Prisma Client 切回 SQLite（否则本地开发会连不上库）
```

> 说明：`prisma/schema.prisma` 永远保持 `provider = "sqlite"` 作为**唯一真源**；
> Postgres 版本由脚本机械派生（只改 provider 一行），因此不存在"两份模型定义漂移"的风险。
> `db:postgres:push` 使用 `db push`（不产生迁移历史），适合**全新空库首次建表**。

### 4.3 部署到 Vercel

1. 在 Vercel 新建项目并连接本仓库；
2. **Settings → Environment Variables**，逐条添加（Environment 选 `Production`，
   建议同时勾 `Preview` 便于预览环境测试，但**Preview 也必须是强凭据**）：

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Neon 的 Pooled 连接串（含 `?sslmode=require`） |
   | `ADMIN_USERNAME` | `.secrets/production.env` 中的值 |
   | `ADMIN_PASSWORD` | 同上 |
   | `ADMIN_SESSION_SECRET` | 同上 |

3. **Build Command 改为**：
   ```
   node scripts/prisma-postgres.mjs generate && next build
   ```
   （`next build` 之前会自动跑生产自检 `check-prod-env`，环境变量缺失或仍是弱值会让**构建失败**，
   从源头上杜绝"把默认口令部署上线"。）
4. **不要**在 Vercel 里设置 `ALLOW_INSECURE_DEFAULTS` —— 那是本地预览专用逃生舱，
   一旦设上等于关掉了上面这道闸门。
5. 部署完成后：Settings → Domains 确认为 HTTPS（Vercel 默认自动签发证书）。

### 4.4 平台侧建议开启（这几项比应用内限流有效得多）

- **Vercel Firewall / Attack Challenge Mode**：对登录路径 `/api/admin/login` 配置速率限制规则。
  应用内的限流是进程内的，Serverless 多实例下会被绕过；**平台侧限流才是主防线**。
- **Neon**：为应用单独建数据库角色，只授予所需权限（不要用 owner 角色跑应用）。
- **GitHub**：开启 2FA；不要把 Vercel/Neon 的 token 提交进仓库。

---

## 5. 上线后验证（照做即可）

```bash
# 1) 先本地构建 + 扫描，确保密钥没被打进浏览器包（这一步只能在 build 之后做）
npm run build
npm run audit:secrets

# 2) 对线上跑端到端与渲染契约（含安全响应头、cookie 属性、SSR 不泄露配置等断言）
BASE_URL=https://<你的域名> npm run test:e2e
BASE_URL=https://<你的域名> npm run test:render
```

手工复核（30 秒）：

```bash
# 安全响应头应当齐全
curl -sI https://<你的域名>/ | grep -iE "content-security-policy|x-content-type|x-frame|referrer-policy|strict-transport"

# 未登录必须 401，且响应体只有 {"error":"Unauthorized"}（不应泄露任何配置信息）
curl -s https://<你的域名>/api/admin/stats

# 管理端 HTML 里不应出现任何服务端变量名
curl -s https://<你的域名>/admin | grep -c "ADMIN_PASSWORD\|ADMIN_SESSION_SECRET\|DATABASE_URL"   # 期望 0
```

浏览器侧确认：登录后 F12 → Application → Cookies，`admin_session` 应带
`HttpOnly`、`Secure`、`SameSite=Lax`。

---

## 6. 已内置的防护（代码层面，可被测试回归）

| 防护 | 位置 | 对应测试 |
|---|---|---|
| 生产弱凭据/本地库 **硬拒绝**（构建期 + 运行期双层） | `src/lib/env-check.ts`、`scripts/check-prod-env.mts` | `env-check.test.ts` |
| 密钥泄露扫描（源码 / 客户端包 / 构建产物，5 类检查） | `scripts/audit-secrets.mjs` | 手动探针验证（见 README） |
| 密钥生成不回显明文 | `scripts/gen-secrets.mjs` | — |
| 签名会话（HMAC-SHA256）+ 常量时间比较 + fail closed | `src/lib/auth.ts` | `auth.test.ts` |
| 显式守卫覆盖所有管理端 API | `src/lib/admin/guard.ts` | `guard-coverage.test.ts` |
| 统一 401 文案（不区分无 cookie / 令牌无效，防账号枚举） | `guard.ts` | `e2e-results.mjs [9]` |
| 出错不泄露内部信息（对外仅通用文案，细节只进服务端日志） | 各 route | `e2e-results.mjs [12]` |
| 安全响应头：CSP / nosniff / DENY / Referrer-Policy / Permissions-Policy / HSTS(生产) | `next.config.mjs` | `e2e-results.mjs [12]` |
| 不暴露 `X-Powered-By` | `next.config.mjs` | `e2e-results.mjs [12]` |
| 管理端与接口 `noindex` | `next.config.mjs` | `e2e-results.mjs [12]` |
| 登录失败限流（按 IP、进程内） | `src/lib/admin/throttle.ts` | `throttle.test.ts` |
| 请求体大小上限 | `src/lib/http.ts` | — |

---

## 7. 已知局限（诚实清单，不是没做而是不方便做）

1. **应用内限流不是分布式的**。Serverless 多实例各算一份，攻击者可并发绕过。
   已评估并在代码注释中记录了为什么**不**做成假的分布式实现（缺共享存储则无法真正生效；
   数据库计数会造成测试跨轮累积污染；全局上限会给单管理员系统引入自锁 DoS；
   人为延迟反而放大被攻击时的计费成本）。
   **结论：把限流交给 Vercel 平台侧，应用内限流只作为抬高脚本成本的兜底。**
2. **CSP 仍含 `'unsafe-inline'`**（`script-src`）。要收掉需为每次请求生成 nonce 并贯穿
   所有内联脚本，属于独立改造项，已记入 `docs/process/CONTINUATION.md §11 待收紧项`。
3. **会话无法服务端主动吊销**。无状态签名令牌的固有取舍：只能通过轮换
   `ADMIN_SESSION_SECRET` 让全部会话同时失效（这也是泄露后必做的动作）。
4. **审计工具只能反查它见过的值**。`audit:secrets` 反查的是本地 `.env*` 中的真实值；
   如果某份密钥只存在于部署平台、却被粘贴进仓库，扫描器无从比对——
   因此第 5 节的手工复核与"贴过即轮换"的纪律不可省。
5. **数据库错误日志可能包含主机名**。Prisma 的连接错误信息会带出主机与用户名
   （密码通常被脱敏），因此这些日志应视为内部信息，不要公开粘贴。

---

## 8. 怀疑泄露时的处置顺序

```bash
# 1) 立刻轮换（旧值作废，不必先查明原因）
npm run gen:secrets -- --force

# 2) 同步更新部署平台的环境变量，然后重新部署
#    —— 换 ADMIN_SESSION_SECRET 会让所有已登录会话立即失效，这是期望行为

# 3) 若怀疑数据库凭据泄露，去 Neon 控制台重置角色密码并更新 DATABASE_URL

# 4) 复扫并留痕（输出只含掩码，可安全归档）
npm run audit:secrets
```

**"删掉那一行"不算处置**：一旦明文进入过聊天/工单/截图/提交历史，就应视为已泄露。
换掉密钥的成本远低于事后补救。
