import { app, BrowserWindow, shell, Menu } from 'electron';
import * as path from 'path';
import { registerIPCHandlers, createMenu } from './ipc-handlers';

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'PDM Reader',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, '../preload/index.js')
    },
    show: false
  });

  // 注册 IPC 处理器和菜单（只需注册一次）
  registerIPCHandlers(mainWindow);
  createMenu(mainWindow);

  // 窗口准备就绪后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 添加右键菜单支持
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menu = Menu.buildFromTemplate([
      { role: 'copy', label: '复制' },
      { role: 'selectAll', label: '全选' },
      { type: 'separator' },
      { role: 'cut', label: '剪切' },
      { role: 'paste', label: '粘贴' }
    ]);
    menu.popup();
  });

  // 加载页面
  if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL) {
    const rendererUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173';
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
