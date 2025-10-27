export function isUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as {
    code?: number | string;
    status?: number;
    statusCode?: number;
    response?: { status?: number };
  };

  const statusCandidates = [
    maybeError.code,
    maybeError.status,
    maybeError.statusCode,
    maybeError.response?.status,
  ];

  return statusCandidates.some((status) => Number(status) === 401);
}
