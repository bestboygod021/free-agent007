import path from 'node:path';
import { registerTool, ToolError } from './agent-tools.js';
import { resolveInside } from './agent-tools-builtin.js';
import { isSensitivePath } from '@freellmapi/agent/core/redaction.js';
import {
  queryCsvFile,
  describeCsvFile,
  queryXlsxFile,
  describeXlsxFile,
  TabularError,
} from './tabular-query.js';

/**
 * Data tools: asking a spreadsheet a question in SQL.
 *
 * Before this, a run that needed the total of a column had exactly one
 * option — read the whole CSV through `fs.read_file` and have the model add
 * the numbers up. That fails twice over: a file of any size does not fit in
 * the context window, and a language model doing arithmetic over a thousand
 * rows is the least reliable component available. SQLite is right every time
 * and costs nothing.
 *
 * The naming follows the policy engine's read vocabulary (`*.read`,
 * `*.query`) so these classify as reads rather than falling to the
 * restrictive default and being filtered out of every phase. See
 * `agent-tools-code.ts` for the time that went wrong.
 */

const MAX_ROW_LIMIT = 1000;

/**
 * Same credential-filename rule the fs tools apply.
 *
 * Found by a test: without it, `data.csv.schema.read` on `.env` returns the
 * file's contents as sample rows. A guard added to one read path is not a
 * guard on the codebase — every new tool that opens a file has to opt in, so
 * the rule is imported here too rather than assumed to be inherited.
 */
function assertReadableData(relative: string): void {
  if (isSensitivePath(relative)) {
    throw new ToolError(
      `refusing to read "${relative}": file names of this kind hold credentials.`,
      403,
    );
  }
}

/** Translate the service's errors into the tool layer's error type. */
function asToolError(err: unknown): never {
  if (err instanceof TabularError) throw new ToolError(err.message, err.status);
  throw err;
}

export function registerDataTools(): void {
  registerTool({
    name: 'data.csv.query',
    description:
      'Run a read-only SQL query against a CSV file in the workspace. The file is loaded into ' +
      'a private in-memory table (default name "data"). Use this for any counting, summing, ' +
      'grouping or filtering instead of reading the file and doing it by hand.',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', minLength: 1, description: 'CSV file relative to the workspace root.' },
        sql: {
          type: 'string',
          minLength: 1,
          description: 'A single SELECT statement, e.g. SELECT category, SUM(amount) FROM data GROUP BY category.',
        },
        table: {
          type: 'string',
          description: 'Name the table is loaded as. Defaults to "data".',
        },
        delimiter: { type: 'string', description: 'Field delimiter. Defaults to ",".' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_ROW_LIMIT,
          description: `Maximum rows to return (max ${MAX_ROW_LIMIT}).`,
        },
      },
      required: ['path', 'sql'],
      additionalProperties: false,
    },
    timeoutMs: 60_000,
    async handler(args, ctx) {
      assertReadableData(String(args.path));
      const file = await resolveInside(ctx.workspaceRoot, args.path);
      try {
        const { info, result } = await queryCsvFile(file, String(args.sql), {
          ...(typeof args.table === 'string' ? { table: args.table } : {}),
          ...(typeof args.delimiter === 'string' ? { delimiter: args.delimiter } : {}),
          ...(typeof args.limit === 'number' ? { limit: args.limit } : {}),
        });
        return {
          path: path.relative(ctx.workspaceRoot, file).split(path.sep).join('/'),
          table: info.table,
          sourceRows: info.rowCount,
          // Said out loud: a query over a truncated load is a query over part
          // of the file, and an answer from it is not a fact about the file.
          sourceTruncated: info.truncated,
          columns: result.columns,
          rows: result.rows,
          rowCount: result.rowCount,
          truncated: result.truncated,
        };
      } catch (err) {
        return asToolError(err);
      }
    },
  });

  registerTool({
    name: 'data.csv.schema.read',
    description:
      'Describe a CSV file: its column names, inferred SQL types, row count and a few sample ' +
      'rows. Call this before data.csv.query so the query uses real column names.',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', minLength: 1, description: 'CSV file relative to the workspace root.' },
        table: { type: 'string', description: 'Name the table is loaded as. Defaults to "data".' },
        delimiter: { type: 'string', description: 'Field delimiter. Defaults to ",".' },
        sampleRows: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'How many example rows to return. Defaults to 5.',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    timeoutMs: 60_000,
    async handler(args, ctx) {
      assertReadableData(String(args.path));
      const file = await resolveInside(ctx.workspaceRoot, args.path);
      try {
        const { info, sample } = await describeCsvFile(file, {
          ...(typeof args.table === 'string' ? { table: args.table } : {}),
          ...(typeof args.delimiter === 'string' ? { delimiter: args.delimiter } : {}),
          ...(typeof args.sampleRows === 'number' ? { sampleRows: args.sampleRows } : {}),
        });
        return {
          path: path.relative(ctx.workspaceRoot, file).split(path.sep).join('/'),
          table: info.table,
          rowCount: info.rowCount,
          truncated: info.truncated,
          // `original` is kept so a model can map a question phrased in the
          // spreadsheet's own words ("Total Amount") to the usable column name.
          columns: info.columns,
          sampleRows: sample.rows,
        };
      } catch (err) {
        return asToolError(err);
      }
    },
  });

  registerTool({
    name: 'data.xlsx.query',
    description:
      'Run a read-only SQL query against one sheet of an .xlsx workbook. The sheet is loaded ' +
      'into a private in-memory table (default name "data"). Call data.xlsx.schema.read first ' +
      'to see the sheet names and columns.',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', minLength: 1, description: '.xlsx file relative to the workspace root.' },
        sql: {
          type: 'string',
          minLength: 1,
          description: 'A single SELECT statement, e.g. SELECT region, SUM(q1) FROM data GROUP BY region.',
        },
        sheet: {
          type: ['string', 'integer'],
          description:
            'Sheet name, or 1-based tab index. Defaults to the first sheet. Sheets are not ' +
            'merged: query one at a time.',
        },
        headerRow: {
          type: 'integer',
          minimum: 1,
          description: 'Row holding the column names, 1-based. Defaults to 1.',
        },
        table: { type: 'string', description: 'Name the table is loaded as. Defaults to "data".' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_ROW_LIMIT,
          description: `Maximum rows to return (max ${MAX_ROW_LIMIT}).`,
        },
      },
      required: ['path', 'sql'],
      additionalProperties: false,
    },
    timeoutMs: 60_000,
    async handler(args, ctx) {
      assertReadableData(String(args.path));
      const file = await resolveInside(ctx.workspaceRoot, args.path);
      try {
        const { info, result, sheet, sheets } = await queryXlsxFile(file, String(args.sql), {
          ...(typeof args.sheet === 'string' || typeof args.sheet === 'number'
            ? { sheet: args.sheet }
            : {}),
          ...(typeof args.headerRow === 'number' ? { headerRow: args.headerRow } : {}),
          ...(typeof args.table === 'string' ? { table: args.table } : {}),
          ...(typeof args.limit === 'number' ? { limit: args.limit } : {}),
        });
        return {
          path: path.relative(ctx.workspaceRoot, file).split(path.sep).join('/'),
          sheet,
          // Every tab is reported, so a model that queried the wrong one can
          // see that there was another and say so.
          sheets,
          table: info.table,
          sourceRows: info.rowCount,
          sourceTruncated: info.truncated,
          columns: result.columns,
          rows: result.rows,
          rowCount: result.rowCount,
          truncated: result.truncated,
        };
      } catch (err) {
        return asToolError(err);
      }
    },
  });

  registerTool({
    name: 'data.xlsx.schema.read',
    description:
      'List the sheets in an .xlsx workbook and describe one of them: column names, inferred ' +
      'SQL types, row count and a few sample rows. Call this before data.xlsx.query.',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', minLength: 1, description: '.xlsx file relative to the workspace root.' },
        sheet: {
          type: ['string', 'integer'],
          description:
            'Sheet name, or 1-based tab index. Defaults to the first sheet. Sheets are not ' +
            'merged: query one at a time.',
        },
        headerRow: {
          type: 'integer',
          minimum: 1,
          description: 'Row holding the column names, 1-based. Defaults to 1.',
        },
        table: { type: 'string', description: 'Name the table is loaded as. Defaults to "data".' },
        sampleRows: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'How many example rows to return. Defaults to 5.',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    timeoutMs: 60_000,
    async handler(args, ctx) {
      assertReadableData(String(args.path));
      const file = await resolveInside(ctx.workspaceRoot, args.path);
      try {
        const { info, sample, sheet, sheets } = await describeXlsxFile(file, {
          ...(typeof args.sheet === 'string' || typeof args.sheet === 'number'
            ? { sheet: args.sheet }
            : {}),
          ...(typeof args.headerRow === 'number' ? { headerRow: args.headerRow } : {}),
          ...(typeof args.table === 'string' ? { table: args.table } : {}),
          ...(typeof args.sampleRows === 'number' ? { sampleRows: args.sampleRows } : {}),
        });
        return {
          path: path.relative(ctx.workspaceRoot, file).split(path.sep).join('/'),
          sheet,
          sheets,
          table: info.table,
          rowCount: info.rowCount,
          truncated: info.truncated,
          columns: info.columns,
          sampleRows: sample.rows,
        };
      } catch (err) {
        return asToolError(err);
      }
    },
  });
}
