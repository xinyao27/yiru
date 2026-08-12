export function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8'
    }
  })
}

export function apiError(code: string, status: number): Response {
  return jsonResponse({ error: { code } }, status)
}
