# 停止本机残留的 Next.js dev / start 服务器（Windows）。
#
# 为什么需要它：开发时经常用后台方式启动 `npm run dev`，一旦终端被关闭或
# 进程被"孤儿化"，监听端口的 node 进程会继续存活，表现为
#   - 端口被占、新实例自动顺延到 3001/3002…
#   - 旧实例引用已被重建的 .next，访问页面返回 500
#   - 反复预览后累积多个服务器，难以定位
#
# 用法：
#   npm run dev:stop              # 结束本机占用下列端口的所有 node 进程
#   powershell -File scripts/stop-dev.ps1 -DryRun   # 只列出将要结束的进程，不动手
#
# 安全边界：
#   - 只结束「正在监听下列端口」且**进程名为 node** 的进程；
#   - 不做任何文件删除；
#   - 端口范围仅覆盖本项目常用区间，不影响其它应用。
#
# 可靠性说明（踩过的坑）：
#   初版只用 `Get-NetTCPConnection` 探测。该 cmdlet 在某些受限环境（沙箱、
#   非交互会话）下会**静默返回空**，于是脚本打印「没有发现被占用的端口」并
#   正常退出 —— 用户以为清理过了，实际一个进程都没杀。
#   因此现在改为双通道探测：netstat（纯 exe，最稳）+ Get-NetTCPConnection
#   （补充），两者取并集；若两条通道都不可用则**显式报警**并以非 0 退出。

param(
  [switch]$DryRun
)

$ErrorActionPreference = "SilentlyContinue"

# 端口区间：Next 默认端口、自动顺延，以及历史预览用过的高位端口。
$ports = @()
$ports += 3000..3010
$ports += 3200..3210
$ports += 3300..3310
$ports += 3400..3410
$ports += 3500..3510
$ports += 3600..3610

# --- 探测通道 1：netstat（纯可执行文件，不依赖 PowerShell cmdlet）--------
function Get-ListenersViaNetstat {
  $rows = @()
  $raw = & netstat -ano 2>$null
  if (-not $raw) { return $null }
  if ($LASTEXITCODE -ne 0) { return $null }

  foreach ($line in $raw) {
    if ($line -notmatch 'LISTENING') { continue }
    $parts = @($line -split '\s+' | Where-Object { $_ -ne '' })
    if ($parts.Count -lt 5) { continue }
    $m = [regex]::Match($parts[1], ':(\d+)$')
    if (-not $m.Success) { continue }
    $port = [int]$m.Groups[1].Value
    if ($ports -notcontains $port) { continue }
    $rows += [pscustomobject]@{ Port = $port; ProcessId = [int]$parts[-1]; Source = 'netstat' }
  }
  return $rows
}

# --- 探测通道 2：Get-NetTCPConnection（可用时作为补充）--------------------
function Get-ListenersViaCmdlet {
  try {
    $conns = Get-NetTCPConnection -State Listen -ErrorAction Stop
  } catch {
    return $null
  }
  if (-not $conns) { return @() }
  $rows = @()
  foreach ($c in $conns) {
    if ($ports -notcontains $c.LocalPort) { continue }
    $rows += [pscustomobject]@{ Port = $c.LocalPort; ProcessId = [int]$c.OwningProcess; Source = 'cmdlet' }
  }
  return $rows
}

$viaNetstat = Get-ListenersViaNetstat
$viaCmdlet = Get-ListenersViaCmdlet

if ($null -eq $viaNetstat -and $null -eq $viaCmdlet) {
  Write-Host "[错误] 无法探测端口占用：netstat 与 Get-NetTCPConnection 都不可用或均返回空。" -ForegroundColor Red
  Write-Host "       常见原因：受限 / 沙箱化的会话屏蔽了网络信息查询，或系统缺少 netstat。" -ForegroundColor Red
  Write-Host "       为避免误报「已清理」，脚本**没有**执行任何操作。" -ForegroundColor Red
  Write-Host "       请在本机普通终端重试，或手动查看：" -ForegroundColor Red
  Write-Host "         netstat -ano | findstr LISTENING" -ForegroundColor Red
  exit 3
}

$listeners = @($viaNetstat) + @($viaCmdlet) | Where-Object { $_ -ne $null }
# 按 PID 去重；同一 PID 记录它占用的全部端口。
$byPid = @{}
foreach ($row in $listeners) {
  if (-not $byPid.ContainsKey($row.ProcessId)) {
    $byPid[$row.ProcessId] = @()
  }
  if ($byPid[$row.ProcessId] -notcontains $row.Port) {
    $byPid[$row.ProcessId] += $row.Port
  }
}

if ($byPid.Count -eq 0) {
  $src = @()
  if ($null -ne $viaNetstat) { $src += 'netstat' }
  if ($null -ne $viaCmdlet) { $src += 'Get-NetTCPConnection' }
  Write-Host "没有发现被占用的开发端口（3000-3010 / 3200-3610）。已用探测通道: $($src -join ', ')"
  exit 0
}

$killed = 0
$skipped = @()
foreach ($procId in ($byPid.Keys | Sort-Object)) {
  $proc = Get-Process -Id $procId
  $portList = ($byPid[$procId] | Sort-Object) -join ","

  if (-not $proc) {
    Write-Host "PID $procId 已不存在（端口 $portList），跳过。"
    continue
  }
  if ($proc.ProcessName -ne 'node') {
    # 安全边界：只动 node，绝不误杀其它应用。
    $skipped += "PID $procId ($($proc.ProcessName)) 占用端口 $portList"
    continue
  }

  if ($DryRun) {
    Write-Host "[DryRun] 将结束 PID $procId (node)，占用端口: $portList"
    $killed++
    continue
  }

  Stop-Process -Id $procId -Force
  Write-Host "已结束 PID $procId (node)，释放端口: $portList"
  $killed++
}

if ($skipped.Count -gt 0) {
  Write-Host ""
  Write-Host "以下端口被**非 node** 进程占用，出于安全未做处理：" -ForegroundColor Yellow
  foreach ($s in $skipped) { Write-Host "  $s" -ForegroundColor Yellow }
}

if ($DryRun) {
  Write-Host ""
  Write-Host "[DryRun] 未实际结束任何进程。去掉 -DryRun 后执行清理。"
  exit 0
}

Start-Sleep -Seconds 1

Write-Host ""
Write-Host "共结束 $killed 个进程。常用端口当前状态："
$stillBusy = 0
foreach ($port in @(3000, 3001, 3002, 3200, 3300, 3400, 3500, 3600)) {
  $left = @(Get-ListenersViaNetstat) + @(Get-ListenersViaCmdlet) |
    Where-Object { $_ -ne $null -and $_.Port -eq $port }
  if ($left.Count -gt 0) {
    Write-Host "  $port : 仍被占用 (PID $((($left | Select-Object -ExpandProperty ProcessId) | Sort-Object -Unique) -join ','))"
    $stillBusy++
  } else {
    Write-Host "  $port : 空闲"
  }
}

if ($stillBusy -gt 0) {
  Write-Host ""
  Write-Host "仍有端口被占用，请稍后重试或手动检查上述 PID。" -ForegroundColor Yellow
  exit 1
}
