import { XMLParser } from 'fast-xml-parser';

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
  foreignKeyInfo?: {
    parentTableId: string;
    parentKeyId: string;
  };
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

export interface PDMReference {
  id: string;
  name: string;
  code: string;
  parentTableId: string;
  childTableId: string;
  parentTableCode?: string;
  childTableCode?: string;
  parentColumnCodes?: string[]; // 父表关联列的code列表
  childColumnCodes?: string[];   // 子表关联列的code列表
}

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

export interface PDMDiagram {
  id: string;
  name: string;
  tableSymbols: PDMTableSymbol[];
  referenceSymbols: PDMReferenceSymbol[];
  references: PDMReference[];
}

export interface PDMData {
  tables: PDMTable[];
  diagram?: PDMDiagram;
  references: PDMReference[];
  version?: string;
  author?: string;
  modelName?: string;
}

export class PDMParser {
  private parser: XMLParser;
  private idMap: Map<string, string>; // 映射短格式ID (如"o12") -> 表GUID
  private columnMap: Map<string, { tableId: string; code: string }>; // 映射列短格式ID -> {tableId, code}

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
      parseTagValue: true,
      trimValues: true,
      processEntities: false
      // entityExpansionLimit: 10000 // 这个属性在新版本中可能已被移除
    });
    this.idMap = new Map();
    this.columnMap = new Map();
  }

  parse(xmlContent: string): PDMData {
    const result = this.parser.parse(xmlContent);
    const modelNode = this.findModelNode(result);

    if (!modelNode) {
      throw new Error('Invalid PDM file: Model node not found');
    }

    const tables = this.parseTables(modelNode);
    const references = this.parseReferences(modelNode);
    const diagram = this.parseDiagram(modelNode, tables, references);

    return {
      tables,
      diagram,
      references,
      version: modelNode['@_Version'] || modelNode['Version'],
      author: modelNode['Author'] || modelNode['@_Author'],
      modelName: modelNode['a:Name'] || modelNode['Name']
    };
  }

  private findModelNode(obj: any): any {
    if (!obj || typeof obj !== 'object') return null;

    if (obj['Model']) {
      const model = obj['Model'];
      if (model['o:RootObject']?.['c:Children']?.['o:Model']) {
        return model['o:RootObject']['c:Children']['o:Model'];
      }
      if (model['o:Model']) {
        return model['o:Model'];
      }
      return model;
    }

    return null;
  }

  private extractObjects(collection: any, objectType: string): any[] {
    if (!collection) return [];

    if (Array.isArray(collection)) {
      return collection.filter((item: any) => item && typeof item === 'object');
    }

    const objects = collection['o:' + objectType] || collection[objectType];

    if (!objects) return [];

    return Array.isArray(objects) ? objects : [objects];
  }

  private parseNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseFloat(value) || 0;
    return 0;
  }

  private parseTables(model: any): PDMTable[] {
    const tablesCollection = model['c:Tables'] || model['Tables'];
    if (!tablesCollection) {
      return [];
    }

    const tableObjects = this.extractObjects(tablesCollection, 'Table');

    // 清除旧的映射表
    this.idMap.clear();

    // 建立ID映射
    if (tableObjects.length > 0) {
      const sampleTables = tableObjects.slice(0, Math.min(3, tableObjects.length));
      sampleTables.forEach((t: any) => {
        const tableId = t['a:ObjectID'] || t['@_ObjectID'] || t['ObjectID'] || '';
        const tableShortId = t['@_Id'] || '';
        if (tableShortId && tableId) {
          this.idMap.set(tableShortId, tableId);
        }
      });

      // 为所有表（不仅仅是样本）建立ID映射
      tableObjects.forEach((t: any) => {
        const tableId = t['a:ObjectID'] || t['@_ObjectID'] || t['ObjectID'] || '';
        const tableShortId = t['@_Id'] || '';
        if (tableShortId && tableId && !this.idMap.has(tableShortId)) {
          this.idMap.set(tableShortId, tableId);
        }
      });
    }

    return tableObjects.map((t: any) => this.parseTable(t));
  }

  private parseTable(tableXml: any): PDMTable {
    const id = tableXml['a:ObjectID'] || tableXml['@_ObjectID'] || tableXml['ObjectID'] || '';
    const name = tableXml['a:Name'] || tableXml['@_Name'] || tableXml['Name'] || '';
    const code = tableXml['a:Code'] || tableXml['@_Code'] || tableXml['Code'] || '';
    const comment = tableXml['a:Comment'] || tableXml['@_Comment'] || tableXml['Comment'] || '';

    const columns = this.parseColumns(tableXml, id);
    const keys = this.parseKeys(tableXml, columns);
    const primaryKey = this.findPrimaryKey(tableXml, keys, columns);

    return { id, name, code, comment, columns, primaryKey, keys };
  }

  private parseColumns(tableXml: any, tableId: string): PDMColumn[] {
    const columnsCollection = tableXml['c:Columns'] || tableXml['Columns'];
    if (!columnsCollection) return [];

    const columnObjects = this.extractObjects(columnsCollection, 'Column');
    return columnObjects.map((c: any) => {
      const col = this.parseColumn(c);
      // 构建列短ID映射
      const shortId = c['@_Id'] || '';
      if (shortId && col.code) {
        this.columnMap.set(shortId, { tableId, code: col.code });
      }
      if (col.id && col.code) {
        this.columnMap.set(col.id, { tableId, code: col.code });
      }
      return col;
    });
  }

  private parseColumn(columnXml: any): PDMColumn {
    return {
      id: columnXml['a:ObjectID'] || columnXml['@_ObjectID'] || columnXml['ObjectID'] || '',
      name: columnXml['a:Name'] || columnXml['@_Name'] || columnXml['Name'] || '',
      code: columnXml['a:Code'] || columnXml['@_Code'] || columnXml['Code'] || '',
      dataType: columnXml['a:DataType'] || columnXml['@_DataType'] || columnXml['DataType'] || 'unknown',
      length: columnXml['a:Length'] || columnXml['@_Length'] || columnXml['Length'] || '',
      precision: columnXml['a:Precision'] || columnXml['@_Precision'] || columnXml['Precision'] || '',
      nullable: columnXml['a:Mandatory'] === '0' || columnXml['@_Mandatory'] === '0' || columnXml['Mandatory'] === '0' || columnXml['Mandatory'] === false,
      identity: columnXml['a:Identity'] === '1' || columnXml['@_Identity'] === '1' || columnXml['Identity'] === '1' || columnXml['Identity'] === true,
      defaultValue: columnXml['a:DefaultValue'] || columnXml['@_DefaultValue'] || columnXml['DefaultValue'] || '',
      comment: columnXml['a:Comment'] || columnXml['@_Comment'] || columnXml['Comment'] || ''
    };
  }

  private parseKeys(tableXml: any, columns: PDMColumn[]): PDMKey[] {
    const keysCollection = tableXml['c:Keys'] || tableXml['Keys'];
    if (!keysCollection) return [];

    const keyObjects = this.extractObjects(keysCollection, 'Key');
    return keyObjects.map((k: any) => this.parseKey(k, columns));
  }

  private parseKey(keyXml: any, columns: PDMColumn[]): PDMKey {
    const id = keyXml['a:ObjectID'] || keyXml['@_ObjectID'] || keyXml['ObjectID'] || '';
    const name = keyXml['a:Name'] || keyXml['@_Name'] || keyXml['Name'] || '';
    const code = keyXml['a:Code'] || keyXml['@_Code'] || keyXml['Code'] || '';
    const keyType = this.isForeignKey(keyXml) ? 'foreign' : 'primary';
    const columnRefs = this.getKeyColumnRefs(keyXml, columns);

    let foreignKeyInfo = undefined;
    if (keyType === 'foreign') {
      // 尝试提取外键引用的父表和父键信息
      const parentTableId = this.extractForeignKeyParentTableId(keyXml);
      const parentKeyId = this.extractForeignKeyParentKeyId(keyXml);
      
      if (parentTableId) {
        foreignKeyInfo = { parentTableId, parentKeyId };
      }
    }

    return { id, name, code, type: keyType, columnRefs, foreignKeyInfo };
  }

  private isForeignKey(keyXml: any): boolean {
    return !!(
      keyXml['a:ForeignKeySourceTable'] || keyXml['@_ForeignKeySourceTable'] ||
      keyXml['ForeignKeySourceTable'] ||
      keyXml['c:ForeignKeySourceTable'] || keyXml['Reference']
    );
  }

  private extractForeignKeyParentTableId(keyXml: any): string {
    // 尝试多种可能的XML结构
    const fkSourceTable = keyXml['a:ForeignKeySourceTable'] || keyXml['@_ForeignKeySourceTable'] ||
                         keyXml['ForeignKeySourceTable'] || keyXml['c:ForeignKeySourceTable'];
    
    if (fkSourceTable) {
      if (typeof fkSourceTable === 'string') {
        return fkSourceTable;
      } else if (typeof fkSourceTable === 'object') {
        return fkSourceTable['a:ObjectID'] || fkSourceTable['@_ObjectID'] || fkSourceTable['ObjectID'] ||
               fkSourceTable['@_Ref'] || fkSourceTable['Ref'] || '';
      }
    }
    
    return '';
  }

  private extractForeignKeyParentKeyId(keyXml: any): string {
    const fkSourceKey = keyXml['a:ForeignKeySourceKey'] || keyXml['@_ForeignKeySourceKey'] ||
                       keyXml['ForeignKeySourceKey'] || keyXml['c:ForeignKeySourceKey'];
    
    if (fkSourceKey) {
      if (typeof fkSourceKey === 'string') {
        return fkSourceKey;
      } else if (typeof fkSourceKey === 'object') {
        return fkSourceKey['a:ObjectID'] || fkSourceKey['@_ObjectID'] || fkSourceKey['ObjectID'] ||
               fkSourceKey['@_Ref'] || fkSourceKey['Ref'] || '';
      }
    }
    
    return '';
  }

  private getKeyColumnRefs(keyXml: any, columns: PDMColumn[]): string[] {
    const keyColumns = keyXml['c:Key.Columns'] || keyXml['KeyColumns'] ||
                       keyXml['c:KeyColumn'] || keyXml['KeyColumn'] ||
                       keyXml['a:Key.Columns'] || keyXml['@_Key.Columns'];

    if (!keyColumns) return [];

    const refs = Array.isArray(keyColumns) ? keyColumns : [keyColumns];

    return refs.map((ref: any) => {
      if (typeof ref === 'string') return ref;
      if (typeof ref === 'object') {
        return ref['@_Ref'] || ref['Ref'] || ref['a:ObjectID'] || ref['@_ObjectID'] || ref['ObjectID'] || '';
      }
      return '';
    }).filter(Boolean);
  }

  private findPrimaryKey(tableXml: any, keys: PDMKey[], columns: PDMColumn[]): PDMKey | undefined {
    const primaryKeyCollection = tableXml['c:PrimaryKey'] || tableXml['PrimaryKey'];

    if (primaryKeyCollection) {
      const pkRef = primaryKeyCollection['o:Key'] || primaryKeyCollection['Key'] ||
                    primaryKeyCollection['@_Ref'] || primaryKeyCollection['Ref'] ||
                    primaryKeyCollection['a:ObjectID'] || primaryKeyCollection['@_ObjectID'];

      if (pkRef) {
        const pkId = typeof pkRef === 'string' ? pkRef : (pkRef['@_Ref'] || pkRef['Ref'] || pkRef['a:ObjectID'] || pkRef['@_ObjectID'] || pkRef['ObjectID'] || '');
        return keys.find(k => k.id === pkId);
      }
    }

    return keys.find(k => k.type === 'primary');
  }

  private parseReferences(model: any): PDMReference[] {
    const referencesCollection = model['c:References'] || model['References'];
    if (!referencesCollection) {
      return [];
    }

    const referenceObjects = this.extractObjects(referencesCollection, 'Reference');

    return referenceObjects.map((r: any) => this.parseReference(r));
  }

  private parseReference(refXml: any): PDMReference {
    const id = refXml['a:ObjectID'] || refXml['@_ObjectID'] || refXml['ObjectID'] || '';
    const name = refXml['a:Name'] || refXml['@_Name'] || refXml['Name'] || '';
    const code = refXml['a:Code'] || refXml['@_Code'] || refXml['Code'] || '';

    // 将reference的短ID加入idMap，以便referenceSymbol查找
    const shortId = refXml['@_Id'] || '';
    if (shortId && id) {
      this.idMap.set(shortId, id);
    }

    let parentTableId = '';
    let childTableId = '';

    // 方法1: 通过 c:ParentTable 和 c:ChildTable
    const parentTable = refXml['c:ParentTable'] || refXml['ParentTable'] || refXml['a:ParentTable'] || refXml['@_ParentTable'];
    const childTable = refXml['c:ChildTable'] || refXml['ChildTable'] || refXml['a:ChildTable'] || refXml['@_ChildTable'];

    if (parentTable) {
      const tableRef = parentTable['o:Table'] || parentTable['Table'] || parentTable;

      if (tableRef && typeof tableRef === 'object') {
        parentTableId = tableRef['a:ObjectID'] || tableRef['@_ObjectID'] || tableRef['ObjectID'] ||
                       tableRef['@_Ref'] || tableRef['Ref'] || '';
      } else if (typeof parentTable === 'string') {
        parentTableId = parentTable;
      }
    }

    if (childTable) {
      const tableRef = childTable['o:Table'] || childTable['Table'] || childTable;

      if (tableRef && typeof tableRef === 'object') {
        childTableId = tableRef['a:ObjectID'] || tableRef['@_ObjectID'] || tableRef['ObjectID'] ||
                      tableRef['@_Ref'] || tableRef['Ref'] || '';
      } else if (typeof childTable === 'string') {
        childTableId = childTable;
      }
    }

    // 方法2: 通过 @_ParentTable 和 @_ChildTable 属性
    if (!parentTableId || !childTableId) {
      parentTableId = refXml['@_ParentTable'] || parentTableId;
      childTableId = refXml['@_ChildTable'] || childTableId;
    }

    // 方法3: 通过 ParentTableRef 和 ChildTableRef
    if (!parentTableId || !childTableId) {
      const parentTableRef = refXml['c:ParentTableRef'] || refXml['ParentTableRef'] || refXml['a:ParentTableRef'];
      const childTableRef = refXml['c:ChildTableRef'] || refXml['ChildTableRef'] || refXml['a:ChildTableRef'];
      
      if (parentTableRef) {
        if (typeof parentTableRef === 'string') {
          parentTableId = parentTableRef;
        } else if (typeof parentTableRef === 'object') {
          parentTableId = parentTableRef['@_Ref'] || parentTableRef['Ref'] || parentTableRef['a:ObjectID'] || parentTableRef['@_ObjectID'] || '';
        }
      }
      
      if (childTableRef) {
        if (typeof childTableRef === 'string') {
          childTableId = childTableRef;
        } else if (typeof childTableRef === 'object') {
          childTableId = childTableRef['@_Ref'] || childTableRef['Ref'] || childTableRef['a:ObjectID'] || childTableRef['@_ObjectID'] || '';
        }
      }
    }

    // 如果仍然没有找到，尝试从外键名称推断（后备方案）
    if (!parentTableId || !childTableId) {
      // 如果找到的是短格式ID，尝试转换为对应的表GUID
      if (this.idMap.has(parentTableId)) {
        parentTableId = this.idMap.get(parentTableId)!;
      }

      if (this.idMap.has(childTableId)) {
        childTableId = this.idMap.get(childTableId)!;
      }
    }

    // 提取Joins中的列关联信息
    let parentColumnCodes: string[] = [];
    let childColumnCodes: string[] = [];

    const joins = refXml['c:Joins'] || refXml['Joins'];
    if (joins) {
      const joinObjects = this.extractObjects(joins, 'ReferenceJoin');
      joinObjects.forEach((j: any) => {
        // 提取子表列引用 (Object1 = child column)
        const childCol = j['c:Object1'] || j['Object1'];
        if (childCol) {
          const colRef = childCol['o:Column'] || childCol['Column'] || childCol;
          const colId = (typeof colRef === 'object')
            ? colRef['@_Ref'] || colRef['Ref'] || colRef['a:ObjectID'] || colRef['@_ObjectID'] || ''
            : (typeof childCol === 'string' ? childCol : '');
          if (colId) {
            // 通过columnMap解析为列code
            const mapped = this.columnMap.get(colId);
            childColumnCodes.push(mapped ? mapped.code : colId);
          }
        }
        // 提取父表列引用 (Object2 = parent column)
        const parentCol = j['c:Object2'] || j['Object2'];
        if (parentCol) {
          const colRef = parentCol['o:Column'] || parentCol['Column'] || parentCol;
          const colId = (typeof colRef === 'object')
            ? colRef['@_Ref'] || colRef['Ref'] || colRef['a:ObjectID'] || colRef['@_ObjectID'] || ''
            : (typeof parentCol === 'string' ? parentCol : '');
          if (colId) {
            const mapped = this.columnMap.get(colId);
            parentColumnCodes.push(mapped ? mapped.code : colId);
          }
        }
      });
    }

    return { id, name, code, parentTableId, childTableId, parentColumnCodes, childColumnCodes };
  }

  private parseDiagram(model: any, tables: PDMTable[], references: PDMReference[]): PDMDiagram | undefined {
    const diagramsCollection = model['c:PhysicalDiagrams'] || model['PhysicalDiagrams'];
    if (!diagramsCollection) return undefined;

    const diagramObjects = this.extractObjects(diagramsCollection, 'PhysicalDiagram');
    if (!diagramObjects || diagramObjects.length === 0) return undefined;

    const diagramXml = diagramObjects[0];
    const diagramId = diagramXml['a:ObjectID'] || diagramXml['@_ObjectID'] || '';
    const diagramName = diagramXml['a:Name'] || diagramXml['@_Name'] || diagramXml['Name'] || 'ER Diagram';

    const symbolsCollection = diagramXml['c:Symbols'] || diagramXml['Symbols'];

    const tableSymbols: PDMTableSymbol[] = [];
    const referenceSymbols: PDMReferenceSymbol[] = [];

    if (symbolsCollection) {
      const tableSymbolObjects = this.extractObjects(symbolsCollection, 'TableSymbol');
      tableSymbolObjects.forEach((ts: any) => {
        const symbol = this.parseTableSymbol(ts);
        if (symbol) tableSymbols.push(symbol);
      });

      const refSymbolObjects = this.extractObjects(symbolsCollection, 'ReferenceSymbol');
      refSymbolObjects.forEach((rs: any) => {
        const symbol = this.parseReferenceSymbol(rs);
        if (symbol) {
          referenceSymbols.push(symbol);
        }
      });
    }

    const tableMap = new Map(tables.map(t => [t.id, t]));
    const refWithCodes = references.map(r => ({
      ...r,
      parentTableCode: tableMap.get(r.parentTableId)?.code || '',
      childTableCode: tableMap.get(r.childTableId)?.code || ''
    }));

    return {
      id: diagramId,
      name: diagramName,
      tableSymbols,
      referenceSymbols,
      references: refWithCodes
    };
  }

  private parseTableSymbol(tsXml: any): PDMTableSymbol | null {
    // 尝试所有可能的ID字段
    const id = tsXml['a:ObjectID'] || tsXml['@_ObjectID'] || tsXml['ObjectID'] || tsXml['@_Id'] || '';

    // 尝试从 c:Object 字段获取关联的表对象ID
    let objectId = '';
    const objRef = tsXml['c:Object'] || tsXml['Object'] || tsXml['a:Object'] || tsXml['@_Object'];

    if (objRef) {
      if (typeof objRef === 'string') {
        objectId = objRef;
      } else if (typeof objRef === 'object') {
        // 深度提取ID：处理嵌套结构如 { 'o:Table': { '@_Ref': 'o12' } }
        objectId = this.extractIdFromNestedObject(objRef);

        // 如果没有从对象中找到，尝试直接使用对象本身（可能已经是ID）
        if (!objectId && objRef['@_Id']) {
          objectId = objRef['@_Id'];
        }
      }
    }

    // 如果c:Object失败，尝试sourceBlockID
    if (!objectId) {
      const sourceBlock = tsXml['a:SourceBlockID'] || tsXml['SourceBlockID'] || tsXml['@_SourceBlockID'] || tsXml['c:SourceBlockID'];
      if (sourceBlock) {
        if (typeof sourceBlock === 'string') {
          objectId = sourceBlock;
        } else if (typeof sourceBlock === 'object') {
          objectId = sourceBlock['a:ObjectID'] || sourceBlock['@_ObjectID'] || sourceBlock['ObjectID'] ||
                    sourceBlock['@_Ref'] || sourceBlock['Ref'] || '';
        }
      }
    }

    // 尝试TableID
    if (!objectId) {
      objectId = tsXml['a:TableID'] || tsXml['TableID'] || tsXml['@_TableID'] || '';
    }

    // 如果仍然没有找到，尝试将@_Id作为objectId（可能符号ID和对象ID相同）
    if (!objectId && tsXml['@_Id']) {
      objectId = tsXml['@_Id'];
    }

    if (!objectId) {
      return null;
    }

    // 解析矩形坐标
    const rect = tsXml['a:Rect'] || tsXml['Rect'] || tsXml['@_Rect'] || tsXml['c:Rect'];
    let left = 0, top = 0, right = 0, bottom = 0;

    if (rect) {
      if (typeof rect === 'object') {
        left = this.parseNumber(rect['a:Left'] || rect['Left'] || rect['@_Left'] || 0);
        top = this.parseNumber(rect['a:Top'] || rect['Top'] || rect['@_Top'] || 0);
        right = this.parseNumber(rect['a:Right'] || rect['Right'] || rect['@_Right'] || 0);
        bottom = this.parseNumber(rect['a:Bottom'] || rect['Bottom'] || rect['@_Bottom'] || 0);
      } else if (typeof rect === 'string') {
        // 可能格式为 "L;T;R;B" 或 "((left,top), (right,bottom))"
        if (rect.includes(';')) {
          const parts = rect.split(';');
          if (parts.length >= 4) {
            left = this.parseNumber(parts[0]);
            top = this.parseNumber(parts[1]);
            right = this.parseNumber(parts[2]);
            bottom = this.parseNumber(parts[3]);
          }
        } else if (rect.startsWith('((') && rect.includes('), (')) {
          // 格式：((left,top), (right,bottom))
          try {
            const cleanRect = rect.replace(/[()\s]/g, '');
            const parts = cleanRect.split(',');
            if (parts.length >= 4) {
              left = this.parseNumber(parts[0]);
              top = this.parseNumber(parts[1]);
              right = this.parseNumber(parts[2]);
              bottom = this.parseNumber(parts[3]);
            }
          } catch (_e) {
            // 忽略解析错误
          }
        }
      }
    }

    // 如果objectId是短格式ID，尝试转换为对应的表GUID
    if (this.idMap.has(objectId)) {
      objectId = this.idMap.get(objectId)!;
    }

    return { id: id || `symbol_${objectId}`, objectId, rect: { left, top, right, bottom } };
  }

  private parseReferenceSymbol(rsXml: any): PDMReferenceSymbol | null {
    // 尝试所有可能的ID字段
    const id = rsXml['a:ObjectID'] || rsXml['@_ObjectID'] || rsXml['ObjectID'] || rsXml['@_Id'] || '';

    // 1. 首先尝试从 c:Object 获取关联的reference ID
    let referenceId = '';
    const objRef = rsXml['c:Object'] || rsXml['Object'] || rsXml['a:Object'] || rsXml['@_Object'];

    if (objRef) {
      if (typeof objRef === 'string') {
        referenceId = objRef;
      } else if (typeof objRef === 'object') {
        // 尝试从对象引用中提取ID
        referenceId = objRef['a:ObjectID'] || objRef['@_ObjectID'] || objRef['ObjectID'] ||
                     objRef['@_Ref'] || objRef['Ref'] ||
                     objRef['@_Id'] || objRef['a:Id'] || '';

        // 如果没有找到，尝试深度搜索嵌套结构
        if (!referenceId) {
          for (const key of Object.keys(objRef)) {
            const value = objRef[key];
            if (value && typeof value === 'object') {
              if (key.includes('Reference') || key.includes('Ref')) {
                const deepId = this.extractIdFromNestedObject(value);
                if (deepId) {
                  referenceId = deepId;
                  break;
                }
              }
            }
          }
        }
      }
    }

    // 2. 如果没有，尝试其他可能的reference ID字段
    if (!referenceId) {
      const refIdNode = rsXml['a:ReferenceID'] || rsXml['ReferenceID'] || rsXml['@_ReferenceID'] || rsXml['c:ReferenceID'];
      if (refIdNode) {
        if (typeof refIdNode === 'string') {
          referenceId = refIdNode;
        } else if (typeof refIdNode === 'object') {
          referenceId = refIdNode['a:ObjectID'] || refIdNode['@_ObjectID'] || refIdNode['ObjectID'] ||
                       refIdNode['@_Ref'] || refIdNode['Ref'] || '';
        }
      }
    }

    // 将referenceId从短格式ID转换为GUID（如果idMap中有映射）
    if (referenceId && this.idMap.has(referenceId)) {
      referenceId = this.idMap.get(referenceId)!;
    }

    // 3. 解析源和目标符号 - 重点关注 c:SourceSymbol 和 c:DestinationSymbol
    let sourceSymbolId = '';
    let destSymbolId = '';
    
    const sourceSymbol = rsXml['c:SourceSymbol'] || rsXml['SourceSymbol'] || rsXml['a:SourceSymbol'] || rsXml['@_SourceSymbol'];
    const destSymbol = rsXml['c:DestinationSymbol'] || rsXml['DestinationSymbol'] || rsXml['a:DestinationSymbol'] || rsXml['@_DestinationSymbol'];

    // 深入解析sourceSymbol
    if (sourceSymbol) {
      if (typeof sourceSymbol === 'string') {
        sourceSymbolId = sourceSymbol;
      } else if (sourceSymbol && typeof sourceSymbol === 'object') {
        // 可能是一个对象引用，需要深入提取
        sourceSymbolId = this.extractIdFromObjectRef(sourceSymbol);

        // 如果还没有找到，尝试常见的嵌套结构
        if (!sourceSymbolId) {
          // 可能包含 o:TableSymbol 或其他嵌套
          for (const key of Object.keys(sourceSymbol)) {
            if (key.includes('Symbol') || key.includes('Table')) {
              const nested = sourceSymbol[key];
              if (nested && typeof nested === 'object') {
                const nestedId = this.extractIdFromObjectRef(nested);
                if (nestedId) {
                  sourceSymbolId = nestedId;
                  break;
                }
              }
            }
          }
        }
      }
    }

    // 深入解析destSymbol
    if (destSymbol) {
      if (typeof destSymbol === 'string') {
        destSymbolId = destSymbol;
      } else if (destSymbol && typeof destSymbol === 'object') {
        destSymbolId = this.extractIdFromObjectRef(destSymbol);

        if (!destSymbolId) {
          for (const key of Object.keys(destSymbol)) {
            if (key.includes('Symbol') || key.includes('Table')) {
              const nested = destSymbol[key];
              if (nested && typeof nested === 'object') {
                const nestedId = this.extractIdFromObjectRef(nested);
                if (nestedId) {
                  destSymbolId = nestedId;
                  break;
                }
              }
            }
          }
        }
      }
    }

    // 4. 如果没有找到，尝试ID后缀的属性
    if (!sourceSymbolId) {
      sourceSymbolId = rsXml['a:SourceSymbolID'] || rsXml['SourceSymbolID'] || rsXml['@_SourceSymbolID'] || 
                      rsXml['c:SourceSymbolID'] || '';
    }
    if (!destSymbolId) {
      destSymbolId = rsXml['a:DestinationSymbolID'] || rsXml['DestinationSymbolID'] || rsXml['@_DestinationSymbolID'] ||
                    rsXml['c:DestinationSymbolID'] || '';
    }

    // 5. 如果仍然没有，尝试将@_Id作为symbol ID（可能符号ID就是@_Id值）
    if (!sourceSymbolId || !destSymbolId) {
      // 无法提取源/目标符号ID
    }

    // 解析锚点位置
    const sourceAttach = rsXml['a:SourceBorderAttach'] || rsXml['SourceBorderAttach'] || rsXml['@_SourceBorderAttach'];
    const destAttach = rsXml['a:DestinationBorderAttach'] || rsXml['DestinationBorderAttach'] || rsXml['@_DestinationBorderAttach'];

    const sourceAnchor = sourceAttach ? this.parseNumber(sourceAttach['a:Anchor'] || sourceAttach['Anchor'] || sourceAttach || 0) : 0;
    const destAnchor = destAttach ? this.parseNumber(destAttach['a:Anchor'] || destAttach['Anchor'] || destAttach || 0) : 0;

    // 即使没有source/dest，也返回部分信息（可能稍后可以通过其他方式匹配）
    if (!sourceSymbolId || !destSymbolId) {
      return null;
    }

    return {
      id: id || `refsym_${referenceId || 'unknown'}`,
      referenceId,
      sourceSymbolId,
      destSymbolId,
      sourceAnchor,
      destAnchor
    };
  }

  // 辅助方法：从对象引用中提取ID
  private extractIdFromObjectRef(objRef: any): string {
    if (!objRef) return '';
    
    if (typeof objRef === 'string') {
      return objRef;
    }
    
    if (typeof objRef === 'object') {
      // 尝试所有可能的ID字段
      return objRef['a:ObjectID'] || objRef['@_ObjectID'] || objRef['ObjectID'] ||
             objRef['@_Ref'] || objRef['Ref'] || 
             objRef['@_Id'] || objRef['a:Id'] || objRef['Id'] ||
             objRef['@_ID'] || objRef['a:ID'] || objRef['ID'] || '';
    }
    
    return '';
  }

  private extractIdFromNestedObject(obj: any): string {
    if (!obj || typeof obj !== 'object') return '';

    // 首先尝试直接提取
    const directId = this.extractIdFromObjectRef(obj);
    if (directId) {
      return directId;
    }

    // 深度搜索嵌套对象中的ID
    for (const key of Object.keys(obj)) {
      const value = obj[key];

      if (value && typeof value === 'object') {
        // 如果键名包含"Table"、"Symbol"、"Object"等，深入搜索
        if (key.includes('Table') || key.includes('Symbol') || key.includes('Object') || key.includes('Reference')) {
          const nestedId = this.extractIdFromObjectRef(value);
          if (nestedId) {
            return nestedId;
          }

          // 进一步深入嵌套
          const deepNestedId = this.extractIdFromNestedObject(value);
          if (deepNestedId) {
            return deepNestedId;
          }
        }
      }
    }

    return '';
  }
}
