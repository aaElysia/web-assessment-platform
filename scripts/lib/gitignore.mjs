/**
 * .gitignore 覆盖判定的极简实现（供 gen-secrets / audit-secrets 共用）。
 *
 * 为什么不直接用 `git check-ignore`：本项目在部分工作区里并没有 .git 目录
 * （脚本要能在任意检出目录下运行），因此这里退化为「按模式字面匹配」。
 * 它**不追求完整实现 gitignore 语法**，只覆盖本项目实际用到的几类模式：
 *   - 精确文件名           .env
 *   - 前缀通配             .env*
 *   - 后缀通配             *.pem / *.key
 *   - 目录名（含尾部斜杠）  node_modules/
 * 语义保守：判断不出来时返回 false（宁可报「未被忽略」也不要漏报）。
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** 读取 .gitignore 里的有效模式（去掉注释与空行）。 */
export function readIgnorePatterns(root) {
  const p = resolve(root, ".gitignore");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("!"));
}

/** 单个模式是否覆盖某个「仓库相对路径」。 */
function patternMatches(pattern, relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  const name = normalized.split("/").pop() ?? normalized;

  // 目录模式：匹配路径中任意一层目录名
  if (pattern.endsWith("/")) {
    const dir = pattern.slice(0, -1);
    return normalized === dir || normalized.startsWith(dir + "/") || normalized.includes("/" + dir + "/");
  }
  // 前缀通配：.env*
  if (pattern.endsWith("*") && !pattern.slice(0, -1).includes("*")) {
    return name.startsWith(pattern.slice(0, -1));
  }
  // 后缀通配：*.pem
  if (pattern.startsWith("*.") && !pattern.slice(2).includes("*")) {
    return name.endsWith(pattern.slice(1));
  }
  // 精确匹配：同目录文件名，或与相对路径完全相同
  return name === pattern || normalized === pattern;
}

/** 仓库相对路径是否被 .gitignore 覆盖。 */
export function isIgnored(root, relPath) {
  const patterns = readIgnorePatterns(root);
  return patterns.some((p) => patternMatches(p, relPath));
}
