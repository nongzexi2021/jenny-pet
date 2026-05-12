const { contextBridge, ipcRenderer } = require('electron');

// 把 Electron 的 IPC 能力暴露给网页
contextBridge.exposeInMainWorld('electronAPI', {
  // 写入日历事件
  addCalendarEvent: (data) => ipcRenderer.invoke('add-calendar-event', data),
  // 读取今天日历事件
  getCalendarEvents: () => ipcRenderer.invoke('get-calendar-events'),
  // 写入备忘录
  addMemoNote: (data) => ipcRenderer.invoke('add-memo-note', data),
});
