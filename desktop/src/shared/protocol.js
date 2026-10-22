// 前后端共享的桥协议常量（tinyjs shared/ 机制：两侧同路径 import）

/** 页面 → 后端 → sidecar 的请求类型（对应 momo gui-bridge） */
export const CMD = {
  PING: 'ping',
  CONFIG_GET: 'config.get',
  CONFIG_SAVE: 'config.saveProviderSettings',
  CONFIG_SET_ACTIVE: 'config.setActiveModel',
  CHAT_SEND: 'chat.send',
  CHAT_CANCEL: 'chat.cancel',
  CHAT_NEW_SESSION: 'chat.newSession',
};

/** sidecar → 页面 的事件名（经 app.push('bridge-event') 转发） */
export const EVT = {
  READY: 'bridge:ready',
  CHUNK: 'chat:chunk',
  THINKING_START: 'chat:thinking-start',
  THINKING_END: 'chat:thinking-end',
  THINKING_CHUNK: 'chat:thinking-chunk',
  DONE: 'chat:done',
  ERROR: 'chat:error',
};

export default { CMD, EVT };
