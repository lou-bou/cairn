import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { MoneyError, type ApiErrorBody } from '@cairn/shared';
import { ZodError, type z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new ApiError(404, `${what} not found`);

/** Parse with a zod schema, turning failures into a 400 with one message per field. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value ?? {});
  if (result.success) return result.data;
  throw validationError(result.error);
}

function validationError(err: ZodError): ApiError {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  const first = Object.values(fields)[0] ?? 'Invalid input';
  return new ApiError(400, first, fields);
}

export function errorHandler(err: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  let body: ApiErrorBody;
  let status: number;
  if (err instanceof ApiError) {
    status = err.statusCode;
    body = { error: err.message, ...(err.fields ? { fields: err.fields } : {}) };
  } else if (err instanceof ZodError) {
    const v = validationError(err);
    status = 400;
    body = { error: v.message, fields: v.fields! };
  } else if (err instanceof MoneyError) {
    status = 400;
    body = { error: err.message };
  } else if ('statusCode' in err && typeof err.statusCode === 'number' && err.statusCode < 500) {
    status = err.statusCode;
    body = { error: err.message };
  } else {
    req.log.error(err);
    status = 500;
    body = { error: 'Something went wrong on the server' };
  }
  return reply.code(status).send(body);
}
