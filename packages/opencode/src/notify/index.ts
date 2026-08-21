/**
 * momo notify — desktop notifications for long-running work.
 *
 * Borrowed ideas from the dsh-sound / dsh-notify / dsh-notifier trio:
 *   - dsh-sound      → distinct tones per event kind (complete / error /
 *                      approval / info)
 *   - dsh-notify     → native OS notifications (Windows toast, macOS
 *                      notification center, Linux notify-send)
 *   - dsh-notifier   → one guarded entry point with per-kind cooldown and
 *                      an append-only event log for audit/replay
 *
 * Zero dependencies (spawns the OS-native tool), never throws, and every
 * call is fire-and-forget so a slow notifier can never stall the daemon.
 *
 * Env rails:
 *   MOMO_NOTIFY            "0"/"false" disables everything (default on)
 *   MOMO_NOTIFY_SOUND      "0"/"false" disables tones (default on)
 *   MOMO_NOTIFY_SYSTEM     "0"/"false" disables OS notifications (default on)
 *   MOMO_NOTIFY_COOLDOWN_MS  min gap between same-kind notifications (10s)
 *
 * @module notify
 */

import * as fs from "fs"
import * as path from "path"
import { spawn } from "child_process"
import { getMomoHome } from "../session/recorder.js"

// ---------------------------------------------------------------------------
// Types & config
// ---------------------------------------------------------------------------

export type NotifyKind = "complete" | "error" | "approval" | "info"

const KIND_LABEL: Record<NotifyKind, string> = {
  complete: "完成",
  error: "失败",
  approval: "审批",
  info: "通知",
}

function envFlag(name: string, def: boolean): boolean {
  const v = process.env[name]
  if (v === undefined) return def
  return v !== "0" && v !== "false"
}

export function notifyEnabled(): boolean {
  return envFlag("MOMO_NOTIFY", true)
}

export function soundEnabled(): boolean {
  return notifyEnabled() && envFlag("MOMO_NOTIFY_SOUND", true)
}

export function systemEnabled(): boolean {
  return notifyEnabled() && envFlag("MOMO_NOTIFY_SYSTEM", true)
}

// ---------------------------------------------------------------------------
// Sounds (distinct per kind — dsh-sound)
// ---------------------------------------------------------------------------

const SOUNDS: Record<NotifyKind, Array<[freq: number, ms: number]>> = {
  complete: [
    [523, 160],
    [784, 220],
  ],
  error: [
    [220, 260],
    [180, 340],
  ],
  approval: [
    [659, 130],
    [784, 130],
    [988, 200],
  ],
  info: [[440, 160]],
}

function playWindows(freq: number, ms: number): void {
  spawn(
    "powershell",
    [
      "-NoProfile",
      "-WindowStyle",
      "Hidden",
      "-Command",
      `[console]::beep(${freq},${ms})`,
    ],
    { detached: true, stdio: "ignore" },
  ).unref()
}

function playDarwin(freq: number, _ms: number): void {
  // macOS beep count conveys the pattern; freq is ignored.
  spawn("osascript", ["-e", "beep " + Math.max(1, Math.min(3, Math.round(freq / 300)))], {
    detached: true,
    stdio: "ignore",
  }).unref()
}

function playLinux(freq: number, _ms: number): void {
  // Best-effort terminal bell; no external dependency.
  try {
    process.stdout.write("\x07")
  } catch {
    // headless — nothing to ring
  }
}

export function playSound(kind: NotifyKind): void {
  if (!soundEnabled()) return
  try {
    const seq = SOUNDS[kind] ?? SOUNDS.info
    for (const [freq, ms] of seq) {
      if (process.platform === "win32") playWindows(freq, ms)
      else if (process.platform === "darwin") playDarwin(freq, ms)
      else playLinux(freq, ms)
    }
  } catch {
    // never throw from a notifier
  }
}

// ---------------------------------------------------------------------------
// OS notifications (dsh-notify)
// ---------------------------------------------------------------------------

function sanitize(s: string): string {
  return String(s ?? "")
    .replace(/["\\]/g, "")
    .slice(0, 120)
    .trim()
}

function notifyWindows(title: string, body: string): void {
  const script = [
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
    "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null",
    "$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)",
    "$textNodes = $template.GetElementsByTagName('text')",
    "$titleB64 = '" + Buffer.from(title, "utf8").toString("base64") + "'",
    "$bodyB64 = '" + Buffer.from(body, "utf8").toString("base64") + "'",
    "$textNodes.Item(0).AppendChild($template.CreateTextNode([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($titleB64)))) | Out-Null",
    "$textNodes.Item(1).AppendChild($template.CreateTextNode([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($bodyB64)))) | Out-Null",
    "$toast = New-Object Windows.UI.Notifications.ToastNotification $template",
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('momo').Show($toast)",
  ].join("; ")
  spawn("powershell", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", script], {
    detached: true,
    stdio: "ignore",
  }).unref()
}

function notifyDarwin(title: string, body: string): void {
  const safeTitle = sanitize(title).replace(/"/g, "\\\"")
  const safeBody = sanitize(body).replace(/"/g, "\\\"")
  spawn(
    "osascript",
    ["-e", `display notification "${safeBody}" with title "${safeTitle}" sound name "Glass"`],
    { detached: true, stdio: "ignore" },
  ).unref()
}

function notifyLinux(title: string, body: string): void {
  const safeTitle = sanitize(title).replace(/"/g, "")
  const safeBody = sanitize(body).replace(/"/g, "")
  spawn("notify-send", [safeTitle, safeBody], { detached: true, stdio: "ignore" }).unref()
}

export function notifySystem(title: string, body: string): void {
  if (!systemEnabled()) return
  try {
    if (process.platform === "win32") notifyWindows(title, body)
    else if (process.platform === "darwin") notifyDarwin(title, body)
    else notifyLinux(title, body)
  } catch {
    // never throw from a notifier
  }
}

// ---------------------------------------------------------------------------
// Unified entry (dsh-notifier) + event log
// ---------------------------------------------------------------------------

const lastAt = new Map<NotifyKind, number>()

function cooldownMs(): number {
  return Number(process.env.MOMO_NOTIFY_COOLDOWN_MS) || 10_000
}

function appendLog(kind: NotifyKind, title: string, body: string): void {
  try {
    const file = path.join(getMomoHome(), "notifications.jsonl")
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(
      file,
      JSON.stringify({
        ts: new Date().toISOString(),
        kind,
        title: String(title ?? "").slice(0, 200),
        body: String(body ?? "").slice(0, 500),
      }) + "\n",
      "utf-8",
    )
  } catch {
    // logging is best-effort
  }
}

/**
 * Fire a notification (tone + OS toast + audit log) with a per-kind
 * cooldown so a busy daemon cannot spam the desktop. Never throws.
 */
export function notify(kind: NotifyKind, title: string, body: string): void {
  if (!notifyEnabled()) return
  const now = Date.now()
  const prev = lastAt.get(kind) ?? 0
  if (now - prev < cooldownMs()) return
  lastAt.set(kind, now)

  const label = KIND_LABEL[kind] ?? kind
  const fullTitle = `momo ${label} · ${title}`
  playSound(kind)
  notifySystem(fullTitle, body)
  appendLog(kind, fullTitle, body)
}
