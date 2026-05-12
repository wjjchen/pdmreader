import { ipcMain, dialog, Menu, BrowserWindow } from 'electron';
import { PDMParser, PDMData } from './services/pdm-parser';
import * as fs from 'fs/promises';
import * as path from 'path';

let currentFilePath: string | null = null;

export function registerIPCHandlers(mainWindow: BrowserWindow) {
  const parser = new PDMParser();

  // 打开文件对话框
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
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
      mainWindow.webContents.send('file:opened', {
        filePath: targetPath,
        fileName: path.basename(targetPath)
      });

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

  // 调试：检查 PDM 文件中的 References 结构
  ipcMain.handle('pdm:checkReferences', async (_event, filePath?: string): Promise<any> => {
    const targetPath = filePath || currentFilePath;

    if (!targetPath) {
      return null;
    }

    try {
      const content = await fs.readFile(targetPath, 'utf-8');
      const result = parser.parse(content);

      return {
        referencesCount: result.references?.length || 0,
        references: result.references || [],
        hasDiagram: !!result.diagram,
        diagramReferencesCount: result.diagram?.references?.length || 0
      };
    } catch (error) {
      console.error('Error checking references:', error);
      throw error;
    }
  });
}

export function createMenu(mainWindow: BrowserWindow) {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open PDM File',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow.webContents.send('menu:openFile');
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => {
            mainWindow.close();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Expand All',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            mainWindow.webContents.send('menu:expandAll');
          }
        },
        {
          label: 'Collapse All',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => {
            mainWindow.webContents.send('menu:collapseAll');
          }
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow.reload();
          }
        },
        {
          label: 'Toggle DevTools',
          accelerator: 'F12',
          click: () => {
            mainWindow.webContents.toggleDevTools();
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
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About PDM Reader',
              message: 'PDM Reader v1.0.0',
              detail: 'A cross-platform tool to view PowerDesigner PDM files.'
            });
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
