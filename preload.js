const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  addCalendarEvent: (data) => ipcRenderer.invoke('add-calendar-event', data),
  getCalendarEvents: () => ipcRenderer.invoke('get-calendar-events'),
  addMemoNote: (data) => ipcRenderer.invoke('add-memo-note', data),
  resizeWindow: (height) => ipcRenderer.invoke('resize-window', height),
  moveWindow: (x, y) => ipcRenderer.invoke('move-window', x, y),
  requestMicrophone: () => ipcRenderer.invoke('request-microphone'),
});
