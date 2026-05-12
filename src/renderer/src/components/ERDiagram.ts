// ER 图数据接口
export interface PDMTableSymbol {
  id: string;
  objectId: string;
  rect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}

export interface PDMReferenceSymbol {
  id: string;
  referenceId: string;
  sourceSymbolId: string;
  destSymbolId: string;
  sourceAnchor: number;
  destAnchor: number;
}

export interface PDMReference {
  id: string;
  name: string;
  code: string;
  parentTableId: string;
  childTableId: string;
  parentTableCode?: string;
  childTableCode?: string;
}

export interface PDMDiagram {
  id: string;
  name: string;
  tableSymbols: PDMTableSymbol[];
  referenceSymbols: PDMReferenceSymbol[];
  references: PDMReference[];
}

export interface PDMTable {
  id: string;
  name: string;
  code: string;
  comment?: string;
  columns: PDMColumn[];
}

export interface PDMColumn {
  id: string;
  name: string;
  code: string;
  dataType: string;
  length?: string;
  nullable: boolean;
  comment?: string;
}

// 计算锚点位置
function getAnchorPoint(rect: { left: number; top: number; right: number; bottom: number }, anchor: number): { x: number; y: number } {
  const centerX = (rect.left + rect.right) / 2;
  const centerY = (rect.top + rect.bottom) / 2;

  switch (anchor) {
    case 0: return { x: rect.left, y: centerY };
    case 1: return { x: centerX, y: rect.top };
    case 2: return { x: rect.right, y: centerY };
    case 3: return { x: centerX, y: rect.bottom };
    default: return { x: centerX, y: centerY };
  }
}

function generateTableId(tableId: string): string {
  return 'symbol_' + tableId.replace(/[^a-zA-Z0-9]/g, '_');
}

export class ERDiagram {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private diagram?: PDMDiagram;
  private tables: Map<string, PDMTable> = new Map();
  private symbolMap: Map<string, PDMTableSymbol> = new Map();
  private refSymbolMap: Map<string, PDMReferenceSymbol> = new Map();
  private selectedSymbolId: string | null = null;
  private hoveredSymbolId: string | null = null;
  private onSelectCallback: ((tableId: string | null) => void) | null = null;
  private scale: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;
  private isDragging: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private resizeObserver: ResizeObserver | null = null;
  private lastValidWidth: number = 800;
  private lastValidHeight: number = 600;

  // 样式
  private tableWidth: number = 180;
  private tableHeaderHeight: number = 30;
  private columnHeight: number = 24;
  private padding: number = 10;
  private headerBgColor: string = '#4a90d9';
  private headerTextColor: string = '#fff';
  private tableBgColor: string = '#fff';
  private tableBorderColor: string = '#333';
  private selectedBorderColor: string = '#1890ff';
  private hoverBorderColor: string = '#52c41a';
  private refLineColor: string = '#fa8c16';
  private refLineWidth: number = 1.5;
  private horizontalSpacing: number = 80;
  private verticalSpacing: number = 60;

  constructor(canvasId: string) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error(`Canvas element not found: ${canvasId}`);
    }
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }
    this.ctx = ctx;

    this.setupEventListeners();
    this.setupResizeObserver();
    this.resize();
  }

  private setupEventListeners() {
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
    this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
  }

  private setupResizeObserver() {
    const container = this.canvas.parentElement;
    if (container) {
      this.resizeObserver = new ResizeObserver(() => {
        this.resize();
      });
      this.resizeObserver.observe(container);
    }
  }

  private resize() {
    const container = this.canvas.parentElement;
    if (container && container.clientWidth > 0 && container.clientHeight > 0) {
      this.canvas.width = container.clientWidth;
      this.canvas.height = container.clientHeight;
      this.lastValidWidth = container.clientWidth;
      this.lastValidHeight = container.clientHeight;
      this.autoFit();
      this.render();
    }
  }

  // 设置数据
  setData(diagram: PDMDiagram | undefined, tables: PDMTable[]) {
    this.tables.clear();
    this.symbolMap.clear();
    this.refSymbolMap.clear();

    tables.forEach(t => this.tables.set(t.id, t));

    // 始终使用自动生成的布局
    this.diagram = this.generateDiagramFromTables(tables);
    console.log('Generated ER diagram:', this.diagram);

    if (this.diagram.tableSymbols.length > 0) {
      this.diagram.tableSymbols.forEach(s => this.symbolMap.set(s.objectId, s));
      this.diagram.referenceSymbols.forEach(s => this.refSymbolMap.set(s.id, s));
    }

    // 如果当前画布尺寸有效，直接计算
    if (this.canvas.width > 0 && this.canvas.height > 0) {
      this.autoFit();
      this.render();
    } else {
      // 使用保存的有效尺寸先渲染一次（会使用默认scale）
      this.canvas.width = this.lastValidWidth;
      this.canvas.height = this.lastValidHeight;
      this.autoFit();
      this.render();
    }
  }

  // 根据表结构自动生成 ER 图布局
  private generateDiagramFromTables(tables: PDMTable[]): PDMDiagram {
    const tableSymbols: PDMTableSymbol[] = [];
    const referenceSymbols: PDMReferenceSymbol[] = [];
    const references: PDMReference[] = [];

    if (tables.length === 0) {
      return {
        id: 'generated',
        name: '自动生成的 ER 图',
        tableSymbols: [],
        referenceSymbols: [],
        references: []
      };
    }

    const cols = Math.ceil(Math.sqrt(tables.length));
    const tableWidthWithSpacing = this.tableWidth + this.horizontalSpacing;
    const tableMaxHeight = this.tableHeaderHeight + 8 * this.columnHeight + this.verticalSpacing;

    tables.forEach((table, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      const left = col * tableWidthWithSpacing + 50;
      const top = row * tableMaxHeight + 50;
      const right = left + this.tableWidth;
      const bottom = top + this.tableHeaderHeight + Math.min(table.columns.length, 8) * this.columnHeight + 10;

      const symbolId = generateTableId(table.id);
      tableSymbols.push({
        id: symbolId,
        objectId: table.id,
        rect: { left, top, right, bottom }
      });
    });

    // 查找外键关系
    tables.forEach((table) => {
      table.columns.forEach((col) => {
        const fkPattern = /^fk_/i;
        if (fkPattern.test(col.code)) {
          const refTableCode = col.code.replace(fkPattern, '').replace(/_id$/i, '');
          const refTable = tables.find(t =>
            t.code.toLowerCase() === refTableCode.toLowerCase() ||
            t.code.toLowerCase() === refTableCode.replace(/_/g, '').toLowerCase()
          );

          if (refTable && refTable.id !== table.id) {
            const sourceSymbol = tableSymbols.find(s => s.objectId === refTable.id);
            const destSymbol = tableSymbols.find(s => s.objectId === table.id);

            if (sourceSymbol && destSymbol) {
              const refId = `ref_${refTable.id}_${table.id}`;
              const sourceAnchor = sourceSymbol.rect.right < destSymbol.rect.left ? 2 : 0;
              const destAnchor = sourceSymbol.rect.right < destSymbol.rect.left ? 0 : 2;

              references.push({
                id: refId,
                name: `FK_${refTable.code}_${table.code}`,
                code: col.code,
                parentTableId: refTable.id,
                childTableId: table.id
              });

              referenceSymbols.push({
                id: refId,
                referenceId: refId,
                sourceSymbolId: sourceSymbol.id,
                destSymbolId: destSymbol.id,
                sourceAnchor,
                destAnchor
              });
            }
          }
        }
      });
    });

    return {
      id: 'generated',
      name: '自动生成的 ER 图',
      tableSymbols,
      referenceSymbols,
      references
    };
  }

  // 自动适应画布
  private autoFit() {
    if (!this.diagram || this.diagram.tableSymbols.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    this.diagram.tableSymbols.forEach(symbol => {
      minX = Math.min(minX, symbol.rect.left);
      minY = Math.min(minY, symbol.rect.top);
      maxX = Math.max(maxX, symbol.rect.right);
      maxY = Math.max(maxY, symbol.rect.bottom);
    });

    const contentWidth = maxX - minX + 100;
    const contentHeight = maxY - minY + 100;

    console.log('Content size:', contentWidth, contentHeight);
    console.log('Canvas size:', this.canvas.width, this.canvas.height);

    const scaleX = this.canvas.width / contentWidth;
    const scaleY = this.canvas.height / contentHeight;
    this.scale = Math.min(scaleX, scaleY, 2);

    // 如果scale为0（画布尺寸无效），使用默认scale
    if (this.scale <= 0 || !isFinite(this.scale)) {
      this.scale = 0.5;
    }

    console.log('Scale:', this.scale);

    const scaledWidth = contentWidth * this.scale;
    const scaledHeight = contentHeight * this.scale;
    this.offsetX = (this.canvas.width - scaledWidth) / 2;
    this.offsetY = (this.canvas.height - scaledHeight) / 2;

    console.log('Offset:', this.offsetX, this.offsetY);
  }

  onSelect(callback: (tableId: string | null) => void) {
    this.onSelectCallback = callback;
  }

  private handleClick(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const worldX = (x - this.offsetX) / this.scale;
    const worldY = (y - this.offsetY) / this.scale;

    let clickedTableId: string | null = null;

    if (this.diagram) {
      for (const symbol of this.diagram.tableSymbols) {
        const { left, top, right, bottom } = symbol.rect;
        if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
          clickedTableId = symbol.objectId;
          break;
        }
      }
    }

    this.selectedSymbolId = clickedTableId;
    this.render();

    if (this.onSelectCallback) {
      this.onSelectCallback(clickedTableId);
    }
  }

  private handleMouseMove(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.isDragging) {
      const dx = x - this.lastMouseX;
      const dy = y - this.lastMouseY;
      this.offsetX += dx;
      this.offsetY += dy;
      this.lastMouseX = x;
      this.lastMouseY = y;
      this.render();
      return;
    }

    const worldX = (x - this.offsetX) / this.scale;
    const worldY = (y - this.offsetY) / this.scale;

    let hoveredId: string | null = null;

    if (this.diagram) {
      for (const symbol of this.diagram.tableSymbols) {
        const { left, top, right, bottom } = symbol.rect;
        if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
          hoveredId = symbol.objectId;
          break;
        }
      }
    }

    if (hoveredId !== this.hoveredSymbolId) {
      this.hoveredSymbolId = hoveredId;
      this.canvas.style.cursor = hoveredId ? 'pointer' : 'grab';
      this.render();
    }
  }

  private handleMouseDown(e: MouseEvent) {
    this.isDragging = true;
    const rect = this.canvas.getBoundingClientRect();
    this.lastMouseX = e.clientX - rect.left;
    this.lastMouseY = e.clientY - rect.top;
    this.canvas.style.cursor = 'grabbing';
  }

  private handleMouseUp() {
    this.isDragging = false;
    this.canvas.style.cursor = this.hoveredSymbolId ? 'pointer' : 'grab';
  }

  private handleMouseLeave() {
    this.hoveredSymbolId = null;
    this.isDragging = false;
    this.render();
  }

  // 鼠标滚轮缩放
  private handleWheel(e: WheelEvent) {
    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 计算鼠标位置对应的世界坐标
    const worldX = (mouseX - this.offsetX) / this.scale;
    const worldY = (mouseY - this.offsetY) / this.scale;

    // 缩放因子
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, this.scale * zoomFactor));

    if (newScale !== this.scale) {
      this.scale = newScale;

      // 调整偏移量以保持鼠标位置不变
      this.offsetX = mouseX - worldX * this.scale;
      this.offsetY = mouseY - worldY * this.scale;

      this.render();
    }
  }

  render() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, width, height);

    if (!this.diagram || this.diagram.tableSymbols.length === 0) {
      ctx.fillStyle = '#999';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('没有可显示的表结构', width / 2, height / 2);
      return;
    }

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    this.diagram.referenceSymbols.forEach(refSymbol => {
      this.drawReferenceLine(refSymbol);
    });

    this.diagram.tableSymbols.forEach(symbol => {
      this.drawTable(symbol);
    });

    ctx.restore();
  }

  private drawReferenceLine(refSymbol: PDMReferenceSymbol) {
    const sourceSymbol = this.symbolMap.get(refSymbol.sourceSymbolId);
    const destSymbol = this.symbolMap.get(refSymbol.destSymbolId);

    if (!sourceSymbol || !destSymbol) return;

    const start = getAnchorPoint(sourceSymbol.rect, refSymbol.sourceAnchor);
    const end = getAnchorPoint(destSymbol.rect, refSymbol.destAnchor);

    const ctx = this.ctx;

    ctx.strokeStyle = this.refLineColor;
    ctx.lineWidth = this.refLineWidth;

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    this.drawArrow(end.x, end.y, refSymbol.destAnchor);
  }

  private drawArrow(x: number, y: number, anchor: number) {
    const ctx = this.ctx;
    const arrowSize = 8 / this.scale;

    let angle: number;
    switch (anchor) {
      case 0: angle = 0; break;
      case 1: angle = Math.PI / 2; break;
      case 2: angle = Math.PI; break;
      case 3: angle = -Math.PI / 2; break;
      default: angle = 0;
    }

    ctx.fillStyle = this.refLineColor;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(
      x - arrowSize * Math.cos(angle - Math.PI / 6),
      y - arrowSize * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      x - arrowSize * Math.cos(angle + Math.PI / 6),
      y - arrowSize * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  private drawTable(symbol: PDMTableSymbol) {
    const ctx = this.ctx;
    const table = this.tables.get(symbol.objectId);
    if (!table) return;

    const { left, top, right, bottom } = symbol.rect;
    const width = right - left;
    const height = bottom - top;

    const isSelected = this.selectedSymbolId === symbol.objectId;
    const isHovered = this.hoveredSymbolId === symbol.objectId;

    ctx.fillStyle = this.tableBgColor;
    ctx.fillRect(left, top, width, height);

    ctx.strokeStyle = isSelected ? this.selectedBorderColor : (isHovered ? this.hoveredBorderColor : this.tableBorderColor);
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeRect(left, top, width, height);

    ctx.fillStyle = this.headerBgColor;
    ctx.fillRect(left, top, width, this.tableHeaderHeight);

    ctx.fillStyle = this.headerTextColor;
    ctx.font = `bold ${12 / this.scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const tableName = table.name || table.code;
    const maxChars = Math.floor(width / 8);
    const displayName = tableName.length > maxChars ? tableName.substring(0, maxChars - 2) + '...' : tableName;
    ctx.fillText(displayName, left + width / 2, top + this.tableHeaderHeight / 2);

    const visibleColumns = table.columns.slice(0, 8);
    visibleColumns.forEach((col, index) => {
      const colY = top + this.tableHeaderHeight + index * this.columnHeight + this.columnHeight / 2;

      ctx.fillStyle = '#333';
      ctx.font = `${11 / this.scale}px sans-serif`;
      ctx.textAlign = 'left';
      const colName = col.name.length > 10 ? col.name.substring(0, 10) + '...' : col.name;
      ctx.fillText(colName, left + this.padding, colY);

      ctx.fillStyle = '#666';
      ctx.textAlign = 'right';
      const dtype = col.dataType + (col.length ? `(${col.length})` : '');
      const dtypeDisplay = dtype.length > 12 ? dtype.substring(0, 12) + '...' : dtype;
      ctx.fillText(dtypeDisplay, right - this.padding, colY);
    });

    if (table.columns.length > 8) {
      ctx.fillStyle = '#999';
      ctx.textAlign = 'center';
      ctx.fillText('...', left + width / 2, top + this.tableHeaderHeight + 8 * this.columnHeight + this.columnHeight / 2);
    }
  }

  clear() {
    this.diagram = undefined;
    this.tables.clear();
    this.symbolMap.clear();
    this.refSymbolMap.clear();
    this.selectedSymbolId = null;
    this.hoveredSymbolId = null;
    this.render();
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
}
