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
  parentColumnCodes?: string[];
  childColumnCodes?: string[];
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
  primaryKey?: {
    columnRefs: string[];
  };
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
  private dragMoved: boolean = false;
  private isDraggingTable: boolean = false; // 是否在拖拽表格
  private draggingTableId: string | null = null; // 正在拖拽的表格symbol id
  private dragStartVX: number = 0; // 拖拽开始时鼠标的虚拟X
  private dragStartVY: number = 0; // 拖拽开始时鼠标的虚拟Y
  private tableStartLeft: number = 0; // 拖拽开始时表格的left
  private tableStartTop: number = 0; // 拖拽开始时表格的top
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private resizeObserver: ResizeObserver | null = null;
  private lastValidWidth: number = 800;
  private lastValidHeight: number = 600;

  // 像素坐标布局（从PDM坐标转换而来）
  private tablePixelRects: Map<string, { left: number; top: number; right: number; bottom: number }> = new Map();
  private virtualWidth: number = 0;
  private virtualHeight: number = 0;

  // 样式
  private tableWidth: number = 200;
  private tableHeaderHeight: number = 30;
  private columnHeight: number = 22;
  private padding: number = 8;
  private headerBgColor: string = '#4a90d9';
  private headerTextColor: string = '#fff';
  private tableBgColor: string = '#fff';
  private tableBorderColor: string = '#333';
  private selectedBorderColor: string = '#1890ff';
  private hoverBorderColor: string = '#52c41a';
  private refLineColor: string = '#fa8c16';
  private refLineWidth: number = 2;
  private horizontalSpacing: number = 60;
  private verticalSpacing: number = 40;

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
    this.canvas.addEventListener('dblclick', (e) => this.handleDblClick(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
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
  setData(diagram: PDMDiagram | undefined, tables: PDMTable[], references?: PDMReference[]) {
    this.tables.clear();
    this.symbolMap.clear();
    this.refSymbolMap.clear();
    this.tablePixelRects.clear();

    tables.forEach(t => this.tables.set(t.id, t));

    if (diagram && diagram.tableSymbols && diagram.tableSymbols.length > 0) {
      this.diagram = diagram;
    } else {
      this.diagram = this.generateDiagramFromTables(tables, references || []);
    }

    if (this.diagram.tableSymbols.length > 0) {
      this.diagram.tableSymbols.forEach(s => {
        this.symbolMap.set(s.id, s);
        if (s.objectId) {
          this.symbolMap.set(s.objectId, s);
        }
      });

      if (this.diagram.referenceSymbols) {
        this.diagram.referenceSymbols.forEach(s => {
          if (s && s.id) {
            this.refSymbolMap.set(s.id, s);
          }
        });
      }
    }

    // 计算像素坐标布局
    this.computePixelLayout();

    if (this.canvas.width > 0 && this.canvas.height > 0) {
      this.autoFit();
      this.render();
    } else {
      this.canvas.width = this.lastValidWidth;
      this.canvas.height = this.lastValidHeight;
      this.autoFit();
      this.render();
    }
  }

  // 从PDM坐标计算像素坐标布局（使用网格分配防止重叠）
  private computePixelLayout() {
    if (!this.diagram || this.diagram.tableSymbols.length === 0) return;

    const symbols = this.diagram.tableSymbols;

    // 1. 收集PDM中心点
    const centers: Array<{ id: string; x: number; y: number }> = [];
    let minCX = Infinity, minCY = Infinity, maxCX = -Infinity, maxCY = -Infinity;

    symbols.forEach(symbol => {
      const cx = (symbol.rect.left + symbol.rect.right) / 2;
      const cy = (symbol.rect.top + symbol.rect.bottom) / 2;
      centers.push({ id: symbol.id, x: cx, y: cy });
      minCX = Math.min(minCX, cx);
      minCY = Math.min(minCY, cy);
      maxCX = Math.max(maxCX, cx);
      maxCY = Math.max(maxCY, cy);
    });

    // 2. 计算每个表的像素高度
    const tablePixelHeights: Map<string, number> = new Map();
    symbols.forEach(symbol => {
      const table = this.tables.get(symbol.objectId);
      const colCount = table ? Math.min(table.columns.length, 8) : 4;
      const height = this.tableHeaderHeight + colCount * this.columnHeight + 10;
      tablePixelHeights.set(symbol.id, height);
    });

    let maxTableHeight = 0;
    tablePixelHeights.forEach(h => { if (h > maxTableHeight) maxTableHeight = h; });

    // 3. 基于PDM坐标将表分配到网格格子中（防止重叠）
    const cols = Math.max(1, Math.ceil(Math.sqrt(symbols.length * 1.2)));
    const rows = Math.ceil(symbols.length / cols);

    // 单元格大小
    const cellWidth = this.tableWidth + this.horizontalSpacing;
    const cellHeight = maxTableHeight + this.verticalSpacing;

    // 将归一化坐标映射到网格索引
    const rangeCX = Math.max(maxCX - minCX, 1);
    const rangeCY = Math.max(maxCY - minCY, 1);

    // 为每个表计算网格位置（基于PDM相对位置）
    const gridAssignments: Array<{ id: string; col: number; row: number }> = [];
    const occupiedCells = new Set<string>();

    // 按PDM坐标排序：先按Y再按X（从上到下，从左到右）
    const sortedCenters = [...centers].sort((a, b) => {
      const nyA = (a.y - minCY) / rangeCY;
      const nyB = (b.y - minCY) / rangeCY;
      if (Math.abs(nyA - nyB) > 0.1) return nyA - nyB;
      return (a.x - minCX) / rangeCX - (b.x - minCX) / rangeCX;
    });

    sortedCenters.forEach(c => {
      // 将PDM坐标归一化到0-1
      const nx = (c.x - minCX) / rangeCX;
      const ny = (c.y - minCY) / rangeCY;

      // 计算初始网格位置
      let col = Math.round(nx * (cols - 1));
      let row = Math.round(ny * (rows - 1));

      // 确保在有效范围内
      col = Math.max(0, Math.min(cols - 1, col));
      row = Math.max(0, Math.min(rows - 1, row));

      // 如果格子已被占用，找最近的空格子
      const cellKey = `${col},${row}`;
      if (occupiedCells.has(cellKey)) {
        const emptyCell = this.findNearestEmptyCell(col, row, cols, rows, occupiedCells);
        col = emptyCell.col;
        row = emptyCell.row;
      }

      occupiedCells.add(`${col},${row}`);
      gridAssignments.push({ id: c.id, col, row });
    });

    // 4. 计算虚拟画布大小
    const maxCol = Math.max(...gridAssignments.map(a => a.col));
    const maxRow = Math.max(...gridAssignments.map(a => a.row));

    this.virtualWidth = (maxCol + 1) * cellWidth + this.horizontalSpacing;
    this.virtualHeight = (maxRow + 1) * cellHeight + this.verticalSpacing;

    // 5. 生成像素坐标
    this.tablePixelRects.clear();
    gridAssignments.forEach(assignment => {
      const tableHeight = tablePixelHeights.get(assignment.id) || maxTableHeight;

      const px = this.horizontalSpacing + assignment.col * cellWidth;
      const py = this.verticalSpacing + assignment.row * cellHeight;

      this.tablePixelRects.set(assignment.id, {
        left: px,
        top: py,
        right: px + this.tableWidth,
        bottom: py + tableHeight
      });
    });
  }

  // 找到最近的空格子
  private findNearestEmptyCell(startCol: number, startRow: number, cols: number, rows: number, occupied: Set<string>): { col: number; row: number } {
    // 螺旋搜索
    for (let dist = 1; dist <= Math.max(cols, rows); dist++) {
      for (let dr = -dist; dr <= dist; dr++) {
        for (let dc = -dist; dc <= dist; dc++) {
          if (Math.abs(dr) !== dist && Math.abs(dc) !== dist) continue;
          const c = startCol + dc;
          const r = startRow + dr;
          if (c >= 0 && c < cols && r >= 0 && r < rows && !occupied.has(`${c},${r}`)) {
            return { col: c, row: r };
          }
        }
      }
    }
    // 兜底：追加一行
    return { col: startCol, row: rows };
  }

  // 根据表结构自动生成 ER 图布局
  private generateDiagramFromTables(tables: PDMTable[], references: PDMReference[]): PDMDiagram {
    const tableSymbols: PDMTableSymbol[] = [];
    const referenceSymbols: PDMReferenceSymbol[] = [];

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

    references.forEach((ref) => {
      const sourceSymbol = tableSymbols.find(s => s.objectId === ref.parentTableId);
      const destSymbol = tableSymbols.find(s => s.objectId === ref.childTableId);

      if (sourceSymbol && destSymbol) {
        const sourceAnchor = sourceSymbol.rect.right < destSymbol.rect.left ? 2 :
                            (sourceSymbol.rect.left > destSymbol.rect.right ? 0 :
                            (sourceSymbol.rect.bottom < destSymbol.rect.top ? 3 : 1));
        const destAnchor = sourceSymbol.rect.right < destSymbol.rect.left ? 0 :
                         (sourceSymbol.rect.left > destSymbol.rect.right ? 2 :
                         (sourceSymbol.rect.bottom < destSymbol.rect.top ? 1 : 3));

        referenceSymbols.push({
          id: ref.id,
          referenceId: ref.id,
          sourceSymbolId: sourceSymbol.id,
          destSymbolId: destSymbol.id,
          sourceAnchor,
          destAnchor
        });
      }
    });

    return {
      id: 'generated',
      name: '自动生成的 ER 图',
      tableSymbols,
      referenceSymbols,
      references
    };
  }

  // 更新虚拟画布大小（拖拽表格后调用）
  private updateVirtualSize() {
    if (!this.diagram || this.tablePixelRects.size === 0) return;

    let maxRight = 0;
    let maxBottom = 0;
    this.tablePixelRects.forEach(rect => {
      maxRight = Math.max(maxRight, rect.right);
      maxBottom = Math.max(maxBottom, rect.bottom);
    });

    this.virtualWidth = Math.max(this.virtualWidth, maxRight + this.horizontalSpacing);
    this.virtualHeight = Math.max(this.virtualHeight, maxBottom + this.verticalSpacing);
  }

  // 自动适应画布
  private autoFit() {
    if (!this.diagram || this.diagram.tableSymbols.length === 0) return;
    if (this.virtualWidth <= 0 || this.virtualHeight <= 0) return;

    const scaleX = this.canvas.width / this.virtualWidth;
    const scaleY = this.canvas.height / this.virtualHeight;
    this.scale = Math.min(scaleX, scaleY, 1);

    // 居中显示
    this.offsetX = (this.canvas.width - this.virtualWidth * this.scale) / 2;
    this.offsetY = (this.canvas.height - this.virtualHeight * this.scale) / 2;
  }

  onSelect(callback: (tableId: string | null) => void) {
    this.onSelectCallback = callback;
  }

  // 将画布坐标转换为虚拟坐标
  private canvasToVirtual(cx: number, cy: number): { x: number; y: number } {
    return {
      x: (cx - this.offsetX) / this.scale,
      y: (cy - this.offsetY) / this.scale
    };
  }

  // 查找虚拟坐标下的表格symbol id
  private findTableAtVirtual(vx: number, vy: number): string | null {
    if (!this.diagram) return null;
    for (const symbol of this.diagram.tableSymbols) {
      const pixelRect = this.tablePixelRects.get(symbol.id);
      if (pixelRect && vx >= pixelRect.left && vx <= pixelRect.right && vy >= pixelRect.top && vy <= pixelRect.bottom) {
        return symbol.id;
      }
    }
    return null;
  }

  // 通过symbol id获取objectId
  private getObjectIdBySymbolId(symbolId: string): string | null {
    const symbol = this.symbolMap.get(symbolId);
    return symbol ? symbol.objectId : null;
  }

  // 双击查看表详情
  private handleDblClick(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { x: vx, y: vy } = this.canvasToVirtual(cx, cy);

    const hitSymbolId = this.findTableAtVirtual(vx, vy);
    const clickedTableId = hitSymbolId ? this.getObjectIdBySymbolId(hitSymbolId) : null;

    if (clickedTableId) {
      this.selectedSymbolId = clickedTableId;
      this.render();

      if (this.onSelectCallback) {
        this.onSelectCallback(clickedTableId);
      }
    }
  }

  private handleMouseMove(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // 拖拽表格
    if (this.isDraggingTable && this.draggingTableId) {
      const { x: vx, y: vy } = this.canvasToVirtual(cx, cy);
      const dx = vx - this.dragStartVX;
      const dy = vy - this.dragStartVY;

      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        this.dragMoved = true;
      }

      const pixelRect = this.tablePixelRects.get(this.draggingTableId);
      if (pixelRect) {
        const w = pixelRect.right - pixelRect.left;
        const h = pixelRect.bottom - pixelRect.top;
        const newLeft = this.tableStartLeft + dx;
        const newTop = this.tableStartTop + dy;
        this.tablePixelRects.set(this.draggingTableId, {
          left: newLeft,
          top: newTop,
          right: newLeft + w,
          bottom: newTop + h
        });
        this.render();
      }
      return;
    }

    // 拖拽画布
    if (this.isDragging) {
      const dx = cx - this.lastMouseX;
      const dy = cy - this.lastMouseY;

      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        this.dragMoved = true;
      }

      this.offsetX += dx;
      this.offsetY += dy;
      this.lastMouseX = cx;
      this.lastMouseY = cy;
      this.render();
      return;
    }

    // 非拖动时检测悬停
    const { x: vx, y: vy } = this.canvasToVirtual(cx, cy);
    const hoveredSymbolId = this.findTableAtVirtual(vx, vy);
    const hoveredId = hoveredSymbolId ? this.getObjectIdBySymbolId(hoveredSymbolId) : null;

    if (hoveredId !== this.hoveredSymbolId) {
      this.hoveredSymbolId = hoveredId;
      // 如果在已选中的表上，显示移动光标
      if (hoveredId && hoveredId === this.selectedSymbolId) {
        this.canvas.style.cursor = 'move';
      } else {
        this.canvas.style.cursor = hoveredId ? 'pointer' : 'grab';
      }
      this.render();
    }
  }

  private handleMouseDown(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { x: vx, y: vy } = this.canvasToVirtual(cx, cy);

    const hitSymbolId = this.findTableAtVirtual(vx, vy);
    const hitObjectId = hitSymbolId ? this.getObjectIdBySymbolId(hitSymbolId) : null;

    if (hitObjectId && hitObjectId === this.selectedSymbolId) {
      // 点击已选中的表格 → 进入表格拖拽模式
      this.isDraggingTable = true;
      this.draggingTableId = hitSymbolId;
      this.dragMoved = false;
      this.dragStartVX = vx;
      this.dragStartVY = vy;
      const pixelRect = this.tablePixelRects.get(hitSymbolId);
      if (pixelRect) {
        this.tableStartLeft = pixelRect.left;
        this.tableStartTop = pixelRect.top;
      }
      this.canvas.style.cursor = 'move';
    } else if (hitObjectId) {
      // 点击未选中的表格 → 选中它
      this.selectedSymbolId = hitObjectId;
      this.isDragging = false;
      this.isDraggingTable = false;
      this.canvas.style.cursor = 'pointer';
      this.render();
    } else {
      // 点击空白区域 → 进入画布拖拽模式
      this.selectedSymbolId = null;
      this.isDragging = true;
      this.isDraggingTable = false;
      this.dragMoved = false;
      this.lastMouseX = cx;
      this.lastMouseY = cy;
      this.canvas.style.cursor = 'grabbing';
      this.render();
    }
  }

  private handleMouseUp(e: MouseEvent) {
    const wasTableDragging = this.isDraggingTable;
    const wasCanvasDragging = this.isDragging;
    const hadMoved = this.dragMoved;

    this.isDragging = false;
    this.isDraggingTable = false;
    this.draggingTableId = null;
    this.dragMoved = false;

    // 拖拽表格结束（不需要额外处理，位置已更新）
    if (wasTableDragging) {
      // 更新虚拟画布大小以适应新位置
      this.updateVirtualSize();
    }

    // 画布拖拽没有移动 → 取消选中
    if (wasCanvasDragging && !hadMoved) {
      this.selectedSymbolId = null;
      this.render();
    }

    // 更新光标
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { x: vx, y: vy } = this.canvasToVirtual(cx, cy);
    const hoveredSymbolId = this.findTableAtVirtual(vx, vy);
    const hoveredId = hoveredSymbolId ? this.getObjectIdBySymbolId(hoveredSymbolId) : null;
    if (hoveredId && hoveredId === this.selectedSymbolId) {
      this.canvas.style.cursor = 'move';
    } else {
      this.canvas.style.cursor = hoveredId ? 'pointer' : 'grab';
    }
  }

  private handleMouseLeave() {
    this.hoveredSymbolId = null;
    this.isDragging = false;
    this.isDraggingTable = false;
    this.draggingTableId = null;
    this.dragMoved = false;
    this.canvas.style.cursor = 'grab';
    this.render();
  }

  // 鼠标滚轮缩放
  private handleWheel(e: WheelEvent) {
    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 缩放前的虚拟坐标
    const vx = (mouseX - this.offsetX) / this.scale;
    const vy = (mouseY - this.offsetY) / this.scale;

    // 缩放因子
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(3, this.scale * zoomFactor));

    if (newScale !== this.scale) {
      this.scale = newScale;

      // 保持鼠标位置不变
      this.offsetX = mouseX - vx * this.scale;
      this.offsetY = mouseY - vy * this.scale;

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

    // 先绘制表格
    this.diagram.tableSymbols.forEach(symbol => {
      this.drawTable(symbol);
    });

    // 再绘制连线（在表格上层，箭头不会被遮挡）
    this.diagram.referenceSymbols.forEach(refSymbol => {
      this.drawReferenceLine(refSymbol);
    });

    ctx.restore();
  }

  private drawReferenceLine(refSymbol: PDMReferenceSymbol) {
    const sourcePixelRect = this.tablePixelRects.get(refSymbol.sourceSymbolId);
    const destPixelRect = this.tablePixelRects.get(refSymbol.destSymbolId);

    if (!sourcePixelRect || !destPixelRect) return;

    const ctx = this.ctx;

    // 查找关联的reference获取join列信息
    // referenceId已在parser中从短ID转换为GUID
    const reference = this.diagram?.references.find(r => r.id === refSymbol.referenceId);
    const sourceObjectId = this.getObjectIdBySymbolId(refSymbol.sourceSymbolId);
    const destObjectId = this.getObjectIdBySymbolId(refSymbol.destSymbolId);

    // PDM中: sourceSymbol = child表(含外键), destSymbol = parent表(被引用)
    // ER图方向: parent → child (从parent右侧出, 到child左侧入, 箭头在child端)
    let parentRect: { left: number; top: number; right: number; bottom: number };
    let childRect: { left: number; top: number; right: number; bottom: number };
    let parentSymbolId: string;
    let childSymbolId: string;

    if (sourceObjectId === reference?.parentTableId) {
      parentRect = sourcePixelRect;
      childRect = destPixelRect;
      parentSymbolId = refSymbol.sourceSymbolId;
      childSymbolId = refSymbol.destSymbolId;
    } else {
      parentRect = destPixelRect;
      childRect = sourcePixelRect;
      parentSymbolId = refSymbol.destSymbolId;
      childSymbolId = refSymbol.sourceSymbolId;
    }

    // 计算parent端Y坐标（指向parent表的主键字段行）
    let startY = this.getColumnRowY(parentSymbolId, reference?.parentColumnCodes || [], 'parent');
    if (startY === -1) {
      startY = (parentRect.top + parentRect.bottom) / 2;
    }

    // 计算child端Y坐标（指向child表的外键字段行）
    let endY = this.getColumnRowY(childSymbolId, reference?.childColumnCodes || [], 'child');
    if (endY === -1) {
      endY = (childRect.top + childRect.bottom) / 2;
    }

    // 从parent右侧出, child左侧入
    const startX = parentRect.right;
    // 箭头在child表左边缘外侧, 留出箭头大小空间
    const arrowSize = 10;
    const endX = childRect.left - arrowSize;

    // 绘制连线
    ctx.strokeStyle = this.refLineColor;
    ctx.lineWidth = this.refLineWidth;
    ctx.beginPath();
    ctx.moveTo(startX, startY);

    if (endX > startX) {
      // 正常情况: parent在左, child在右, 使用折线
      const midX = (startX + endX) / 2;
      ctx.lineTo(midX, startY);
      ctx.lineTo(midX, endY);
      ctx.lineTo(endX, endY);
    } else {
      // 表逆向排列时, 绕行
      const offset = 30;
      const bypassY = Math.max(parentRect.bottom, childRect.bottom) + offset;
      ctx.lineTo(startX + offset, startY);
      ctx.lineTo(startX + offset, bypassY);
      ctx.lineTo(childRect.left - arrowSize - offset, bypassY);
      ctx.lineTo(childRect.left - arrowSize - offset, endY);
      ctx.lineTo(endX, endY);
    }
    ctx.stroke();

    // 箭头在child端左边缘外侧, 指向右侧(指向child表内部)
    this.drawArrowRight(endX, endY);
  }

  // 获取列在表格中的Y坐标
  private getColumnRowY(symbolId: string, columnCodes: string[], label: string): number {
    const pixelRect = this.tablePixelRects.get(symbolId);
    const symbol = this.symbolMap.get(symbolId);
    if (!pixelRect || !symbol) {
      return -1;
    }

    const table = this.tables.get(symbol.objectId);
    if (!table) {
      return -1;
    }

    let colIndex = -1;

    // 策略1: 通过columnCodes精确匹配列code
    if (columnCodes.length > 0) {
      for (const code of columnCodes) {
        if (!code) continue;
        const idx = table.columns.findIndex(c =>
          c.code === code || c.id === code || c.name === code
        );
        if (idx >= 0 && idx < 8) {
          colIndex = idx;
          break;
        }
      }
    }

    // 策略2: 查找child表中的外键列（名称中包含parent表名）
    if (colIndex === -1) {
      const ref = this.diagram?.references.find(r =>
        r.childTableId === symbol.objectId || r.parentTableId === symbol.objectId
      );
      if (ref) {
        const parentId = ref.parentTableId;
        const parentTable = this.tables.get(parentId);
        if (parentTable) {
          const parentCode = parentTable.code.toLowerCase();
          const idx = table.columns.findIndex(c =>
            c.code.toLowerCase().includes(parentCode) ||
            c.name.toLowerCase().includes(parentCode)
          );
          if (idx >= 0 && idx < 8) {
            colIndex = idx;
          }
        }
      }
    }

    // 策略3: 查找名称中包含"id"的列
    if (colIndex === -1) {
      const idx = table.columns.findIndex(c =>
        c.code.toLowerCase().endsWith('id') || c.name.toLowerCase().endsWith('id')
      );
      if (idx >= 0 && idx < 8) {
        colIndex = idx;
      }
    }

    if (colIndex === -1) return -1;

    return pixelRect.top + this.tableHeaderHeight + colIndex * this.columnHeight + this.columnHeight / 2;
  }

  // 绘制指向右侧的箭头（在child表的左边缘，指向表内部）
  private drawArrowRight(x: number, y: number) {
    const ctx = this.ctx;
    const arrowSize = 10;

    // 箭头尖端在x+arrowSize位置(指向右), 箭头体向左延伸
    ctx.fillStyle = this.refLineColor;
    ctx.beginPath();
    ctx.moveTo(x + arrowSize, y);
    ctx.lineTo(x, y - arrowSize * 0.6);
    ctx.lineTo(x, y + arrowSize * 0.6);
    ctx.closePath();
    ctx.fill();

    // 描边
    ctx.strokeStyle = '#d46b08';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawTable(symbol: PDMTableSymbol) {
    const ctx = this.ctx;
    const table = this.tables.get(symbol.objectId);
    if (!table) return;

    const pixelRect = this.tablePixelRects.get(symbol.id);
    if (!pixelRect) return;

    const { left, top, right, bottom } = pixelRect;
    const width = right - left;
    const height = bottom - top;

    const isSelected = this.selectedSymbolId === symbol.objectId;
    const isHovered = this.hoveredSymbolId === symbol.objectId;

    // 阴影
    if (isSelected || isHovered) {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(left + 3, top + 3, width, height);
    }

    // 表格背景
    ctx.fillStyle = this.tableBgColor;
    ctx.fillRect(left, top, width, height);

    // 表格边框
    ctx.strokeStyle = isSelected ? this.selectedBorderColor : (isHovered ? this.hoverBorderColor : this.tableBorderColor);
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeRect(left, top, width, height);

    // 表头背景
    ctx.fillStyle = this.headerBgColor;
    ctx.fillRect(left, top, width, this.tableHeaderHeight);

    // 表头文字
    ctx.fillStyle = this.headerTextColor;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const tableName = table.name || table.code;
    const maxChars = Math.floor((width - 2 * this.padding) / 8);
    const displayName = tableName.length > maxChars ? tableName.substring(0, maxChars - 2) + '...' : tableName;
    ctx.fillText(displayName, left + width / 2, top + this.tableHeaderHeight / 2);

    // 列信息
    const pkColumnRefs = new Set(table.primaryKey?.columnRefs || []);
    const visibleColumns = table.columns.slice(0, 8);
    visibleColumns.forEach((col, index) => {
      const colY = top + this.tableHeaderHeight + index * this.columnHeight + this.columnHeight / 2;

      // 行分割线
      ctx.strokeStyle = '#e8e8e8';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(left, top + this.tableHeaderHeight + index * this.columnHeight);
      ctx.lineTo(right, top + this.tableHeaderHeight + index * this.columnHeight);
      ctx.stroke();

      const isPK = pkColumnRefs.has(col.code) || pkColumnRefs.has(col.id);

      // 主键图标
      let textOffset = left + this.padding;
      if (isPK) {
        ctx.fillStyle = '#e6a700';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('PK', textOffset, colY);
        textOffset += 18;
      }

      ctx.fillStyle = isPK ? '#1a1a1a' : '#333';
      ctx.font = isPK ? 'bold 11px sans-serif' : '11px sans-serif';
      ctx.textAlign = 'left';
      const maxNameLen = isPK ? 9 : 12;
      const colName = col.name.length > maxNameLen ? col.name.substring(0, maxNameLen) + '...' : col.name;
      ctx.fillText(colName, textOffset, colY);

      ctx.fillStyle = '#666';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      const dtype = col.dataType + (col.length ? `(${col.length})` : '');
      const dtypeDisplay = dtype.length > 10 ? dtype.substring(0, 10) + '...' : dtype;
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
    this.tablePixelRects.clear();
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
