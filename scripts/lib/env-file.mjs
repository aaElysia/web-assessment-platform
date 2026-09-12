/**
 * 极简 .env 解析（供 check-prod-env.mts / audit-secrets.mjs 共用）。
 *
 * 支持：KEY=VALUE、`export KEY=VALUE`、单/双引号包裹、行内 ` # 注释`、CRLF、
 * 空行与 `#` 开头的整行注释。
 *
 * **不执行任何内容**：只做字符串解析，绝不用 eval —— .env 文件在概念上属于
 * 半可信输入（可能来自别人给的一份配置），解析器本身不该成为执行入口。
 */

/** @param {string} text @returns {Record<string, string>} */
export function parseEnvFile(text) {
  const out = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;

    const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
    if (!key) continue;

    let value = line.slice(eq + 1).trim();
    const quoted =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")));
    if (quoted) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

/** 只取出白名单键（避免把无关变量带进判定逻辑）。 */
export function pickEnvKeys(env, keys) {
  const out = {};
  for (const k of keys) {
    if (env[k] !== undefined) out[k] = env[k];
  }
  return out;
}
