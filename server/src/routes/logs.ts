import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  clearLogs,
  currentMaxId,
  levelCounts,
  queryLogs,
  type ServerLogEntry,
  type ServerLogLevel,
} from '../lib/server-logs.js';
import { logQuerySchema } from '@freellmapi/shared/schemas.js';

// The dashboard's server-log viewer. Mounted under /api/logs behind the
// dashboard session gate like every other admin route — the unified /v1 key
// opens the inference surface, never this one: these lines name providers,
// models, key ids and failure reasons.
//
// The endpoint is polled, so its contract is built around a cursor rather than
// pagination: the client keeps the `nextId` it was last handed and sends it
// back as `sinceId`, and a caller that is already caught up gets an empty
// `entries` for the cost of one comparison. `nextId` is the store's highest id
// rather than the highest id RETURNED, so a poll whose matches were all
// filtered out still advances the cursor instead of re-scanning the same tail
// forever.

export const logsRouter = Router();

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: { message } });
}

function toJson(entry: ServerLogEntry) {
  return {
    id: entry.id,
    ts: new Date(entry.tsMs).toISOString(),
    level: entry.level,
    ...(entry.source ? { source: entry.source } : {}),
    ...(entry.provider ? { provider: entry.provider } : {}),
    ...(entry.model ? { model: entry.model } : {}),
    ...(entry.event ? { event: entry.event } : {}),
    ...(entry.requestId ? { requestId: entry.requestId } : {}),
    message: entry.message,
  };
}

logsRouter.get('/', (req: Request, res: Response) => {
  // The shared contract owns the query rules (first-value wins, unknown levels
  // and bad cursors are hard errors, `limit` stays a preference). On failure
  // only the FIRST issue is reported, matching the manual parser's short
  // circuit: levels before sinceId, with the pinned message text.
  const parsed = logQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    badRequest(res, first ? first.message : 'Invalid log query');
    return;
  }

  const entries = queryLogs({
    ...parsed.data,
    levels: parsed.data.levels as ServerLogLevel[] | undefined,
  });

  res.json({
    entries: entries.map(toJson),
    nextId: currentMaxId(),
    counts: levelCounts(),
  });
});

logsRouter.post('/clear', (_req: Request, res: Response) => {
  clearLogs();
  res.json({ ok: true });
});
