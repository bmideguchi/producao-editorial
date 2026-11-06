export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message)
  }
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, message)
}

export function unauthorized(message = 'Sessão inválida.'): HttpError {
  return new HttpError(401, message)
}

export function forbidden(message: string): HttpError {
  return new HttpError(403, message)
}

export function notFound(message: string): HttpError {
  return new HttpError(404, message)
}

export function conflict(message: string): HttpError {
  return new HttpError(409, message)
}
