// 树形节点接口
export interface TreeNodeData {
  id: string;
  label: string;
  code?: string;
  type: 'root' | 'table' | 'column' | 'primaryKey' | 'foreignKey' | 'key';
  icon: string;
  children?: TreeNodeData[];
  expanded?: boolean;
  // 原始数据引用
  tableData?: any;
  columnData?: any;
  keyData?: any;
}

// 图标映射
const ICONS: Record<string, string> = {
  database: '🗄️',
  table: '📋',
  column: '📊',
  primaryKey: '🔑',
  foreignKey: '🔗',
  key: '🔐',
  expanded: '⊟',
  collapsed: '⊞'
};

export class TreeView {
  private container: HTMLElement;
  private nodes: Map<string, HTMLElement> = new Map();
  private selectedNode: HTMLElement | null = null;
  private onSelectCallback: ((node: TreeNodeData) => void) | null = null;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element not found: ${containerId}`);
    }
    this.container = container;
  }

  // 设置节点选中回调
  onSelect(callback: (node: TreeNodeData) => void) {
    this.onSelectCallback = callback;
  }

  // 渲染树
  render(data: TreeNodeData[]) {
    this.container.innerHTML = '';
    this.nodes.clear();

    if (data.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <p>No PDM file loaded</p>
          <p class="hint">Click "Open File" to select a PDM file</p>
        </div>
      `;
      return;
    }

    data.forEach(node => {
      const nodeEl = this.createNodeElement(node);
      this.container.appendChild(nodeEl);
    });
  }

  // 创建节点元素
  private createNodeElement(node: TreeNodeData): HTMLElement {
    const nodeEl = document.createElement('div');
    nodeEl.className = 'tree-node';
    nodeEl.dataset['nodeId'] = node.id;

    const contentEl = document.createElement('div');
    contentEl.className = 'tree-node-content';

    // 展开/折叠按钮
    if (node.children && node.children.length > 0) {
      const toggleEl = document.createElement('span');
      toggleEl.className = 'tree-node-toggle';
      toggleEl.textContent = node.expanded ? ICONS.expanded : ICONS.collapsed;
      toggleEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleNode(node.id);
      });
      contentEl.appendChild(toggleEl);
    } else {
      const spacer = document.createElement('span');
      spacer.style.width = '16px';
      spacer.style.marginRight = '4px';
      contentEl.appendChild(spacer);
    }

    // 图标
    const iconEl = document.createElement('span');
    iconEl.className = `tree-node-icon ${node.type !== 'root' ? 'icon-' + node.type : ''}`;
    iconEl.textContent = ICONS[node.icon] || '📄';
    contentEl.appendChild(iconEl);

    // 标签
    const labelEl = document.createElement('span');
    labelEl.className = 'tree-node-label';
    labelEl.textContent = node.label;
    labelEl.title = node.label;
    contentEl.appendChild(labelEl);

    // 代码（仅表和列显示）
    if (node.code && node.type !== 'root') {
      const codeEl = document.createElement('span');
      codeEl.className = 'tree-node-code';
      codeEl.textContent = node.code;
      codeEl.title = node.code;
      contentEl.appendChild(codeEl);
    }

    // 点击选中
    contentEl.addEventListener('click', () => {
      this.selectNode(node.id);
      if (this.onSelectCallback) {
        this.onSelectCallback(node);
      }
    });

    nodeEl.appendChild(contentEl);

    // 子节点
    if (node.children && node.children.length > 0) {
      const childrenEl = document.createElement('div');
      childrenEl.className = 'tree-children';
      childrenEl.style.display = node.expanded ? 'block' : 'none';

      node.children.forEach(child => {
        childrenEl.appendChild(this.createNodeElement(child));
      });

      nodeEl.appendChild(childrenEl);
    }

    this.nodes.set(node.id, nodeEl);
    return nodeEl;
  }

  // 切换节点展开/折叠
  private toggleNode(nodeId: string) {
    const nodeEl = this.nodes.get(nodeId);
    if (!nodeEl) return;

    const childrenEl = nodeEl.querySelector('.tree-children') as HTMLElement;
    const toggleEl = nodeEl.querySelector('.tree-node-toggle');

    if (childrenEl) {
      const isExpanded = childrenEl.style.display !== 'none';
      childrenEl.style.display = isExpanded ? 'none' : 'block';

      if (toggleEl) {
        toggleEl.textContent = isExpanded ? ICONS.collapsed : ICONS.expanded;
      }
    }
  }

  // 选中节点
  private selectNode(nodeId: string) {
    // 取消之前的选中
    if (this.selectedNode) {
      this.selectedNode.classList.remove('selected');
    }

    const nodeEl = this.nodes.get(nodeId);
    if (nodeEl) {
      const contentEl = nodeEl.querySelector('.tree-node-content');
      if (contentEl) {
        contentEl.classList.add('selected');
        this.selectedNode = contentEl as HTMLElement;
      }
    }
  }

  // 展开所有节点
  expandAll() {
    this.nodes.forEach((nodeEl) => {
      const childrenEl = nodeEl.querySelector('.tree-children') as HTMLElement;
      const toggleEl = nodeEl.querySelector('.tree-node-toggle');

      if (childrenEl && childrenEl.style.display === 'none') {
        childrenEl.style.display = 'block';
        if (toggleEl) {
          toggleEl.textContent = ICONS.expanded;
        }
      }
    });
  }

  // 折叠所有节点
  collapseAll() {
    this.nodes.forEach((nodeEl) => {
      const childrenEl = nodeEl.querySelector('.tree-children') as HTMLElement;
      const toggleEl = nodeEl.querySelector('.tree-node-toggle');

      if (childrenEl && childrenEl.style.display !== 'none') {
        childrenEl.style.display = 'none';
        if (toggleEl) {
          toggleEl.textContent = ICONS.collapsed;
        }
      }
    });
  }

  // 清空树
  clear() {
    this.container.innerHTML = '';
    this.nodes.clear();
    this.selectedNode = null;
  }
}
