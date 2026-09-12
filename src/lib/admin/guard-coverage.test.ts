import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 「忘记加守卫」的回归防线。
 *
 * 显式守卫（而不是 middleware）的代价就是可能漏加。这个测试静态扫描
 * `src/app/api/admin/**\/route.ts`：
 *  - 白名单（故意不需要登录的端点）之外的每个 route 文件都必须调用
 *    `guardAdminApi(`；
 *  - 白名单本身也被断言，防止有人为了让测试通过而把新端点塞进白名单。
 *
 * 它只能证明「调用了守卫」，不能证明「守卫写对了」——后者由 e2e 的
 * 真实 401 断言覆盖。两者互补：静态查漏、动态查错。
 */

const ADMIN_API_DIR = resolve(process.cwd(), "src", "app", "api", "admin");

/**
 * 故意不要求登录的三个端点：
 *  - login：登录本身当然不能要求已登录；
 *  - logout：幂等且无副作用（只清 cookie），要求登录反而会让会话过期后无法登出；
 *  - session：返回 `{ authenticated: false }` 的状态探针，用于登录页判断是否已登录，
 *    本身不泄露任何数据。
 */
const PUBLIC_ROUTES = ["login", "logout", "session"];

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...findRouteFiles(full));
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

describe("管理端 API 守卫覆盖", () => {
  const files = findRouteFiles(ADMIN_API_DIR);

  it("至少存在 stats 与 export 两个受保护端点", () => {
    const names = files.map((f) => f.replace(/\\/g, "/"));
    expect(names.some((n) => n.includes("/api/admin/stats/"))).toBe(true);
    expect(names.some((n) => n.includes("/api/admin/export/"))).toBe(true);
  });

  it("白名单恰好是 login / logout / session（新增公开端点必须显式改这里）", () => {
    const publicDirs = files
      .map((f) => f.replace(/\\/g, "/"))
      .map((f) => f.split("/api/admin/")[1]!.split("/")[0]!)
      .filter((seg) => PUBLIC_ROUTES.includes(seg));

    expect([...new Set(publicDirs)].sort()).toEqual([...PUBLIC_ROUTES].sort());
  });

  it("白名单之外的每个 route 都必须调用 guardAdminApi", () => {
    const missing: string[] = [];
    for (const file of files) {
      const rel = file.replace(/\\/g, "/").split("/api/admin/")[1]!.split("/")[0]!;
      if (PUBLIC_ROUTES.includes(rel)) continue;
      const source = readFileSync(file, "utf-8");
      if (!source.includes("guardAdminApi(")) missing.push(rel);
    }
    expect(missing).toEqual([]);
  });

  it("没有任何 route 直接复用 guard 内部的 unauthorizedResponse 绕过会话校验", () => {
    // 允许 import guardAdminApi；但直接 import unauthorizedResponse 通常意味着
    // 手写了一套判断，容易写错。这里只做提醒式断言，防止悄悄绕过统一入口。
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.replace(/\\/g, "/").split("/api/admin/")[1]!.split("/")[0]!;
      if (PUBLIC_ROUTES.includes(rel)) continue;
      const source = readFileSync(file, "utf-8");
      if (source.includes("unauthorizedResponse(")) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
