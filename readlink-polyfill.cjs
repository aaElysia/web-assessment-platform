// readlink-polyfill.cjs
// Windows 某些卷（本机 G: 盘）上，Node 的 fs.readlink* 对普通文件会抛 EISDIR
// （正常应抛 EINVAL 表示"非符号链接"）。webpack 的 enhanced-resolve 依赖 EINVAL
// 判定"非符号链接"，遇 EISDIR 直接崩溃。
// 通过 NODE_OPTIONS=--require 在所有 Node 进程/worker 启动前注入本补丁，把
// EISDIR 转译为 EINVAL，语义与 resolve.symlinks=false 一致，对本项目安全。
"use strict";

function makeError(path) {
  const e = new Error("EINVAL: invalid argument, readlink '" + path + "'");
  e.code = "EINVAL";
  e.errno = -22;
  return e;
}

function patch(fsModule) {
  if (!fsModule) return;

  const origSync = fsModule.readlinkSync.bind(fsModule);
  fsModule.readlinkSync = function (p, o) {
    try {
      return origSync(p, o);
    } catch (e) {
      if (e && e.code === "EISDIR") throw makeError(p);
      throw e;
    }
  };

  const origAsync = fsModule.readlink.bind(fsModule);
  fsModule.readlink = function (p, o, cb) {
    if (typeof o === "function") {
      cb = o;
      o = undefined;
    }
    origAsync(p, o, (e, ls) => {
      if (e && e.code === "EISDIR") return cb(makeError(p));
      cb(e, ls);
    });
  };

  if (fsModule.promises && typeof fsModule.promises.readlink === "function") {
    const origP = fsModule.promises.readlink.bind(fsModule.promises);
    fsModule.promises.readlink = async function (p, o) {
      try {
        return await origP(p, o);
      } catch (e) {
        if (e && e.code === "EISDIR") throw makeError(p);
        throw e;
      }
    };
  }
}

// 仅在本机 Windows 的异常卷（如 G: 盘）上注入补丁；Linux/macOS 上没有该 readlink bug，
// 保持原生 fs 行为最安全（避免改变 webpack 对目录 readlink 的正常判定）。
if (process.platform === "win32") {
  patch(require("fs"));
}
