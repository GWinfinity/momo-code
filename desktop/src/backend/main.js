// momo 桌面版 — tinyjs backend (txiki.js).
//
// 职责：
//   1. 管理 momo 内核 sidecar（momo-gui.exe，stdio NDJSON 桥）
//   2. 转发页面请求到 sidecar（gui.request），事件经 app.push('bridge-event') 推回页面
//   3. 本地文件操作（readDir/readFile/...）与 Skill 扫描直接用 tjs 完成

const dec = new TextDecoder();
const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// Sidecar (momo gui-bridge) management
// ---------------------------------------------------------------------------

const bridge = {
  proc: null,
  reader: null,
  writer: null,
  pending: new Map(), // id -> { resolve, reject }
  queue: [],          // events waiting for the page to drain (poll fallback)
  app: null,
  nextId: 1,
  spawnError: null,
};

// import.meta.url can be file:///D:/x/y, file://C:\x\y (Windows), or file:///home/x.
// Returns the backend source dir with / separators and .. segments resolved.
function moduleDir() {
  let p = import.meta.url.replace(/^file:\/\//, '');
  try {
    p = decodeURIComponent(p);
  } catch {}
  p = p.replace(/\\/g, '/').replace(/^\/([A-Za-z]:)/, '$1');
  p = p.replace(/\/src\/backend\/main\.js$/, '');
  const drive = /^[A-Za-z]:/.test(p) ? p.slice(0, 3) : ''; // "D:/" or ""
  const abs = drive ? true : p.startsWith('/');
  const segs = [];
  for (const seg of p.slice(drive.length).split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') segs.pop();
    else segs.push(seg);
  }
  return (drive || (abs ? '/' : '')) + segs.join('/');
}

function sidecarCandidates(app) {
  const exe = tjs.env.OS === 'Windows_NT' ? 'momo-gui.exe' : 'momo-gui';
  const list = [];
  if (app?.paths?.executables) list.push(app.paths.executables + '/' + exe);
  // dev fallbacks: repo checkout layout (desktop/ sits at the repo root)
  const root = moduleDir();
  list.push(root + '/executables/' + exe);
  list.push(root + '/../packages/opencode/' + exe);
  return list;
}

async function statOrNull(p) {
  try {
    const s = await tjs.stat(p);
    return s;
  } catch {
    return null;
  }
}

async function startBridge(app) {
  if (bridge.proc) return true;
  let exe = null;
  for (const cand of sidecarCandidates(app)) {
    if (await statOrNull(cand)) {
      exe = cand;
      break;
    }
  }
  if (!exe) {
    // Dev convenience: run the TypeScript entry straight through bun.
    const entry = moduleDir() + '/../packages/opencode/src/cli/main.ts';
    if (await statOrNull(entry) && whichBun()) {
      return spawnBridge([whichBun(), entry, 'gui-bridge']);
    }
    bridge.spawnError = '未找到 momo-gui sidecar（请先运行 desktop/build-sidecar.ps1）';
    return false;
  }
  return spawnBridge([exe, 'gui-bridge']);
}

function whichBun() {
  const candidates = tjs.env.OS === 'Windows_NT'
    ? ['bun.exe', 'bun']
    : ['bun'];
  // PATH lookup is left to spawn; just pick a name and let it fail cleanly.
  return candidates[0];
}

async function spawnBridge(argv) {
  try {
    const proc = tjs.spawn(argv, {
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'pipe',
      env: { ...tjs.env, EFFECT_LOG_LEVEL: 'NONE' },
    });
    bridge.proc = proc;
    bridge.writer = proc.stdin.getWriter();
    bridge.spawnError = null;

    // Drain stderr to keep the pipe from blocking (logs only).
    (async () => {
      const reader = proc.stderr.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    })().catch(() => {});

    readBridgeLoop(proc);
    return true;
  } catch (err) {
    bridge.spawnError = String(err);
    bridge.proc = null;
    return false;
  }
}

async function readBridgeLoop(proc) {
  const reader = proc.stdout.getReader();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        dispatchBridgeMessage(msg);
      }
    }
  } catch {
    /* process ended */
  }
  bridge.proc = null;
  bridge.writer = null;
  for (const p of bridge.pending.values()) p.reject(new Error('bridge exited'));
  bridge.pending.clear();
}

function dispatchBridgeMessage(msg) {
  if (msg.type === 'event') {
    const evt = { name: msg.name, sessionKey: msg.sessionKey || '', payload: msg.payload || {} };
    bridge.queue.push(evt);
    if (bridge.queue.length > 2000) bridge.queue.splice(0, bridge.queue.length - 2000);
    if (bridge.app) bridge.app.push('bridge-event', evt);
    return;
  }
  const waiter = bridge.pending.get(msg.id);
  if (!waiter) return;
  bridge.pending.delete(msg.id);
  if (msg.type === 'error') waiter.reject(new Error(msg.payload?.message || 'bridge error'));
  else waiter.resolve(msg.payload);
}

function callBridge(payload) {
  return new Promise((resolve, reject) => {
    if (!bridge.proc) {
      reject(new Error(bridge.spawnError || 'bridge not running'));
      return;
    }
    const id = bridge.nextId++;
    bridge.pending.set(id, { resolve, reject });
    // tjs stdin is a WritableStream; a single writer serializes concurrent writes.
    bridge.writer.write(enc.encode(JSON.stringify({ id, type: payload.type, payload: payload.payload || {} }) + '\n'))
      .catch((err) => {
        bridge.pending.delete(id);
        reject(err);
      });
    setTimeout(() => {
      if (bridge.pending.has(id)) {
        bridge.pending.delete(id);
        reject(new Error('bridge timeout'));
      }
    }, 300_000);
  });
}

// ---------------------------------------------------------------------------
// Config helpers (UI-only state: last folder, skill extra dir, theme)
// ---------------------------------------------------------------------------

function uiStatePath() {
  return tjs.homeDir + '/.momo/gui-state.json';
}

async function readUiState() {
  try {
    return JSON.parse(dec.decode(await tjs.readFile(uiStatePath())));
  } catch {
    return {};
  }
}

async function writeUiState(state) {
  try {
    await tjs.makeDir(tjs.homeDir + '/.momo', { recursive: true });
  } catch {}
  await tjs.writeFile(uiStatePath(), enc.encode(JSON.stringify(state, null, 2)));
}

// ---------------------------------------------------------------------------
// Skills scanning (mirrors the upstream renderer contract)
// ---------------------------------------------------------------------------

function parseSkillFrontmatter(content) {
  const fm = {};
  const m = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([a-zA-Z-]+)\s*:\s*(.+)$/);
      if (kv) fm[kv[1].trim()] = kv[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return fm;
}

async function loadSkillsFromDir(dir, source) {
  const skills = [];
  const iter = await tjs.readDir(dir).catch(() => null);
  if (!iter) return skills;
  for await (const entry of iter) {
    let mdPath = null;
    let skillName = entry.name;
    if (entry.isDirectory) {
      for (const candidate of ['SKILL.md', 'skill.md']) {
        const p = dir + '/' + entry.name + '/' + candidate;
        if (await statOrNull(p)) {
          mdPath = p;
          break;
        }
      }
    } else if (/\.md$/i.test(entry.name) && !/^skill\.md$/i.test(entry.name)) {
      mdPath = dir + '/' + entry.name;
      skillName = entry.name.replace(/\.md$/i, '');
    }
    if (!mdPath) continue;
    try {
      const raw = dec.decode(await tjs.readFile(mdPath));
      const fm = parseSkillFrontmatter(raw);
      const body = raw.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s?\r?\n/, '').trim();
      const name = fm['name'] || skillName;
      const rawDesc = fm['description'] || fm['when-to-use'] ||
        body.split('\n').find((l) => l.trim()) || '';
      const desc = rawDesc.replace(/^#+\s*/, '').slice(0, 80);
      skills.push({ name, description: desc, template: body, source });
    } catch {}
  }
  return skills;
}

// ---------------------------------------------------------------------------
// API (page → backend)
// ---------------------------------------------------------------------------

export const api = {
  // ── sidecar bridge ─────────────────────────────────────────────
  async guiStart(_params, app) {
    bridge.app = app;
    const ok = await startBridge(app);
    return { ok, error: ok ? null : bridge.spawnError };
  },

  async guiRequest({ type, payload }, app) {
    bridge.app = app;
    if (!bridge.proc) await startBridge(app);
    return callBridge({ type, payload: payload || {} });
  },

  async guiPoll({ since } = {}) {
    if (typeof since === 'number' && since < bridge.queue.length) {
      return { events: bridge.queue.slice(since), next: bridge.queue.length };
    }
    return { events: [], next: bridge.queue.length };
  },

  async toolApprove() {
    // MVP: no tool-permission loop in the GUI chat — accept and move on.
    return { ok: true };
  },

  // ── filesystem (runs locally, no sidecar needed) ───────────────
  async readDir({ path }) {
    try {
      const out = [];
      const iter = await tjs.readDir(path);
      for await (const e of iter) {
        if (e.name.startsWith('.')) continue;
        out.push({ name: e.name, isDir: !!e.isDirectory });
      }
      out.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
      return out;
    } catch {
      return [];
    }
  },

  async readFile({ path }) {
    try {
      return dec.decode(await tjs.readFile(path));
    } catch {
      return null;
    }
  },

  async readFileRange({ path, offset, length }) {
    try {
      const file = await tjs.open(path, 'r');
      const buf = new Uint8Array(Math.min(length, 64 * 1024 * 1024));
      const n = await file.read(buf, { fileOffset: offset });
      await file.close();
      return dec.decode(buf.subarray(0, n ?? 0));
    } catch {
      return null;
    }
  },

  async writeFile({ path, content }) {
    try {
      await tjs.writeFile(path, enc.encode(content));
      return true;
    } catch {
      return false;
    }
  },

  async getFileSize({ path }) {
    try {
      return (await tjs.stat(path)).size;
    } catch {
      return -1;
    }
  },

  async readSkills({ cwd, extra }) {
    const home = tjs.homeDir;
    const results = [];
    const seen = new Set();
    const add = async (dir, source) => {
      for (const s of await loadSkillsFromDir(dir, source)) {
        if (!seen.has(s.name)) {
          seen.add(s.name);
          results.push(s);
        }
      }
    };
    await add(home + '/.claude/skills', 'user');
    await add(home + '/.claude/commands', 'user');
    if (cwd) {
      await add(cwd + '/.claude/skills', 'project');
      await add(cwd + '/.claude/commands', 'project');
    }
    const extras = Array.isArray(extra) ? extra : extra ? [extra] : [];
    for (const d of extras) {
      if (d) await add(d, '自定义');
    }
    return results;
  },

  // ── UI state (last folder / skill dir / theme) ─────────────────
  async uiStateGet() {
    return readUiState();
  },

  async uiStateSet(partial) {
    const state = await readUiState();
    Object.assign(state, partial || {});
    await writeUiState(state);
    return { ok: true };
  },

  // ── misc ───────────────────────────────────────────────────────
  async sysinfo() {
    return {
      runtime: 'txiki.js ' + tjs.version,
      host: tjs.hostName,
      home: tjs.homeDir,
      pid: tjs.pid,
    };
  },
};

// Called once the window is up.
export function init(app) {
  bridge.app = app;
  startBridge(app).then((ok) => {
    app.push('bridge-status', { ok, error: ok ? null : bridge.spawnError });
  });
}

export function onWindowClosed() {
  if (bridge.proc) {
    try {
      bridge.proc.kill(15);
    } catch {}
    bridge.proc = null;
    bridge.writer = null;
  }
}
