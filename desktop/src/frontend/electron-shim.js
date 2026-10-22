// electronAPI shim — maps the renderer's preload contract onto tinyjs.
// renderer.js is reused unmodified; it talks to window.electronAPI as before.

(() => {
  const call = (type, payload) => tiny.api.call('guiRequest', { type, payload });

  // ── menu event registry (registered once, dispatched by id) ──────────────
  const menuHandlers = {};
  const MENU = {
    'momo-settings':  'openSettings',
    'new-chat':       'newChat',
    'new-project':    'newProject',
    'open-proxy':     'openProxy',
    'open-skills':    'openSkills',
    'cycle-theme':    'cycleTheme',
  };

  tiny.menu.set([
    { role: 'app', items: [
      { id: 'momo-settings', label: '设置…', key: ',' },
    ] },
    { title: '文件', items: [
      { id: 'new-chat', label: '新对话', key: 'n' },
      { id: 'new-project', label: '新建工程' },
    ] },
    { role: 'edit', items: [
      { id: 'momo-settings-2', label: '设置…', key: ',' },
      { separator: true },
      { id: 'open-proxy', label: '代理设置…' },
      { id: 'open-skills', label: 'Skill 目录…' },
      { separator: true },
      { id: 'cycle-theme', label: '切换主题' },
    ] },
    { role: 'help', items: [
      { id: 'open-site', label: '项目主页' },
      { id: 'open-issues', label: '报告问题' },
    ] },
  ]);
  tiny.menu.on((id) => {
    if (id === 'momo-settings-2') id = 'momo-settings';
    if (id === 'open-site')  return tiny.app.shell.open('https://github.com/GWinfinity/momo-code');
    if (id === 'open-issues') return tiny.app.shell.open('https://github.com/GWinfinity/momo-code/issues');
    const key = MENU[id];
    if (key && menuHandlers[key]) menuHandlers[key]();
  });

  // ── bridge events → preload event callbacks ──────────────────────────────
  const onceHandlers = {};          // done/error: one-shot per chat turn
  const streamHandlers = new Map(); // name -> Set(fn)

  tiny.api.on('bridge-event', (evt) => {
    if (!evt || !evt.name) return;
    switch (evt.name) {
      case 'chat:chunk':
        emitStream('chunk', evt.payload);
        break;
      case 'chat:done': {
        const cb = onceHandlers.done;
        onceHandlers.done = null;
        if (cb) cb(evt.payload);
        break;
      }
      case 'chat:error': {
        const cb = onceHandlers.error;
        onceHandlers.error = null;
        if (cb) cb(evt.payload);
        else emitStream('error', evt.payload);
        break;
      }
      case 'chat:thinking-start': emitStream('thinkingStart', {}); break;
      case 'chat:thinking-end':   emitStream('thinkingEnd', {});   break;
      case 'chat:tool-start':     emitStream('toolStart', evt.payload); break;
      case 'chat:tool-end':       emitStream('toolEnd', evt.payload);   break;
      case 'chat:tool-permission':emitStream('toolPermission', evt.payload); break;
      case 'chat:api-retry':      emitStream('apiRetry', evt.payload); break;
      case 'chat:compact':        emitStream('compact', {}); break;
      case 'chat:agent-start':    emitStream('agentStart', evt.payload); break;
      case 'chat:agent-progress': emitStream('agentProgress', evt.payload); break;
      case 'chat:agent-done':     emitStream('agentDone', evt.payload); break;
    }
  });

  function emitStream(name, data) {
    const set = streamHandlers.get(name);
    if (set) for (const fn of [...set]) fn(data);
  }

  function onStream(name, cb) {
    if (!streamHandlers.has(name)) streamHandlers.set(name, new Set());
    streamHandlers.get(name).add(cb);
    return () => streamHandlers.get(name)?.delete(cb);
  }

  // ── the electronAPI surface ─────────────────────────────────────────────
  window.electronAPI = {
    // config
    getConfig:      () => call('config.get', {}),
    getFullConfig:  () => call('config.get', {}),
    saveProviderSettings: (s) => call('config.saveProviderSettings', s || {}),
    setActiveModel: (ref) => call('config.setActiveModel', { ref }),

    // chat
    chatSend:       (payload) => call('chat.send', payload || {}),
    chatNewSession: (key) => call('chat.newSession', { sessionKey: key }),
    chatCancel:     (key) => call('chat.cancel', { sessionKey: key }),

    // streaming events
    onChunk: (cb) => onStream('chunk', cb),
    onDone:  (cb) => { onceHandlers.done = cb; },
    onError: (cb) => { onceHandlers.error = cb; },
    onToolStart: (cb) => onStream('toolStart', cb),
    onToolEnd:   (cb) => onStream('toolEnd', cb),
    onThinkingStart: (cb) => onStream('thinkingStart', cb),
    onThinkingEnd:   (cb) => onStream('thinkingEnd', cb),
    onApiRetry: (cb) => onStream('apiRetry', cb),
    onCompact:  (cb) => onStream('compact', cb),
    onAgentStart:    (cb) => onStream('agentStart', cb),
    onAgentProgress: (cb) => onStream('agentProgress', cb),
    onAgentDone:     (cb) => onStream('agentDone', cb),
    onToolPermission: (cb) => onStream('toolPermission', cb),
    toolApprove: (payload) => tiny.api.call('toolApprove', payload || {}),

    // menu events
    onProviderChanged: (cb) => { menuHandlers.providerChanged = cb; },
    onOpenSettings: (cb) => { menuHandlers.openSettings = cb; },
    onNewChat:      (cb) => { menuHandlers.newChat = cb; },
    onNewProject:   (cb) => { menuHandlers.newProject = cb; },
    onConfigReset:  (cb) => { menuHandlers.configReset = cb; },
    onOpenProxy:    (cb) => { menuHandlers.openProxy = cb; },
    onOpenSkills:   (cb) => { menuHandlers.openSkills = cb; },
    onCycleTheme:   (cb) => { menuHandlers.cycleTheme = cb; },

    // native dialogs
    selectFolder:     () => tiny.dialog.pickFolder(),
    selectSkillsDir:  () => tiny.dialog.pickFolder(),

    // filesystem (local, via backend)
    readDir:   (p) => tiny.api.call('readDir', { path: p }),
    readFile:  (p) => tiny.api.call('readFile', { path: p }),
    readFileRange: (p, off, len) => tiny.api.call('readFileRange', { path: p, offset: off, length: len }),
    writeFile: (p, c) => tiny.api.call('writeFile', { path: p, content: c }),
    getFileSize: (p) => tiny.api.call('getFileSize', { path: p }),
    readSkills: (cwd, extra) => tiny.api.call('readSkills', { cwd, extra }),

    // shell
    openExternal: (url) => tiny.app.shell.open(url),
    openPath: (p) => tiny.app.shell.open(p),

    // drag & drop (WebView2 may expose file.path; otherwise degraded)
    getPathForFile: (file) => (file && (file.path || file.__tinyPath)) || null,
  };
})();
