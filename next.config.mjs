// Windows G: 盘 readlink bug 的修复通过 readlink-polyfill.cjs + NODE_OPTIONS
// (见 package.json 的 dev/build/start 脚本) 在全局注入，本文件其余部分负责
// 部署期的安全响应头。
// 相关背景：G: 盘上 Node 的 fs.readlink 对普通文件误报 EISDIR，webpack 因此崩溃；
// polyfill 把 EISDIR 转译为 EINVAL（"非符号链接"），对本项目安全。

const isProd = process.env.NODE_ENV === "production";

/**
 * 内容安全策略（CSP）。
 *
 * 取值依据（逐项说明为什么需要，而不是抄模板）：
 *  - `script-src 'self' 'unsafe-inline'`：Next.js App Router 会在 HTML 里内联注入
 *    hydration 数据与启动脚本（`self.__next_f.push(...)`）。要收掉 'unsafe-inline'
 *    必须为每次请求生成 nonce 并贯穿所有内联脚本，属于更大的改造；在「同源可信 +
 *    无可注入内容的输入点 + 输出全部转义」的前提下先以 'unsafe-inline' 换取可用性，
 *    并记为待收紧项（见 CONTINUATION.md §11）。
 *  - 开发模式额外放 `'unsafe-eval'`：Next dev 的 HMR 需要 eval；生产不放。
 *  - `style-src 'unsafe-inline'`：Tailwind 输出外部 CSS，但 Recharts 等库会给元素写
 *    style 属性，而 style 属性受 style-src 管辖，因此需要 'unsafe-inline'。
 *  - `connect-src 'self'`：应用只访问自己的 /api；不接任何第三方分析/埋点，
 *    与「匿名测评」的定位一致。
 *  - `frame-ancestors 'none'` / `object-src 'none'` / `base-uri 'self'` /
 *    `form-action 'self'`：防点击劫持、插件、<base> 与表单被篡改后外发。
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

/** 全站通用安全响应头。 */
const baseHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

// HSTS 只在生产追加：它要求浏览器在有效期内强制走 HTTPS。本地 http 预览时浏览器
// 本就忽略该头，但为避免在自签名 https 的本地环境里把自己锁死，这里明确只在生产开启。
if (isProd) {
  baseHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 不暴露 X-Powered-By: Next.js，减少无谓的技术指纹。
  poweredByHeader: false,
  // Prisma + Vercel 关键配置：把 @prisma/client 标记为「外部包」，
  // 让 Next 不打包它、而是把引擎二进制（.prisma/client 下的 .so）原样随函数一起上传，
  // 否则部署后运行期会报 "Cannot find Prisma Query Engine"。
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
  },
  // 第一步先关闭 build 期 ESLint 阻塞，避免交互式配置；ESLint 将在后续步骤补配。
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // 关闭符号链接解析，减少 readlink 调用面（与 polyfill 配合）。
    config.resolve.symlinks = false;
    // 使用内存缓存，避免文件系统快照层触发 readlink。
    config.cache = { type: "memory" };
    return config;
  },
  async headers() {
    return [
      { source: "/:path*", headers: baseHeaders },
      // 管理端与接口不被搜索引擎收录（顺带降低被扫到的概率）。
      // noindex ≠ 访问控制：真正的防线仍是强凭据 + 签名会话 + 部署自检。
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
    ];
  },
};

export default nextConfig;
