/**
 * Turns an openapi-fetch failure into a message worth showing an operator.
 *
 * Failures were previously reported as "are you signed in as an admin?", which
 * misdiagnosed outages (an unreachable API or a database that is down) as a
 * permissions problem. Use the status code to say what actually happened, and
 * prefer the API's own message when it sends one.
 */
export function apiErrorMessage(
  error: unknown,
  response: Response | undefined,
  fallback: string,
): string {
  const fromBody =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";

  // No response at all: DNS, CORS, or the API is down.
  if (!response) {
    return "Could not reach the API (network, CORS, or the service is down).";
  }

  switch (response.status) {
    case 401:
      return "Your session has expired — please sign in again.";
    case 403:
      return "Your account is not an administrator.";
    case 409:
      return fromBody || "That conflicts with an existing record.";
    case 503:
      return fromBody || "The service is unavailable (database may be down).";
    default:
      if (response.status >= 500) {
        return `Server error (${response.status}). ${
          fromBody || "Check the API's /health endpoint."
        }`;
      }
      return fromBody || fallback;
  }
}
