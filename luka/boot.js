// ════════════════════════════════════════════════════════════════════════════
//  BOOT — auto-detects available memory on whatever host this runs on
//  (Heroku, Railway, Render, a VPS panel, bare metal, Docker, anywhere) and
//  launches index.js with a safe --max-old-space-size automatically.
//  No manual configuration required.
// ════════════════════════════════════════════════════════════════════════════

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const MIN_HEAP_MB = 150;   // never go below this, even on tiny hosts
const MAX_HEAP_MB = 4096;  // sane ceiling so a huge host doesn't over-allocate
const HEAP_FRACTION = 0.75; // use 75% of detected memory for the heap

// index.js lives one level up, at the project root
const ENTRY_FILE = path.join(__dirname, "..", "index.js");

function readCgroupLimitBytes() {
    // cgroup v2 (modern Docker, most current platforms)
    try {
        const raw = fs.readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim();
        if (raw && raw !== "max") {
            const n = Number(raw);
            if (Number.isFinite(n) && n > 0) return n;
        }
    } catch (_) {}

    // cgroup v1 (older Docker / some panels)
    try {
        const raw = fs
            .readFileSync("/sys/fs/cgroup/memory/memory.limit_in_bytes", "utf8")
            .trim();
        const n = Number(raw);
        // cgroup v1 reports a huge sentinel value (close to 2^63) when unlimited —
        // ignore anything absurdly large, it isn't a real container limit.
        if (Number.isFinite(n) && n > 0 && n < 1e15) return n;
    } catch (_) {}

    return null;
}

function detectMemoryLimitMB() {
    const cgroupBytes = readCgroupLimitBytes();
    if (cgroupBytes) {
        return Math.floor(cgroupBytes / 1024 / 1024);
    }
    // Fall back to the host's total memory (bare VPS, no container limit found)
    return Math.floor(os.totalmem() / 1024 / 1024);
}

function computeHeapMB() {
    // Manual override still works for anyone who wants to force a value
    const override = Number(process.env.NODE_MEM_MB);
    if (Number.isFinite(override) && override > 0) {
        return Math.min(Math.max(override, MIN_HEAP_MB), MAX_HEAP_MB);
    }

    const detectedMB = detectMemoryLimitMB();
    const heapMB = Math.floor(detectedMB * HEAP_FRACTION);
    return Math.min(Math.max(heapMB, MIN_HEAP_MB), MAX_HEAP_MB);
}

const heapMB = computeHeapMB();
console.log(`[BOOT] Detected host memory limit, using --max-old-space-size=${heapMB}`);

const child = spawn(
    process.execPath,
    [`--max-old-space-size=${heapMB}`, "--expose-gc", ENTRY_FILE],
    { stdio: "inherit" },
);

child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
});

process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
