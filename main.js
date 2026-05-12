const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const { exec } = require('child_process');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 300,
    height: 600,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile('pet_final.html');
  // 右下角显示
  const { width, height } = require('electron').screen.getPrimaryDisplay().workAreaSize;
  mainWindow.setPosition(width - 320, height - 620);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── 执行 AppleScript 工具函数 ──
function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

// ── 写入 Mac 日历 ──
ipcMain.handle('add-calendar-event', async (event, data) => {
  const { title, date, time, duration = 60 } = data;

  // 解析日期时间
  const [year, month, day] = date.split('-').map(Number);
  let startScript, endScript;

  if (time) {
    const [hour, minute] = time.split(':').map(Number);
    startScript = `date "${month}/${day}/${year} ${hour}:${String(minute).padStart(2,'0')}:00"`;
    // 结束时间 = 开始 + duration 分钟
    const endDate = new Date(year, month-1, day, hour, minute + duration);
    endScript = `date "${endDate.getMonth()+1}/${endDate.getDate()}/${endDate.getFullYear()} ${String(endDate.getHours()).padStart(2,'0')}:${String(endDate.getMinutes()).padStart(2,'0')}:00"`;
  } else {
    // 全天事件
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

  // 系统通知确认
  new Notification({
    title: '📅 已加入日历',
    body: `${title} · ${date} ${time || '全天'}`,
  }).show();

  return { success: true };
});

// ── 读取今天的日历事件 ──
ipcMain.handle('get-calendar-events', async () => {
  const today = new Date();
  const m = today.getMonth() + 1, d = today.getDate(), y = today.getFullYear();

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

  // 解析返回结果
  const events = result.split(', ').map(item => {
    const parts = item.split('|');
    return { title: parts[0], time: parts[1] };
  }).filter(e => e.title);

  // 按时间排序
  events.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
  return events;
});

// ── 写入 Mac 备忘录 ──
ipcMain.handle('add-memo-note', async (event, data) => {
  const { title, time, content } = data;
  const newLine = `[${time}] ${content}`;

  // 先检查今天的备忘录是否存在，存在则追加，不存在则新建
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
    const checkResult = await runAppleScript(checkScript);
    if (checkResult !== 'notfound') {
      existingBody = checkResult;
    }
  } catch(e) {}

  if (existingBody) {
    // 追加到已有备忘录
    // 提取纯文本内容（去掉 HTML 标签）
    const plainExisting = existingBody.replace(/<[^>]+>/g, '').trim();
    const newBody = plainExisting + '\n' + newLine;

    const updateScript = `
      tell application "Notes"
        repeat with n in every note of folder "备忘录"
          if name of n is "${title}" then
            set body of n to "${newBody.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"
            exit repeat
          end if
        end repeat
      end tell
      return "success"
    `;
    await runAppleScript(updateScript);
  } else {
    // 新建备忘录
    const createScript = `
      tell application "Notes"
        tell folder "备忘录"
          make new note with properties {name:"${title}", body:"${newLine}"}
        end tell
      end tell
      return "success"
    `;
    await runAppleScript(createScript);
  }

  // 系统通知
  new Notification({
    title: '📝 备忘录已保存',
    body: newLine,
  }).show();

  return { success: true };
});
