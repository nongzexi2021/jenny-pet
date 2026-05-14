const { app, BrowserWindow, ipcMain, Notification, session, systemPreferences } = require('electron');
const { exec } = require('child_process');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 260,
    height: 250,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('pet_final.html');

  const { width, height } = require('electron').screen.getPrimaryDisplay().workAreaSize;
  mainWindow.setPosition(width - 280, height - 270);

  // 地理位置 + 麦克风权限直接允许
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (['geolocation', 'media', 'microphone'].includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return ['geolocation', 'media', 'microphone'].includes(permission);
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// 动态调整窗口高度：默认顶边不动（小人不跳），仅当会超出工作区底部时才向上让位
ipcMain.handle('resize-window', async (event, newHeight) => {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const { height: sh } = require('electron').screen.getPrimaryDisplay().workAreaSize;
  let newY = bounds.y;
  if (newY + newHeight > sh) newY = sh - newHeight;
  if (newY < 0) newY = 0;
  mainWindow.setBounds({ x: bounds.x, y: newY, width: bounds.width, height: newHeight }, false);
});

// 手动拖动窗口
ipcMain.handle('move-window', (event, x, y) => {
  if (!mainWindow) return;
  mainWindow.setPosition(Math.round(x), Math.round(y));
});

// 请求麦克风权限（触发 macOS 系统授权弹窗）
ipcMain.handle('request-microphone', async () => {
  if (process.platform !== 'darwin') return true;
  const status = systemPreferences.getMediaAccessStatus('microphone');
  if (status === 'granted') return true;
  if (status === 'denied' || status === 'restricted') {
    return { error: 'denied', status };
  }
  // 'not-determined' → 弹出系统授权对话框
  try {
    const ok = await systemPreferences.askForMediaAccess('microphone');
    return ok ? true : { error: 'denied', status: 'denied' };
  } catch (e) {
    return { error: e.message };
  }
});

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

ipcMain.handle('add-calendar-event', async (event, data) => {
  const { title, date, time, duration = 60 } = data;
  const [year, month, day] = date.split('-').map(Number);
  let startScript, endScript;
  if (time) {
    const [hour, minute] = time.split(':').map(Number);
    startScript = `date "${month}/${day}/${year} ${hour}:${String(minute).padStart(2,'0')}:00"`;
    const endDate = new Date(year, month-1, day, hour, minute + duration);
    endScript = `date "${endDate.getMonth()+1}/${endDate.getDate()}/${endDate.getFullYear()} ${String(endDate.getHours()).padStart(2,'0')}:${String(endDate.getMinutes()).padStart(2,'0')}:00"`;
  } else {
    startScript = `date "${month}/${day}/${year}"`;
    endScript = `date "${month}/${day}/${year}"`;
  }
  const script = `
    tell application "Calendar"
      tell calendar "家庭"
        set startDate to ${startScript}
        set endDate to ${endScript}
        set newEvent to make new event with properties {summary:"${title}", start date:startDate, end date:endDate}
        if "${time}" is not "" then
          make new reminder at newEvent with properties {trigger interval:-15}
        end if
      end tell
      reload calendars
    end tell
    return "success"
  `;
  await runAppleScript(script);
  new Notification({ title: '📅 已加入日历', body: `${title} · ${date} ${time || '全天'}` }).show();
  return { success: true };
});

ipcMain.handle('get-calendar-events', async () => {
  const today = new Date();
  const m = today.getMonth()+1, d = today.getDate(), y = today.getFullYear();
  const script = `
    tell application "Calendar"
      set todayStart to date "${m}/${d}/${y} 00:00:00"
      set todayEnd to date "${m}/${d}/${y} 23:59:59"
      set eventList to {}
      repeat with cal in calendars
        set evts to (every event of cal whose start date >= todayStart and start date <= todayEnd)
        repeat with evt in evts
          set evtTitle to summary of evt
          set evtStart to start date of evt
          set h to hours of evtStart
          set mi to minutes of evtStart
          set timeStr to (h as string) & ":" & text -2 thru -1 of ("0" & (mi as string))
          set end of eventList to (evtTitle & "|" & timeStr)
        end repeat
      end repeat
      return eventList
    end tell
  `;
  const result = await runAppleScript(script);
  if (!result) return [];
  return result.split(', ').map(item => {
    const parts = item.split('|');
    return { title: parts[0], time: parts[1] };
  }).filter(e => e.title).sort((a,b) => (a.time||'').localeCompare(b.time||''));
});

ipcMain.handle('add-memo-note', async (event, data) => {
  const { title, time, content } = data;
  const newLine = `[${time}] ${content}`;
  const checkScript = `
    tell application "Notes"
      set targetNote to missing value
      repeat with n in every note of folder "备忘录"
        if name of n is "${title}" then
          set targetNote to n
          exit repeat
        end if
      end repeat
      if targetNote is missing value then
        return "notfound"
      else
        return body of targetNote
      end if
    end tell
  `;
  let existingBody = '';
  try {
    const r = await runAppleScript(checkScript);
    if (r !== 'notfound') existingBody = r;
  } catch(e) {}

  if (existingBody) {
    const plain = existingBody.replace(/<[^>]+>/g, '').trim();
    const newBody = (plain + '\n' + newLine).replace(/"/g, '\\"').replace(/\n/g, '\\n');
    await runAppleScript(`
      tell application "Notes"
        repeat with n in every note of folder "备忘录"
          if name of n is "${title}" then
            set body of n to "${newBody}"
            exit repeat
          end if
        end repeat
      end tell
    `);
  } else {
    const escaped = newLine.replace(/"/g, '\\"');
    await runAppleScript(`
      tell application "Notes"
        tell folder "备忘录"
          make new note with properties {name:"${title}", body:"${escaped}"}
        end tell
      end tell
    `);
  }
  new Notification({ title: '📝 备忘录已保存', body: newLine }).show();
  return { success: true };
});
