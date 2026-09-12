# 部署到 Vercel + Neon（完全独立，不依赖 WorkBuddy）

本指南让你把项目上线为**完全独立**的服务：代码、服务器、数据库、域名都在你自己的账号下，
与 WorkBuddy 零绑定、零回传。你只需做约 10 分钟的手动配置（创建 Neon 库、在 Vercel 粘贴 5 个环境变量、点 Deploy）。

> 代码侧的所有部署准备工作（Prisma Postgres 适配、Vercel 构建脚本、生产安全自检、密钥生成）已在本仓库完成并通过验证。

---

## 你只需要做这些

### 0. 前置（已为你完成）
- 项目已在 `G:\web-assessment-platform` 用 `git init` 提交为一个 Git 仓库。
- 你需要把它推到**你自己的** GitHub / GitLab / Bitbucket 仓库（见第 2 步）。
- `.secrets/`、`*.db`、`.env` 已被 `.gitignore` 忽略，**绝不会**进入任何远程仓库。

### 1. 创建 Neon 数据库（免费）
1. 注册并登录 https://neon.tech → **New Project**。
2. 进入项目 → **Connection Details** → 复制 **Pooled** 连接串，形如：
   `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`
3. **务必保留结尾的 `?sslmode=require`**（生产自检会拒绝没有它的连接）。

### 2. 把仓库推到你的 GitHub
```bash
git remote add origin <你的仓库 URL>
git push -u origin main      # 实际分支名可能是 master，按 git branch 显示为准
```
> 推送前可用 `git status` 确认没有 `.secrets/`、`.env`、`dev.db`、`node_modules` 被跟踪。

### 3. 在 Vercel 导入
1. 登录 https://vercel.com → **Add New → Project** → 导入第 2 步的仓库。
2. Framework 会自动识别为 **Next.js**，无需改动。
3. **Build Command 留空即可** —— Vercel 会自动使用仓库里的 `vercel-build` 脚本，它会依次：
   派生 Postgres schema → 生成 Prisma Client（含 Vercel 引擎）→ 跑生产安全自检 → `next build`。
4. **Node.js Version** 选 `20.x` 或 `22.x`（仓库 `engines` 要求 `>=20.11`）。

### 4. 配置环境变量（最关键的一步）
在 Vercel → **Settings → Environment Variables**，添加以下 4 项，**同时勾选 Production / Preview / Development 三个环境**：

| 变量名 | 取值 |
| --- | --- |
| `DATABASE_URL` | 第 1 步复制的 Neon **Pooled** 连接串 |
| `ADMIN_USERNAME` | 取自本机 `.secrets/production.env` |
| `ADMIN_PASSWORD` | 取自本机 `.secrets/production.env` |
| `ADMIN_SESSION_SECRET` | 取自本机 `.secrets/production.env` |

- **不要**设置 `ALLOW_INSECURE_DEFAULTS`（那是本地预览用的逃生舱，线上绝不能开）。
- **不要**把这几个变量点成 **Sensitive**：Vercel 的 Sensitive 变量在「构建期」不可见，
  会导致构建期的生产安全自检读不到它们而直接失败。保持默认（非 Sensitive）即可，
  应用本身在运行期仍会用自己的部署自检保护管理端（无论变量是否 Sensitive）。
- `.secrets/production.env` 在你本机、已被 git 忽略，里面 3 个值是强随机且与线上一致。直接打开该文件复制即可；想校验可运行 `npm run check:prod-env`（它只打印变量名与 SHA-256 前 8 位指纹，绝不打印明文）。

### 5. Deploy
- 回到 Vercel 项目页 → **Deploy**。
- 构建会跑生产安全自检：**任何必需变量缺失 / 仍是占位值 / 仍是本地 SQLite，构建直接失败**，拒绝带病上线。
- 成功后 Vercel 给出公开网址：`https://<你的项目>.vercel.app`。

---

## 数据库建表 + 种子（首次部署后必做，否则提交作答会失败）

公开网址上的测评**能正常显示题目**（题目来自打包的 `data/question-bank.json`），但**提交作答时会查询数据库 Item 表**，
所以必须先建表并把量表/题目写进去，否则提交会返回 400。

在本机执行（一次性）：

> ⚠️ **建表必须用 Neon 的「Direct（非 pooler）直连串」**（端口 5432，连接串里**不含** `-pooler` / `6543`）。
> 池化串（Pooled，端口 6543）走 pgbouncer 事务池，`db push` 建表会卡住或报错；池化串只留给 **Vercel 运行时**的 `DATABASE_URL`。

```bash
DATABASE_URL="<Neon 直连串，Connection Details 里选 Direct，保留 ?sslmode=require>" npm run db:postgres:provision
npm run db:generate      # 把本机 Prisma Client 切回 SQLite（不影响已部署的 Vercel）
```
`provision` 会依次：派生 Postgres schema → 生成 Client → `db push` 建表 → 写入量表与题目（来自 `data/question-bank.json`）。

> 若把池化串误用于建表，脚本会打印 ⚠️ 警告；此时换直连串重跑即可。

---

## 验证上线是否成功
- 打开公开网址 → `/consent` → `/assessment` → 答完 → `/result` 能看到报告。
- 管理端 `/admin`：用 `.secrets/production.env` 里的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 登录。
- 构建日志会打印 3 个凭据的 **SHA-256 前 8 位指纹**，用于核对线上跑的是哪一份密钥（值本身不会泄露）。

---

## 已内置的安全保障（无需你操作）
- **生产自检双重拦截**：构建期 + 运行期（运行期管理端未通过自检直接返回 503）。
  DATABASE_URL 必须是真实 Postgres、不能是 `file:` 本地库、不能是 `NEON_*` / `changeme` 等占位值；弱口令/默认口令被拒绝。
- **凭据零入库**：全部强随机、存放在被 git 忽略的 `.secrets/`，绝不进入仓库或构建日志明文。
- **建议**：把 GitHub 仓库设为 **Private**。

---

## 成本
- Vercel Hobby + Neon Free = **¥0 / 月**。
- 无 AI 推理费（评分在本地/函数内计算，无外部模型调用）。
- 可选：自定义域名约 ¥80–110 / 年；Vercel Pro $20 / 月（非必需，应用层已有强口令 + 速率限制 + 部署自检）。

---

## 回滚 / 迁移
代码、服务器、数据库、域名全部在你自己的账号下，与 WorkBuddy 没有任何运行时绑定。
随时可以把仓库推到别处、把数据库迁到别的 Postgres 提供商、或把域名解析走 —— 没有任何锁定。
