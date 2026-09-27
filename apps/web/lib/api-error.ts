export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: {
      fields?: Record<string, string>;
      booking?: {
        id: string;
        startTime: string;
        manageUrl: string;
      };
      [key: string]: unknown;
    };
    booking?: {
      id: string;
      startTime: string;
      manageUrl: string;
    };
  };
  code?: string;
  message?: string;
  booking?: {
    id: string;
    startTime: string;
    manageUrl: string;
  };
};

const SENSITIVE_PATTERNS = [
  /failed to fetch/i,
  /networkerror/i,
  /typeerror/i,
  /prisma/i,
  /database/i,
  /postgres/i,
  /pg_/i,
  /syntax error/i,
  /econnrefused/i,
  /stack trace/i,
  /internal server error/i,
  /at\s+[a-zA-Z0-9_.]+\s+\(/i,
];

function isUnsafeMessage(msg: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(msg));
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody,
  ) {
    super(body.error.message);
    this.name = "ApiError";
  }
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }
  const error = (value as { error: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    typeof (error as { message: unknown }).message === "string"
  );
}

export function fieldErrors(error: unknown): Record<string, string> {
  if (error instanceof ApiError) {
    return error.body.error.details?.fields ?? {};
  }
  return {};
}

export function getExistingBookingFromError(error: unknown): {
  id: string;
  startTime: string;
  manageUrl: string;
} | undefined {
  if (error instanceof ApiError) {
    return (
      error.body.booking ||
      error.body.error.booking ||
      error.body.error.details?.booking
    );
  }
  return undefined;
}

/**
 * Maps any error or HTTP status into a polished, safe, human-readable user message.
 * Never leaks raw browser/network errors (e.g. "Failed to fetch", "TypeError", stack traces).
 */
export function formatApiError(
  error: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  if (error instanceof ApiError) {
    const { status, body } = error;
    const code = body.error.code ?? "";
    const rawMessage = body.error.message ?? "";

    // 400 Bad Request / Validation
    if (status === 400) {
      if (code === "VALIDATION_ERROR") {
        return "Please check the highlighted form fields and try again.";
      }
      if (code === "INVALID_CREDENTIALS" || code === "UNAUTHENTICATED") {
        return "Sign-in failed. The email or password is incorrect.";
      }
      if (code === "INVALID_PHONE") {
        return "Please enter a valid phone number in international format.";
      }
      if (code === "PHONE_REQUIRED") {
        return "Phone number is required for this meeting type.";
      }
      if (code === "SLOT_UNAVAILABLE" || code === "INVALID_TIME_SLOT") {
        return "The selected time slot is no longer available. Please choose another time.";
      }
      if (rawMessage && !isUnsafeMessage(rawMessage)) {
        return rawMessage;
      }
      return "Please review your information and try again.";
    }

    // 401 Unauthorized
    if (status === 401) {
      if (code === "INVALID_CREDENTIALS" || code === "UNAUTHENTICATED") {
        return "Sign-in failed. The email or password is incorrect.";
      }
      return "Your session has expired. Please sign in again.";
    }

    // 403 Forbidden
    if (status === 403) {
      return "You do not have permission to perform this action.";
    }

    // 404 Not Found
    if (status === 404) {
      if (code === "BOOKING_NOT_FOUND") {
        return "Booking not found or this link is no longer valid.";
      }
      if (code === "EVENT_TYPE_NOT_FOUND") {
        return "Event type not found or may have been removed.";
      }
      if (code === "USER_NOT_FOUND") {
        return "User profile not found.";
      }
      return "The requested item was not found.";
    }

    // 409 Conflict
    if (status === 409) {
      if (code === "EMAIL_CONFLICT" || code.includes("EMAIL")) {
        return "An account with this email already exists.";
      }
      if (code === "USERNAME_CONFLICT" || code.includes("USERNAME")) {
        return "This username is already taken. Please choose another.";
      }
      if (code === "SLOT_ALREADY_BOOKED" || code === "BOOKING_ALREADY_EXISTS") {
        return "This time slot has already been booked. Please choose another time.";
      }
      if (code === "BOOKING_VERSION_CONFLICT") {
        return "This booking was modified by another request. Please refresh and try again.";
      }
      if (rawMessage && !isUnsafeMessage(rawMessage)) {
        return rawMessage;
      }
      return "This action conflicts with the current record state. Please refresh.";
    }

    // 429 Rate Limiting
    if (status === 429) {
      return "Too many requests. Please wait a moment before trying again.";
    }

    // 504 Gateway / Request Timeout
    if (status === 504 || code === "TIMEOUT") {
      return "The request is taking too long. Please try again.";
    }

    // 503 Service Unavailable / Network failure
    if (status === 503 || code === "NETWORK_ERROR") {
      return "Unable to connect to the server. Please check your internet connection and try again.";
    }

    // 500 Internal Server Error
    if (status >= 500) {
      return "Something went wrong on our side. Please try again in a moment.";
    }

    // Default with message sanitization
    if (rawMessage && !isUnsafeMessage(rawMessage)) {
      return rawMessage;
    }
    return fallback;
  }

  // Handle standard JavaScript Error / DOMException
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return "The request is taking too long. Please try again.";
    }
    if (isUnsafeMessage(error.message)) {
      return "Unable to connect to the server. Please check your internet connection and try again.";
    }
    return error.message || fallback;
  }

  if (typeof error === "string" && error.trim()) {
    if (isUnsafeMessage(error)) {
      return fallback;
    }
    return error;
  }

  return fallback;
}
