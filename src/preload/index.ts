import { contextBridge, ipcRenderer } from 'electron';

// 定义 API 接口
export interface ElectronAPI {
  openFile: () => Promise<string | null>;
  parsePDM: (filePath?: string) => Promise<any>;
  getCurrentFile: () => Promise<string | null>;
  onFileOpened: (callback: (data: { filePath: string; fileName: string }) => void) => void;
  onMenuOpenFile: (callback: () => void) => void;
  onExpandAll: (callback: () => void) => void;
  onCollapseAll: (callback: () => void) => void;
  checkReferences: () => Promise<any>;
}

contextBridge.exposeInMainWorld('electronAPI', {
  // 打开文件对话框
  openFile: () => ipcRenderer.invoke('dialog:openFile'),

  // 解析 PDM 文件
  parsePDM: (filePath?: string) => ipcRenderer.invoke('pdm:parse', filePath),

  // 获取当前文件路径
  getCurrentFile: () => ipcRenderer.invoke('app:getCurrentFile'),

  // 文件打开事件监听
  onFileOpened: (callback: (data: { filePath: string; fileName: string }) => void) => {
    ipcRenderer.on('file:opened', (_event, data) => callback(data));
  },

  // 菜单事件监听
  onMenuOpenFile: (callback: () => void) => {
    ipcRenderer.on('menu:openFile', () => callback());
  },

  onExpandAll: (callback: () => void) => {
    ipcRenderer.on('menu:expandAll', () => callback());
  },

  onCollapseAll: (callback: () => void) => {
    ipcRenderer.on('menu:collapseAll', () => callback());
  },

  // 检查 References
  checkReferences: () => ipcRenderer.invoke('pdm:checkReferences')
} as ElectronAPI);
