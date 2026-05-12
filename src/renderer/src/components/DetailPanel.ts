// PDM 数据接口
export interface PDMColumn {
  id: string;
  name: string;
  code: string;
  dataType: string;
  length?: string;
  precision?: string;
  nullable: boolean;
  identity: boolean;
  defaultValue?: string;
  comment?: string;
}

export interface PDMKey {
  id: string;
  name: string;
  code: string;
  type: 'primary' | 'foreign';
  columnRefs: string[];
}

export interface PDMTable {
  id: string;
  name: string;
  code: string;
  comment?: string;
  columns: PDMColumn[];
  primaryKey?: PDMKey;
  keys: PDMKey[];
}

export interface TreeNodeData {
  id: string;
  label: string;
  code?: string;
  type: 'root' | 'table' | 'column' | 'primaryKey' | 'foreignKey' | 'key';
  icon: string;
  children?: TreeNodeData[];
  expanded?: boolean;
  tableData?: PDMTable;
  columnData?: PDMColumn;
  keyData?: PDMKey;
}

export class DetailPanel {
  private container: HTMLElement;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element not found: ${containerId}`);
    }
    this.container = container;
  }

  // 显示详情
  show(node: TreeNodeData) {
    switch (node.type) {
      case 'table':
        this.showTableDetail(node);
        break;
      case 'column':
        this.showColumnDetail(node);
        break;
      case 'primaryKey':
      case 'foreignKey':
      case 'key':
        this.showKeyDetail(node);
        break;
      default:
        this.showEmpty();
    }
  }

  // 显示空状态
  showEmpty() {
    this.container.innerHTML = `
      <div class="empty-state">
        <p>从树形结构或 ER 图中选择一项查看详情</p>
      </div>
    `;
  }

  // 显示表详情
  private showTableDetail(node: TreeNodeData) {
    const table = node.tableData;
    if (!table) {
      this.showEmpty();
      return;
    }

    const columnsHtml = table.columns.map(col => `
      <tr>
        <td class="col-name selectable">${this.escapeHtml(col.name)}</td>
        <td class="col-code selectable">${this.escapeHtml(col.code)}</td>
        <td class="col-type selectable">${this.escapeHtml(col.dataType)}</td>
        <td class="selectable">${col.length || '-'}</td>
        <td>${col.nullable ? '<span class="badge badge-mandatory">NOT NULL</span>' : '<span class="badge badge-nullable">NULL</span>'}</td>
        <td>${col.identity ? '<span class="badge badge-identity">自增</span>' : ''}</td>
        <td class="selectable">${this.escapeHtml(col.defaultValue || '')}</td>
        <td class="selectable">${this.escapeHtml(col.comment || '')}</td>
      </tr>
    `).join('');

    this.container.innerHTML = `
      <div class="detail-section">
        <h2 class="detail-title">${this.escapeHtml(table.name)}</h2>
        <div class="detail-row">
          <span class="detail-label">代码:</span>
          <span class="detail-value mono selectable">${this.escapeHtml(table.code)}</span>
        </div>
        ${table.comment ? `
        <div class="detail-row">
          <span class="detail-label">注释:</span>
          <span class="detail-value selectable">${this.escapeHtml(table.comment)}</span>
        </div>
        ` : ''}
      </div>

      <div class="detail-section">
        <h3 class="detail-title" style="font-size: 14px; border-bottom-width: 1px;">列信息 (${table.columns.length})</h3>
        <table class="detail-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>代码</th>
              <th>数据类型</th>
              <th>长度</th>
              <th>可为空</th>
              <th>自增</th>
              <th>默认值</th>
              <th>注释</th>
            </tr>
          </thead>
          <tbody>
            ${columnsHtml}
          </tbody>
        </table>
      </div>

      ${table.primaryKey ? `
      <div class="detail-section">
        <h3 class="detail-title" style="font-size: 14px; border-bottom-width: 1px;">主键</h3>
        <div class="detail-row">
          <span class="detail-label">名称:</span>
          <span class="detail-value selectable">${this.escapeHtml(table.primaryKey.name)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">代码:</span>
          <span class="detail-value mono selectable">${this.escapeHtml(table.primaryKey.code)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">列:</span>
          <span class="detail-value mono selectable">${this.getColumnNames(table, table.primaryKey.columnRefs).join(', ')}</span>
        </div>
      </div>
      ` : ''}
    `;
  }

  // 显示列详情
  private showColumnDetail(node: TreeNodeData) {
    const column = node.columnData;
    if (!column) {
      this.showEmpty();
      return;
    }

    this.container.innerHTML = `
      <div class="detail-section">
        <h2 class="detail-title">${this.escapeHtml(column.name)}</h2>
        <div class="detail-row">
          <span class="detail-label">代码:</span>
          <span class="detail-value mono selectable">${this.escapeHtml(column.code)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">数据类型:</span>
          <span class="detail-value mono selectable">${this.escapeHtml(column.dataType)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">长度:</span>
          <span class="detail-value selectable">${column.length || '-'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">精度:</span>
          <span class="detail-value selectable">${column.precision || '-'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">可为空:</span>
          <span class="detail-value selectable">${column.nullable ? '是' : '否'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">自增:</span>
          <span class="detail-value selectable">${column.identity ? '是' : '否'}</span>
        </div>
        ${column.defaultValue ? `
        <div class="detail-row">
          <span class="detail-label">默认值:</span>
          <span class="detail-value mono selectable">${this.escapeHtml(column.defaultValue)}</span>
        </div>
        ` : ''}
        ${column.comment ? `
        <div class="detail-row">
          <span class="detail-label">注释:</span>
          <span class="detail-value selectable">${this.escapeHtml(column.comment)}</span>
        </div>
        ` : ''}
      </div>
    `;
  }

  // 显示键详情
  private showKeyDetail(node: TreeNodeData) {
    const key = node.keyData;
    if (!key) {
      this.showEmpty();
      return;
    }

    const badgeClass = key.type === 'primary' ? 'badge-pk' : 'badge-fk';
    const typeLabel = key.type === 'primary' ? '主键' : '外键';

    this.container.innerHTML = `
      <div class="detail-section">
        <h2 class="detail-title">${this.escapeHtml(key.name)} <span class="badge ${badgeClass}">${typeLabel}</span></h2>
        <div class="detail-row">
          <span class="detail-label">代码:</span>
          <span class="detail-value mono selectable">${this.escapeHtml(key.code)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">类型:</span>
          <span class="detail-value selectable">${typeLabel}</span>
        </div>
      </div>
    `;
  }

  // 格式化数据类型（不再合并长度）
  private formatDataType(col: PDMColumn): string {
    return col.dataType;
  }

  // 获取列名列表
  private getColumnNames(table: PDMTable, columnRefs: string[]): string[] {
    return columnRefs.map(ref => {
      const col = table.columns.find(c => c.id === ref);
      return col ? col.code : ref;
    });
  }

  // HTML 转义
  private escapeHtml(str: string): string {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
