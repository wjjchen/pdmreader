import { TreeView, TreeNodeData } from './components/TreeView';
import { DetailPanel, PDMTable, PDMColumn, PDMKey } from './components/DetailPanel';
import { ERDiagram, PDMReference } from './components/ERDiagram';

// 全局变量
let treeView: TreeView;
let detailPanel: DetailPanel;
let erDiagram: ERDiagram;
let currentData: any = null;
let currentTab: 'detail' | 'er' = 'detail';

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initComponents();
  initEventListeners();
  initMenuListeners();
  initTextSelection();
});

// 启用文字选择
function initTextSelection() {
  const detailContainer = document.getElementById('detail-container');
  if (detailContainer) {
    detailContainer.addEventListener('mousedown', (e) => {
      // 允许文字选择
      e.stopPropagation();
    });

    // 设置全局文字选择样式
    document.body.style.userSelect = 'text';
    document.body.style.webkitUserSelect = 'text';
  }
}

// 初始化组件
function initComponents() {
  treeView = new TreeView('tree-container');
  detailPanel = new DetailPanel('detail-container');
  erDiagram = new ERDiagram('er-canvas');

  // 设置树节点选中回调
  treeView.onSelect((node) => {
    detailPanel.show(node);
    // 切换到详情标签
    switchToDetailTab();
  });

  // 设置 ER 图选中回调
  erDiagram.onSelect((tableId) => {
    if (tableId && currentData) {
      const table = currentData.tables.find((t: PDMTable) => t.id === tableId);
      if (table) {
        const node: TreeNodeData = {
          id: table.id,
          label: table.name || table.code,
          code: table.code,
          type: 'table',
          icon: 'table',
          tableData: table,
          children: []
        };
        detailPanel.show(node);
        // 切换到详情标签
        switchToDetailTab();
      }
    }
  });
}

// 初始化按钮事件监听
function initEventListeners() {
  const btnOpen = document.getElementById('btn-open');
  const btnExpand = document.getElementById('btn-expand');
  const btnCollapse = document.getElementById('btn-collapse');
  const tabDetail = document.getElementById('tab-detail');
  const tabEr = document.getElementById('tab-er');

  btnOpen?.addEventListener('click', openFile);
  btnExpand?.addEventListener('click', () => treeView.expandAll());
  btnCollapse?.addEventListener('click', () => treeView.collapseAll());

  // 标签页切换
  tabDetail?.addEventListener('click', () => switchTab('detail'));
  tabEr?.addEventListener('click', () => switchTab('er'));
}

// 切换标签页
function switchTab(tab: 'detail' | 'er') {
  currentTab = tab;

  const tabDetail = document.getElementById('tab-detail');
  const tabEr = document.getElementById('tab-er');
  const detailContainer = document.getElementById('detail-container');
  const erContainer = document.getElementById('er-container');

  if (tab === 'detail') {
    tabDetail?.classList.add('active');
    tabEr?.classList.remove('active');
    detailContainer!.style.display = 'block';
    erContainer!.style.display = 'none';
  } else {
    tabDetail?.classList.remove('active');
    tabEr?.classList.add('active');
    detailContainer!.style.display = 'none';
    erContainer!.style.display = 'block';
    // 触发 ER 图重新渲染
    erDiagram.render();
  }
}

// 切换到详情标签
function switchToDetailTab() {
  if (currentTab !== 'detail') {
    switchTab('detail');
  }
}

// 初始化菜单事件监听
function initMenuListeners() {
  if (window.electronAPI) {
    window.electronAPI.onMenuOpenFile(() => openFile());

    window.electronAPI.onExpandAll(() => treeView.expandAll());

    window.electronAPI.onCollapseAll(() => treeView.collapseAll());

    window.electronAPI.onFileOpened((data) => {
      updateStatus(`已加载: ${data.fileName}`);
    });
  }
}

// 打开文件
async function openFile() {
  if (!window.electronAPI) {
    console.error('Electron API not available');
    return;
  }

  try {
    const filePath = await window.electronAPI.openFile();
    if (filePath) {
      await loadPDM(filePath);
    }
  } catch (error) {
    console.error('Error opening file:', error);
    updateStatus(`错误: ${error}`);
  }
}

// 加载 PDM 文件
async function loadPDM(filePath: string) {
  updateStatus('加载中...');

  try {
    const data = await window.electronAPI.parsePDM(filePath);

    if (!data) {
      updateStatus('解析 PDM 文件失败');
      return;
    }

    if (!data.tables || data.tables.length === 0) {
      updateStatus('未找到表');
      return;
    }

    currentData = data;

    // 构建树形数据
    const treeData = buildTreeData(data.tables);

    // 渲染树
    treeView.render(treeData);

    // 设置 ER 图数据（包含外键关系）
    erDiagram.setData(data.diagram, data.tables, data.references);

    // 启用按钮
    if (btnExpand) btnExpand.disabled = false;
    if (btnCollapse) btnCollapse.disabled = false;

    updateStatus(`已加载 ${data.tables.length} 个表`);
  } catch (error) {
    console.error('Error parsing PDM:', error);
    updateStatus(`错误: ${error}`);
  }
}

// 构建树形数据
function buildTreeData(tables: PDMTable[]): TreeNodeData[] {
  const rootNode: TreeNodeData = {
    id: 'root',
    label: '数据库',
    type: 'root',
    icon: 'database',
    expanded: true,
    children: tables.map(table => buildTableNode(table))
  };

  return [rootNode];
}

// 构建表节点
function buildTableNode(table: PDMTable): TreeNodeData {
  const tableNode: TreeNodeData = {
    id: table.id,
    label: table.name || table.code,
    code: table.code,
    type: 'table',
    icon: 'table',
    expanded: false,
    tableData: table,
    children: []
  };

  // 添加主键
  if (table.primaryKey) {
    tableNode.children!.push({
      id: table.primaryKey.id,
      label: table.primaryKey.name || '主键',
      code: table.primaryKey.code,
      type: 'primaryKey',
      icon: 'primaryKey',
      keyData: table.primaryKey
    });
  }

  // 添加外键
  if (table.keys) {
    table.keys
      .filter(k => k.type === 'foreign')
      .forEach(fk => {
        tableNode.children!.push({
          id: fk.id,
          label: fk.name || '外键',
          code: fk.code,
          type: 'foreignKey',
          icon: 'foreignKey',
          keyData: fk
        });
      });
  }

  // 添加列
  if (table.columns) {
    table.columns.forEach(col => {
      tableNode.children!.push({
        id: col.id,
        label: col.name || col.code,
        code: col.code,
        type: 'column',
        icon: 'column',
        columnData: col
      });
    });
  }

  return tableNode;
}

// 更新状态栏
function updateStatus(text: string) {
  const statusEl = document.getElementById('status-text');
  if (statusEl) {
    statusEl.textContent = text;
  }
}

// 类型声明
declare global {
  interface Window {
    electronAPI: {
      openFile: () => Promise<string | null>;
      parsePDM: (filePath?: string) => Promise<any>;
      getCurrentFile: () => Promise<string | null>;
      onFileOpened: (callback: (data: { filePath: string; fileName: string }) => void) => void;
      onMenuOpenFile: (callback: () => void) => void;
      onExpandAll: (callback: () => void) => void;
      onCollapseAll: (callback: () => void) => void;
    };
  }
}
