/**
 * 统计基础函数 —— 纯函数、无副作用、无外部依赖，便于单元测试。
 *
 * 设计取舍：所有方差一律使用 **样本方差（除以 n-1）**，与
 * `docs/assessment-framework.md` 第 4 节「数值稳定性」一致。
 * 维度分本身用均值（不涉及方差），方差只用于信度 α 与相关分析。
 *
 * 为什么不用第三方统计库：本项目的 α / r 均为教科书公式，自己实现
 * 可保证「可读、可测、可解释」，也避免为一个公式引入整个依赖树。
 */

export function sum(xs: number[]): number {
  let acc = 0;
  for (const x of xs) acc += x;
  return acc;
}

/** 算术平均。空数组返回 NaN（而非 0），避免把「无数据」误当成 0 分。 */
export function mean(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  return sum(xs) / xs.length;
}

/** 样本方差（n-1）。n < 2 时方差未定义，返回 NaN。 */
export function sampleVariance(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return Number.NaN;
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) acc += (x - m) ** 2;
  return acc / (n - 1);
}

export function sampleStdDev(xs: number[]): number {
  return Math.sqrt(sampleVariance(xs));
}

/** 保留 d 位小数（四舍五入），仅用于展示层；引擎内部保持全精度。 */
export function round(x: number, d = 3): number {
  if (!Number.isFinite(x)) return x;
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

// ---------------------------------------------------------------------------
// t 分布 / 不完全 Beta：用于 Pearson r 的双尾 p 值
// 采用 Lanczos 近似 + Numerical Recipes 的连分式 betacf（标准实现）。
// ---------------------------------------------------------------------------

const LANCZOS_G = 7;
const LANCZOS_COEF = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** log Γ(z)，Lanczos 近似。 */
export function logGamma(z: number): number {
  if (z < 0.5) {
    // 反射公式：Γ(z)Γ(1-z) = π / sin(πz)
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  let x = LANCZOS_COEF[0];
  const zz = z - 1;
  for (let i = 1; i < LANCZOS_G + 2; i++) {
    x += LANCZOS_COEF[i] / (zz + i);
  }
  const t = zz + LANCZOS_G + 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x)
  );
}

/** 不完全 Beta 连分式（Lentz 算法），供正则化不完全 Beta 使用。 */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 300;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;

  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** 正则化不完全 Beta 函数 I_x(a, b) ∈ [0, 1]。 */
export function regularizedIncompleteBeta(
  a: number,
  b: number,
  x: number
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** 学生 t 分布累积分布函数 P(T ≤ t)。 */
export function studentTCdf(t: number, df: number): number {
  if (!(df > 0)) return Number.NaN;
  if (t === 0) return 0.5;
  const x = df / (df + t * t);
  const ib = regularizedIncompleteBeta(df / 2, 0.5, x);
  return t > 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

/**
 * Pearson 积矩相关。两序列按索引配对，调用方须先做缺失值剔除。
 * n < 3 或任一序列零方差 → 返回 null（相关在此情形下无定义）。
 */
export function pearsonR(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * Pearson r 的双尾 p 值（H0: ρ = 0）。
 * t = |r| · √(df / (1 - r²))，df = n - 2，双尾 p = 2 · (1 - F_t(t))。
 * 样本很小时 p 极不稳定，调用方必须同时展示 n，不得单独解读显著性。
 */
export function pearsonPValue(r: number | null, n: number): number | null {
  if (r === null || !Number.isFinite(r) || n < 3) return null;
  const rr = Math.min(1, Math.abs(r));
  if (rr >= 1) return 0;
  const df = n - 2;
  const t = rr * Math.sqrt(df / (1 - rr * rr));
  const p = 2 * (1 - studentTCdf(t, df));
  return Math.min(1, Math.max(0, p));
}
