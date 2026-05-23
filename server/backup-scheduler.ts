/**
 * In-process backup scheduler.
 *
 * Runs the R2 backup script nightly at 03:00 America/Chicago.
 * Lives in the web service process so it has access to the same
 * persistent disk as the live database.
 *
 * Disabled unless R2 env vars are set.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const TZ = "America/Chicago";
const HOUR = 3; // 03:00 local
const MIN = 15;

function msUntilNext(): number {
  // Compute next 03:15 America/Chicago in UTC
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const localY = Number(parts.year);
  const localM = Number(parts.month);
  const localD = Number(parts.day);
  const localH = Number(parts.hour);
  const localMin = Number(parts.minute);

  // Decide whether target is today or tomorrow (local time)
  let targetD = localD;
  let targetM = localM;
  let targetY = localY;
  if (localH > HOUR || (localH === HOUR && localMin >= MIN)) {
    const tomorrow = new Date(Date.UTC(localY, localM - 1, localD + 1));
    targetY = tomorrow.getUTCFullYear();
    targetM = tomorrow.getUTCMonth() + 1;
    targetD = tomorrow.getUTCDate();
  }

  // Find UTC instant that renders as targetY-targetM-targetD HOUR:MIN in TZ.
  // Approximate by trying both possible offsets (DST safe enough for hourly granularity).
  // Start from an estimate at UTC offset -5 (CDT) and adjust.
  for (let guessOffsetHours = -4; guessOffsetHours >= -7; guessOffsetHours--) {
    const guessUtc = Date.UTC(targetY, targetM - 1, targetD, HOUR - guessOffsetHours, MIN, 0);
    const check = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(guessUtc));
    const cp = Object.fromEntries(check.map((p) => [p.type, p.value]));
    if (
      Number(cp.year) === targetY &&
      Number(cp.month) === targetM &&
      Number(cp.day) === targetD &&
      Number(cp.hour) === HOUR &&
      Number(cp.minute) === MIN
    ) {
      return Math.max(1000, guessUtc - now.getTime());
    }
  }
  // Fallback: 24h
  return 24 * 60 * 60 * 1000;
}

function runBackup(): Promise<void> {
  return new Promise((resolve) => {
    const script = join(process.cwd(), "scripts", "backup-to-r2.mjs");
    if (!existsSync(script)) {
      console.warn("[backup-scheduler] script missing at", script);
      return resolve();
    }
    console.log("[backup-scheduler] starting backup run");
    const child = spawn("node", [script], { stdio: "inherit", env: process.env });
    child.on("exit", (code) => {
      if (code === 0) console.log("[backup-scheduler] backup ok");
      else console.error(`[backup-scheduler] backup exited with code ${code}`);
      resolve();
    });
    child.on("error", (err) => {
      console.error("[backup-scheduler] spawn error:", err);
      resolve();
    });
  });
}

let timer: NodeJS.Timeout | null = null;
let running = false;

function schedule() {
  if (timer) clearTimeout(timer);
  const ms = msUntilNext();
  const eta = new Date(Date.now() + ms);
  console.log(`[backup-scheduler] next backup at ${eta.toISOString()} (in ${(ms / 1000 / 60).toFixed(1)} min)`);
  timer = setTimeout(async () => {
    if (running) {
      schedule();
      return;
    }
    running = true;
    try {
      await runBackup();
    } finally {
      running = false;
      schedule();
    }
  }, ms);
}

export function startBackupScheduler() {
  if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_ACCOUNT_ID) {
    console.log("[backup-scheduler] R2 env not configured, scheduler disabled");
    return;
  }
  schedule();
}

// Allow triggering on demand from a route
export async function runBackupNow(): Promise<{ ok: boolean; message: string }> {
  if (running) return { ok: false, message: "backup already running" };
  if (!process.env.R2_ACCESS_KEY_ID) return { ok: false, message: "R2 env not configured" };
  running = true;
  try {
    await runBackup();
    return { ok: true, message: "backup complete (check logs for details)" };
  } finally {
    running = false;
  }
}
