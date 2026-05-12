import { ipcMain, dialog, Menu, BrowserWindow } from 'electron';
import { PDMParser, PDMData } from './services/pdm-parser';
import * as fs from 'fs/promises';
import * as path from 'path';

let currentFilePath: string | null = null;
const parser = new PDMParser();
let handlersRegistered = false;
let menuCreated = false;

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
}

export function registerIPCHandlers(_mainWindow: BrowserWindow) {
  if (handlersRegistered) return;
  handlersRegistered = true;

  // 打开文件对话框
  ipcMain.handle('dialog:openFile', async () => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win && !win.isDestroyed() ? win : undefined, {
      filters: [
        { name: 'PDM Files', extensions: ['pdm', 'xml'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      currentFilePath = result.filePaths[0];
      return currentFilePath;
    }
    return null;
  });

  // 解析 PDM 文件
  ipcMain.handle('pdm:parse', async (_event, filePath?: string): Promise<PDMData | null> => {
    const targetPath = filePath || currentFilePath;

    if (!targetPath) {
      return null;
    }

    try {
      const content = await fs.readFile(targetPath, 'utf-8');
      const data = parser.parse(content);
      currentFilePath = targetPath;

      // 发送文件打开事件
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('file:opened', {
          filePath: targetPath,
          fileName: path.basename(targetPath)
        });
      }

      return data;
    } catch (error) {
      console.error('Error parsing PDM file:', error);
      throw error;
    }
  });

  // 获取当前文件路径
  ipcMain.handle('app:getCurrentFile', () => {
    return currentFilePath;
  });

  // 保存SQL文件
  ipcMain.handle('sql:save', async (_event, content: string) => {
    const win = getMainWindow();
    const { filePath } = await dialog.showSaveDialog(
      win && !win.isDestroyed() ? win : undefined,
      {
        title: '导出SQL',
        defaultPath: 'create_tables.sql',
        filters: [
          { name: 'SQL Files', extensions: ['sql'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      }
    );

    if (filePath) {
      await fs.writeFile(filePath, content, 'utf-8');
    }
  });
}

export function createMenu(_mainWindow: BrowserWindow) {
  if (menuCreated) return;
  menuCreated = true;
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open PDM File',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send('menu:openFile');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => {
            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.close();
            }
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: '撤销', accelerator: 'CmdOrCtrl+Z' },
        { role: 'redo', label: '重做', accelerator: 'CmdOrCtrl+Shift+Z' },
        { type: 'separator' },
        { role: 'cut', label: '剪切', accelerator: 'CmdOrCtrl+X' },
        { role: 'copy', label: '复制', accelerator: 'CmdOrCtrl+C' },
        { role: 'paste', label: '粘贴', accelerator: 'CmdOrCtrl+V' },
        { role: 'selectAll', label: '全选', accelerator: 'CmdOrCtrl+A' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Expand All',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send('menu:expandAll');
            }
          }
        },
        {
          label: 'Collapse All',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => {
            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send('menu:collapseAll');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.reload();
            }
          }
        },
        {
          label: 'Toggle DevTools',
          accelerator: 'F12',
          click: () => {
            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.toggleDevTools();
            }
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About PDM Reader',
          click: () => {
            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              dialog.showMessageBox(win, {
                type: 'info',
                title: 'About PDM Reader',
                message: 'PDM Reader v1.0.0',
                detail: 'A cross-platform tool to view PowerDesigner PDM files.'
              });
            }
          }
        }
      ]
    }
  ];

  // macOS specific menu
  if (process.platform === 'darwin') {
    template.unshift({
      label: 'PDM Reader',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// 重置状态（用于新窗口创建时）
export function resetForNewWindow() {
  // IPC handlers只需注册一次，不需要重置
  // 菜单通过getMainWindow()动态获取当前窗口，不需要重置
}
