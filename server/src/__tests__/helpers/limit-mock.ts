import type { Request, Response, NextFunction } from 'express';

// Minimal req/res/next harness for invoking rate-limit middleware directly in
// unit-style tests (no HTTP, no app).

export interface MockRes {
  headers: Record<string, string>;
  statusCode: number;
  body: unknown;
  setHeader: (k: string, v: string) => void;
}

export function mockRes(): MockRes {
  const res: MockRes = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = (k, v) => {
    res.headers[k] = v;
  };
  (res as any).status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  (res as any).json = (b: unknown) => {
    res.body = b;
    return res;
  };
  return res;
}

export function mockReq(url = '/api/ping', method = 'GET', ip = '127.0.0.1'): Request {
  return { url, originalUrl: url, method, ip, socket: {}, headers: {} } as unknown as Request;
}

export function run(middleware: (req: Request, res: Response, next: NextFunction) => void, req?: Request) {
  const res = mockRes();
  let nexted = false;
  middleware(req ?? mockReq(), res as Response, () => {
    nexted = true;
  });
  return { res, nexted };
}
