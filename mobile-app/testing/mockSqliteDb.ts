// In-Memory SQLite Mock Engine for Jest Unit and Integration Testing

export class MockSQLiteDatabase {
  public userVersion: number = 0;
  public tables: Map<string, { columns: string[]; rows: Record<string, any>[] }> = new Map();

  private cloneState() {
    const tableClones = new Map<string, { columns: string[]; rows: Record<string, any>[] }>();
    for (const [name, table] of this.tables.entries()) {
      tableClones.set(name, {
        columns: [...table.columns],
        rows: table.rows.map((r) => ({ ...r })),
      });
    }
    return {
      userVersion: this.userVersion,
      tables: tableClones,
    };
  }

  private restoreState(snapshot: { userVersion: number; tables: Map<string, { columns: string[]; rows: Record<string, any>[] }> }) {
    this.userVersion = snapshot.userVersion;
    this.tables = snapshot.tables;
  }

  async withTransactionAsync<T>(fn: () => Promise<T>): Promise<T> {
    const snapshot = this.cloneState();
    try {
      const result = await fn();
      return result;
    } catch (err) {
      this.restoreState(snapshot);
      throw err;
    }
  }

  async execAsync(sqlScript: string): Promise<void> {
    const statements = sqlScript
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await this.runStatement(statement);
    }
  }

  async runAsync(sql: string, params: any[] = []): Promise<{ lastInsertRowId: number; changes: number }> {
    return this.runStatement(sql, params);
  }

  async getAllAsync<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const trimmed = sql.trim();
    const lower = trimmed.toLowerCase();

    if (lower.startsWith('pragma user_version')) {
      if (lower.includes('=')) {
        const match = trimmed.match(/user_version\s*=\s*(\d+)/i);
        if (match) {
          this.userVersion = parseInt(match[1], 10);
        }
        return [] as any;
      }
      return [{ user_version: this.userVersion }] as any;
    }

    if (lower.startsWith("pragma table_info")) {
      const match = trimmed.match(/table_info\(['"]?([a-zA-Z0-9_]+)['"]?\)/i);
      const tableName = match ? match[1] : '';
      const table = this.tables.get(tableName);
      if (!table) return [] as any;
      return table.columns.map((name, index) => ({ cid: index, name })) as any;
    }

    if (lower.startsWith("pragma foreign_key_check")) {
      return [] as any; // foreign key check passed
    }

    if (lower.startsWith('select')) {
      return this.executeSelect(trimmed, params) as T[];
    }

    return [] as T[];
  }

  private async runStatement(sql: string, params: any[] = []): Promise<{ lastInsertRowId: number; changes: number }> {
    const cleanSql = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim();

    const lower = cleanSql.toLowerCase();

    if (lower.startsWith('pragma user_version')) {
      const match = cleanSql.match(/user_version\s*=\s*(\d+)/i);
      if (match) {
        this.userVersion = parseInt(match[1], 10);
      }
      return { lastInsertRowId: 0, changes: 0 };
    }

    if (lower.startsWith('pragma')) {
      return { lastInsertRowId: 0, changes: 0 };
    }

    if (lower.startsWith('create table')) {
      this.executeCreateTable(cleanSql);
      return { lastInsertRowId: 0, changes: 0 };
    }

    if (lower.startsWith('create index')) {
      return { lastInsertRowId: 0, changes: 0 };
    }

    if (lower.startsWith('alter table')) {
      this.executeAlterTable(cleanSql);
      return { lastInsertRowId: 0, changes: 0 };
    }

    if (lower.startsWith('drop table')) {
      const match = cleanSql.match(/drop\s+table\s+(?:if\s+exists\s+)?['"]?([a-zA-Z0-9_]+)['"]?/i);
      if (match) {
        this.tables.delete(match[1]);
      }
      return { lastInsertRowId: 0, changes: 1 };
    }

    if (lower.startsWith('insert into')) {
      return this.executeInsert(cleanSql, params);
    }

    if (lower.startsWith('update')) {
      return this.executeUpdate(cleanSql, params);
    }

    if (lower.startsWith('delete from') || lower.startsWith('delete')) {
      return this.executeDelete(cleanSql, params);
    }

    return { lastInsertRowId: 0, changes: 0 };
  }

  private executeCreateTable(sql: string) {
    const cleanSql = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    const firstParen = cleanSql.indexOf('(');
    if (firstParen === -1) return;

    const header = cleanSql.slice(0, firstParen);
    const match = header.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?['"]?([a-zA-Z0-9_]+)['"]?/i);
    if (!match) return;
    const tableName = match[1];

    let depth = 0;
    let outerEnd = -1;
    for (let i = firstParen; i < cleanSql.length; i++) {
      if (cleanSql[i] === '(') depth++;
      else if (cleanSql[i] === ')') {
        depth--;
        if (depth === 0) {
          outerEnd = i;
          break;
        }
      }
    }
    if (outerEnd === -1) outerEnd = cleanSql.lastIndexOf(')');

    const defs = cleanSql.slice(firstParen + 1, outerEnd);

    const columns: string[] = [];
    let currentToken = '';
    let parenDepth = 0;
    for (let i = 0; i < defs.length; i++) {
      const char = defs[i];
      if (char === '(') parenDepth++;
      else if (char === ')') parenDepth--;

      if (char === ',' && parenDepth === 0) {
        processColumnLine(currentToken);
        currentToken = '';
      } else {
        currentToken += char;
      }
    }
    if (currentToken) processColumnLine(currentToken);

    function processColumnLine(line: string) {
      const trimmedLine = line.trim();
      if (
        !trimmedLine ||
        trimmedLine.startsWith('--') ||
        trimmedLine.toUpperCase().startsWith('PRIMARY KEY') ||
        trimmedLine.toUpperCase().startsWith('FOREIGN KEY') ||
        trimmedLine.toUpperCase().startsWith('CONSTRAINT') ||
        trimmedLine.toUpperCase().startsWith('CHECK')
      ) {
        return;
      }
      const parts = trimmedLine.split(/\s+/);
      if (parts.length > 0 && parts[0]) {
        columns.push(parts[0].replace(/['"`]/g, ''));
      }
    }

    if (!this.tables.has(tableName)) {
      this.tables.set(tableName, { columns, rows: [] });
    }
  }

  private executeAlterTable(sql: string) {
    const match = sql.match(/alter\s+table\s+['"]?([a-zA-Z0-9_]+)['"]?\s+(rename\s+to|add\s+column)\s+([\s\S]+)/i);
    if (!match) return;
    const tableName = match[1];
    const action = match[2].toLowerCase();
    const rest = match[3].trim();

    const table = this.tables.get(tableName);

    if (action.includes('rename')) {
      const newName = rest.replace(/['"`]/g, '').replace(/;$/, '').trim();
      if (table) {
        this.tables.delete(tableName);
        this.tables.set(newName, table);
      }
    } else if (action.includes('add column')) {
      const colName = rest.split(/\s+/)[0].replace(/['"`]/g, '').replace(/;$/, '').trim();
      if (table && !table.columns.includes(colName)) {
        table.columns.push(colName);
        for (const row of table.rows) {
          row[colName] = null;
        }
      }
    }
  }

  private executeInsert(sql: string, params: any[]) {
    // Check for ON CONFLICT or INSERT ... SELECT
    const isInsertSelect = sql.toLowerCase().includes('select');
    if (isInsertSelect) {
      return this.executeInsertSelect(sql);
    }

    const match = sql.match(/insert\s+(?:or\s+replace\s+)?into\s+['"]?([a-zA-Z0-9_]+)['"]?\s*\(([^)]+)\)/i);
    if (!match) return { lastInsertRowId: 0, changes: 0 };
    const tableName = match[1];
    const colNames = match[2].split(',').map((c) => c.trim().replace(/['"`]/g, ''));

    let table = this.tables.get(tableName);
    if (!table) {
      table = { columns: [...colNames], rows: [] };
      this.tables.set(tableName, table);
    }

    const valuesMatch = sql.match(/values\s*\(([^)]+)\)/i);
    let paramIdx = 0;
    const rowObj: Record<string, any> = {};
    if (valuesMatch) {
      const valTokens = valuesMatch[1].split(',').map((v) => v.trim());
      colNames.forEach((col, idx) => {
        const token = valTokens[idx];
        if (!token || token === '?') {
          rowObj[col] = params[paramIdx++] !== undefined ? params[paramIdx - 1] : null;
        } else if (token.startsWith("'") || token.startsWith('"')) {
          rowObj[col] = token.slice(1, -1);
        } else if (!isNaN(Number(token))) {
          rowObj[col] = Number(token);
        } else {
          rowObj[col] = token;
        }
      });
    } else {
      colNames.forEach((col, idx) => {
        rowObj[col] = params[idx] !== undefined ? params[idx] : null;
      });
    }

    // Check conflict resolution (on list_id or list_id,barcode or user_id,barcode or profile_id or outbox_id)
    const existingIndex = table.rows.findIndex((r) => {
      if (rowObj.outbox_id !== undefined && r.outbox_id === rowObj.outbox_id) return true;
      if (rowObj.list_id !== undefined && rowObj.barcode !== undefined) {
        return r.list_id === rowObj.list_id && r.barcode === rowObj.barcode;
      }
      if (rowObj.user_id !== undefined && rowObj.barcode !== undefined) {
        return r.user_id === rowObj.user_id && r.barcode === rowObj.barcode;
      }
      if (rowObj.list_id !== undefined && rowObj.barcode === undefined) {
        return r.list_id === rowObj.list_id;
      }
      if (rowObj.profile_id !== undefined) {
        return r.profile_id === rowObj.profile_id;
      }
      return false;
    });

    if (existingIndex >= 0) {
      table.rows[existingIndex] = { ...table.rows[existingIndex], ...rowObj };
    } else {
      table.rows.push(rowObj);
    }

    return { lastInsertRowId: table.rows.length, changes: 1 };
  }

  private executeInsertSelect(sql: string) {
    const match = sql.match(/insert\s+into\s+['"]?([a-zA-Z0-9_]+)['"]?\s*\(([^)]+)\)\s*select\s+([\s\S]+)\s+from\s+['"]?([a-zA-Z0-9_]+)['"]?/i);
    if (!match) return { lastInsertRowId: 0, changes: 0 };
    const targetTable = match[1].replace(/;$/, '').trim();
    const targetCols = match[2].split(',').map((c) => c.trim().replace(/['"`]/g, ''));
    const sourceTable = match[4].replace(/;$/, '').trim();

    const src = this.tables.get(sourceTable);
    if (!src) return { lastInsertRowId: 0, changes: 0 };

    let tgt = this.tables.get(targetTable);
    if (!tgt) {
      tgt = { columns: [...targetCols], rows: [] };
      this.tables.set(targetTable, tgt);
    }

    let changes = 0;
    for (const srcRow of src.rows) {
      const newRow: Record<string, any> = {};
      targetCols.forEach((col) => {
        if (col === 'list_name' && srcRow['name'] !== undefined) {
          newRow[col] = srcRow['name'];
        } else if (col === 'is_checked' && srcRow['checked'] !== undefined) {
          newRow[col] = srcRow['checked'] ? 1 : 0;
        } else if (col === 'updated_at' && srcRow['updated_at'] === undefined) {
          newRow[col] = srcRow['added_at'] || new Date().toISOString();
        } else {
          newRow[col] = srcRow[col] !== undefined ? srcRow[col] : null;
        }
      });
      tgt.rows.push(newRow);
      changes++;
    }

    return { lastInsertRowId: tgt.rows.length, changes };
  }

  private executeUpdate(sql: string, params: any[]) {
    const match = sql.match(/update\s+['"]?([a-zA-Z0-9_]+)['"]?\s+set\s+([\s\S]+?)(?:\s+where\s+([\s\S]+))?$/i);
    if (!match) return { lastInsertRowId: 0, changes: 0 };
    const tableName = match[1];
    const setClause = match[2];
    const whereClause = match[3];

    const table = this.tables.get(tableName);
    if (!table) return { lastInsertRowId: 0, changes: 0 };

    // Extract set assignments
    const setAssignments = setClause.split(',').map((s) => s.trim());
    let paramIdx = 0;

    let changes = 0;
    for (const row of table.rows) {
      if (this.evalWhere(row, whereClause, params, setAssignments.length)) {
        let currentParamIdx = 0;
        for (const assign of setAssignments) {
          const parts = assign.split('=').map((p) => p.trim());
          const colName = parts[0].replace(/['"`]/g, '');
          const valExpr = parts[1];

          if (valExpr === '?') {
            row[colName] = params[currentParamIdx++];
          } else if (valExpr.toUpperCase().startsWith('COALESCE')) {
            const paramVal = params[currentParamIdx++];
            if (paramVal !== null && paramVal !== undefined) {
              row[colName] = paramVal;
            }
          } else {
            row[colName] = valExpr.replace(/['"`]/g, '');
          }
        }
        changes++;
      }
    }

    return { lastInsertRowId: 0, changes };
  }

  private executeDelete(sql: string, params: any[]) {
    const match = sql.match(/delete\s+from\s+['"]?([a-zA-Z0-9_]+)['"]?(?:\s+where\s+([\s\S]+))?$/i);
    if (!match) return { lastInsertRowId: 0, changes: 0 };
    const tableName = match[1];
    const whereClause = match[2];

    const table = this.tables.get(tableName);
    if (!table) return { lastInsertRowId: 0, changes: 0 };

    if (!whereClause) {
      const changes = table.rows.length;
      table.rows = [];
      return { lastInsertRowId: 0, changes };
    }

    const initialCount = table.rows.length;
    table.rows = table.rows.filter((row) => !this.evalWhere(row, whereClause, params, 0));
    return { lastInsertRowId: 0, changes: initialCount - table.rows.length };
  }

  private executeSelect(sql: string, params: any[]): any[] {
    const cleanSql = sql.trim().replace(/;$/, '').trim();
    const match = cleanSql.match(/select\s+([\s\S]+?)\s+from\s+['"]?([a-zA-Z0-9_]+)['"]?(?:\s+where\s+([\s\S]+?))?(?:\s+order\s+by\s+([\s\S]+?))?$/i);
    if (!match) return [];
    const selectColsStr = match[1];
    const tableName = match[2].trim();
    const whereClause = match[3];
    const orderByClause = match[4];

    const table = this.tables.get(tableName);
    if (!table) return [];

    let filtered = table.rows.filter((row) => this.evalWhere(row, whereClause, params, 0));

    if (orderByClause) {
      const isDesc = orderByClause.toUpperCase().includes('DESC');
      const orderCol = orderByClause.split(/\s+/)[0].replace(/['"`]/g, '');
      filtered.sort((a, b) => {
        if (a[orderCol] < b[orderCol]) return isDesc ? 1 : -1;
        if (a[orderCol] > b[orderCol]) return isDesc ? -1 : 1;
        return 0;
      });
    }

    if (selectColsStr.trim() === '*' || selectColsStr.toLowerCase().includes('count(*)')) {
      if (selectColsStr.toLowerCase().includes('count(*)')) {
        return [{ count: filtered.length }];
      }
      return filtered.map((r) => ({ ...r }));
    }

    const selectCols = selectColsStr.split(',').map((c) => c.trim().replace(/['"`]/g, ''));
    return filtered.map((row) => {
      const res: Record<string, any> = {};
      selectCols.forEach((col) => {
        res[col] = row[col] !== undefined ? row[col] : null;
      });
      return res;
    });
  }

  private evalWhere(row: Record<string, any>, whereClause: string | undefined, params: any[], paramOffset: number): boolean {
    if (!whereClause) return true;
    let paramIdx = paramOffset;

    const tokens = whereClause.split(/\s+AND\s+|\s+and\s+/i);
    for (const token of tokens) {
      const trimmedToken = token.trim();
      if (trimmedToken.includes('=')) {
        const parts = trimmedToken.split('=').map((p) => p.trim());
        const col = parts[0].replace(/['"`]/g, '');
        const val = parts[1];

        const expected = val === '?' ? params[paramIdx++] : val.replace(/['"`]/g, '');
        if (row[col] != expected) {
          return false;
        }
      } else if (trimmedToken.includes('<')) {
        const parts = trimmedToken.split('<').map((p) => p.trim());
        const col = parts[0].replace(/['"`]/g, '');
        const val = parts[1];
        const expected = val === '?' ? params[paramIdx++] : Number(val);
        if (Number(row[col]) >= Number(expected)) {
          return false;
        }
      } else if (trimmedToken.toUpperCase().includes('IN')) {
        const match = trimmedToken.match(/['"]?([a-zA-Z0-9_]+)['"]?\s+IN\s*\(([^)]+)\)/i);
        if (match) {
          const col = match[1];
          const allowed = match[2].split(',').map((v) => v.trim().replace(/['"`]/g, ''));
          if (!allowed.includes(String(row[col]))) {
            return false;
          }
        }
      }
    }
    return true;
  }
}
