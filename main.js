const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron')
const path = require('path')

let win
let tray

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  win = new BrowserWindow({
    width: 260,
    height: 320,
    x: width - 300,
    y: height - 360,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  win.loadFile('pet.html')
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true)
  win.setIgnoreMouseEvents(false)
}

function createTray() {
  // 用一个空白图标作为托盘图标
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  const menu = Menu.buildFromTemplate([
    { label: 'Jenny的桌宠 🐾', enabled: false },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ])
  tray.setToolTip('Jenny的桌宠')
  tray.setContextMenu(menu)
}

app.whenReady().then(() => {
  createWindow()
  // createTray()  // 可选，取消注释后菜单栏会出现图标
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 拖动窗口
ipcMain.on('move-window', (e, { dx, dy }) => {
  const [x, y] = win.getPosition()
  win.setPosition(x + dx, y + dy)
})

// 退出
ipcMain.on('quit', () => app.quit())
