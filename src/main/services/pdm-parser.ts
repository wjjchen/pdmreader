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
  version?: string;
  author?: string;
  modelName?: string;
}

export class PDMParser {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
      parseTagValue: true,
      trimValues: true,
      processEntities: false,
      entityExpansionLimit: 10000
    });
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
    if (!tablesCollection) return [];

    const tableObjects = this.extractObjects(tablesCollection, 'Table');
    return tableObjects.map((t: any) => this.parseTable(t));
  }

  private parseTable(tableXml: any): PDMTable {
    const id = tableXml['a:ObjectID'] || tableXml['@_ObjectID'] || tableXml['ObjectID'] || '';
    const name = tableXml['a:Name'] || tableXml['@_Name'] || tableXml['Name'] || '';
    const code = tableXml['a:Code'] || tableXml['@_Code'] || tableXml['Code'] || '';
    const comment = tableXml['a:Comment'] || tableXml['@_Comment'] || tableXml['Comment'] || '';

    const columns = this.parseColumns(tableXml);
    const keys = this.parseKeys(tableXml, columns);
    const primaryKey = this.findPrimaryKey(tableXml, keys, columns);

    return { id, name, code, comment, columns, primaryKey, keys };
  }

  private parseColumns(tableXml: any): PDMColumn[] {
    const columnsCollection = tableXml['c:Columns'] || tableXml['Columns'];
    if (!columnsCollection) return [];

    const columnObjects = this.extractObjects(columnsCollection, 'Column');
    return columnObjects.map((c: any) => this.parseColumn(c));
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

    return { id, name, code, type: keyType, columnRefs };
  }

  private isForeignKey(keyXml: any): boolean {
    return !!(
      keyXml['a:ForeignKeySourceTable'] || keyXml['@_ForeignKeySourceTable'] ||
      keyXml['ForeignKeySourceTable'] ||
      keyXml['c:ForeignKeySourceTable'] || keyXml['Reference']
    );
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
    if (!referencesCollection) return [];

    const referenceObjects = this.extractObjects(referencesCollection, 'Reference');
    return referenceObjects.map((r: any) => this.parseReference(r));
  }

  private parseReference(refXml: any): PDMReference {
    const id = refXml['a:ObjectID'] || refXml['@_ObjectID'] || refXml['ObjectID'] || '';
    const name = refXml['a:Name'] || refXml['@_Name'] || refXml['Name'] || '';
    const code = refXml['a:Code'] || refXml['@_Code'] || refXml['Code'] || '';

    let parentTableId = '';
    let childTableId = '';

    const parentTable = refXml['c:ParentTable'] || refXml['ParentTable'];
    const childTable = refXml['c:ChildTable'] || refXml['ChildTable'];

    if (parentTable) {
      const tableRef = parentTable['o:Table'] || parentTable['Table'];
      if (tableRef) {
        parentTableId = tableRef['a:ObjectID'] || tableRef['@_ObjectID'] || tableRef['ObjectID'] || '';
      }
    }

    if (childTable) {
      const tableRef = childTable['o:Table'] || childTable['Table'];
      if (tableRef) {
        childTableId = tableRef['a:ObjectID'] || tableRef['@_ObjectID'] || tableRef['ObjectID'] || '';
      }
    }

    return { id, name, code, parentTableId, childTableId };
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
        if (symbol) referenceSymbols.push(symbol);
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
    const id = tsXml['a:ObjectID'] || tsXml['@_ObjectID'] || tsXml['ObjectID'] || '';

    const sourceBlock = tsXml['a:SourceBlockID'] || tsXml['SourceBlockID'];
    let objectId = '';

    if (sourceBlock) {
      objectId = sourceBlock['a:ObjectID'] || sourceBlock['@_ObjectID'] || sourceBlock['ObjectID'] ||
                 (typeof sourceBlock === 'string' ? sourceBlock : '');
    }

    const rect = tsXml['a:Rect'] || tsXml['Rect'];
    let left = 0, top = 0, right = 0, bottom = 0;

    if (rect) {
      left = this.parseNumber(rect['a:Left'] || rect['Left'] || 0);
      top = this.parseNumber(rect['a:Top'] || rect['Top'] || 0);
      right = this.parseNumber(rect['a:Right'] || rect['Right'] || 0);
      bottom = this.parseNumber(rect['a:Bottom'] || rect['Bottom'] || 0);
    }

    if (!objectId) return null;

    return { id, objectId, rect: { left, top, right, bottom } };
  }

  private parseReferenceSymbol(rsXml: any): PDMReferenceSymbol | null {
    const id = rsXml['a:ObjectID'] || rsXml['@_ObjectID'] || rsXml['ObjectID'] || '';

    const refIdNode = rsXml['a:ReferenceID'] || rsXml['ReferenceID'];
    let referenceId = '';
    if (refIdNode) {
      referenceId = refIdNode['a:ObjectID'] || refIdNode['@_ObjectID'] || refIdNode['ObjectID'] ||
                   (typeof refIdNode === 'string' ? refIdNode : '');
    }

    const sourceSymbol = rsXml['a:SourceSymbol'] || rsXml['SourceSymbol'];
    const destSymbol = rsXml['a:DestinationSymbol'] || rsXml['DestinationSymbol'];

    let sourceSymbolId = '';
    let destSymbolId = '';

    if (sourceSymbol) {
      sourceSymbolId = sourceSymbol['a:ObjectID'] || sourceSymbol['@_ObjectID'] || sourceSymbol['ObjectID'] ||
                       (typeof sourceSymbol === 'string' ? sourceSymbol : '');
    }

    if (destSymbol) {
      destSymbolId = destSymbol['a:ObjectID'] || destSymbol['@_ObjectID'] || destSymbol['ObjectID'] ||
                     (typeof destSymbol === 'string' ? destSymbol : '');
    }

    const sourceAttach = rsXml['a:SourceBorderAttach'] || rsXml['SourceBorderAttach'];
    const destAttach = rsXml['a:DestinationBorderAttach'] || rsXml['DestinationBorderAttach'];

    const sourceAnchor = sourceAttach ? this.parseNumber(sourceAttach['a:Anchor'] || sourceAttach['Anchor'] || 0) : 0;
    const destAnchor = destAttach ? this.parseNumber(destAttach['a:Anchor'] || destAttach['Anchor'] || 0) : 0;

    if (!sourceSymbolId || !destSymbolId) return null;

    return { id, referenceId, sourceSymbolId, destSymbolId, sourceAnchor, destAnchor };
  }
}
