import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ApiError,
  formatApiError,
  fieldErrors,
  getExistingBookingFromError,
  isApiErrorBody,
} from "./api-error";

describe("api-error module", () => {
  describe("isApiErrorBody", () => {
    it("accepts valid API error envelope", () => {
      assert.equal(
        isApiErrorBody({
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: { fields: { email: "invalid email" } },
          },
        }),
        true
      );
    });

    it("rejects non-object or missing error property", () => {
      assert.equal(isApiErrorBody(null), false);
      assert.equal(isApiErrorBody(undefined), false);
      assert.equal(isApiErrorBody("error"), false);
      assert.equal(isApiErrorBody({ message: "nope" }), false);
    });
  });

  describe("formatApiError", () => {
    it("handles 400 validation errors", () => {
      const error = new ApiError(400, {
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: { fields: { email: "Required" } },
        },
      });
      const msg = formatApiError(error);
      assert.equal(msg, "Please check the highlighted form fields and try again.");
      assert.deepEqual(fieldErrors(error), { email: "Required" });
    });

    it("handles 400 invalid phone number", () => {
      const error = new ApiError(400, {
        error: {
          code: "INVALID_PHONE",
          message: "Invalid phone number format",
        },
      });
      assert.equal(
        formatApiError(error),
        "Please enter a valid phone number in international format."
      );
    });

    it("handles 401 invalid credentials", () => {
      const error = new ApiError(401, {
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid credentials",
        },
      });
      assert.equal(
        formatApiError(error),
        "Sign-in failed. The email or password is incorrect."
      );
    });

    it("handles 401 unauthenticated / session expired", () => {
      const error = new ApiError(401, {
        error: {
          code: "SESSION_EXPIRED",
          message: "Session expired",
        },
      });
      assert.equal(
        formatApiError(error),
        "Your session has expired. Please sign in again."
      );
    });

    it("handles 403 forbidden", () => {
      const error = new ApiError(403, {
        error: {
          code: "FORBIDDEN",
          message: "Forbidden access",
        },
      });
      assert.equal(
        formatApiError(error),
        "You do not have permission to perform this action."
      );
    });

    it("handles 404 not found", () => {
      const bookingError = new ApiError(404, {
        error: {
          code: "BOOKING_NOT_FOUND",
          message: "Booking not found",
        },
      });
      assert.equal(
        formatApiError(bookingError),
        "Booking not found or this link is no longer valid."
      );

      const generic404 = new ApiError(404, {
        error: {
          code: "RESOURCE_NOT_FOUND",
          message: "Resource not found",
        },
      });
      assert.equal(formatApiError(generic404), "The requested item was not found.");
    });

    it("handles 409 conflict scenarios", () => {
      const emailConflict = new ApiError(409, {
        error: {
          code: "EMAIL_CONFLICT",
          message: "Email taken",
        },
      });
      assert.equal(
        formatApiError(emailConflict),
        "An account with this email already exists."
      );

      const usernameConflict = new ApiError(409, {
        error: {
          code: "USERNAME_CONFLICT",
          message: "Username taken",
        },
      });
      assert.equal(
        formatApiError(usernameConflict),
        "This username is already taken. Please choose another."
      );

      const slotConflict = new ApiError(409, {
        error: {
          code: "SLOT_ALREADY_BOOKED",
          message: "Slot unavailable",
        },
      });
      assert.equal(
        formatApiError(slotConflict),
        "This time slot has already been booked. Please choose another time."
      );
    });

    it("handles 429 rate limiting", () => {
      const error = new ApiError(429, {
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "Rate limit reached",
        },
      });
      assert.equal(
        formatApiError(error),
        "Too many requests. Please wait a moment before trying again."
      );
    });

    it("handles 500 internal server error and sanitizes database/stack errors", () => {
      const error = new ApiError(500, {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Invalid `prisma.user.findUnique()` at RequestHandler (node_modules/prisma/runtime/RequestHandler.js:12)",
        },
      });
      assert.equal(
        formatApiError(error),
        "Something went wrong on our side. Please try again in a moment."
      );
    });

    it("handles 503 network failure and NEVER returns 'Failed to fetch'", () => {
      const networkError = new ApiError(503, {
        error: {
          code: "NETWORK_ERROR",
          message: "Failed to fetch",
        },
      });
      const msg = formatApiError(networkError);
      assert.equal(
        msg,
        "Unable to connect to the server. Please check your internet connection and try again."
      );
      assert.equal(msg.includes("Failed to fetch"), false);
    });

    it("handles 504 timeout", () => {
      const timeoutError = new ApiError(504, {
        error: {
          code: "TIMEOUT",
          message: "Request timed out",
        },
      });
      assert.equal(
        formatApiError(timeoutError),
        "The request is taking too long. Please try again."
      );
    });

    it("sanitizes raw browser TypeError 'Failed to fetch'", () => {
      const rawError = new TypeError("Failed to fetch");
      const msg = formatApiError(rawError);
      assert.equal(
        msg,
        "Unable to connect to the server. Please check your internet connection and try again."
      );
      assert.equal(msg.includes("Failed to fetch"), false);
      assert.equal(msg.includes("TypeError"), false);
    });

    it("extracts booking details from conflict errors", () => {
      const error = new ApiError(409, {
        error: {
          code: "BOOKING_ALREADY_EXISTS",
          message: "Booking exists",
          details: {
            booking: {
              id: "b-123",
              startTime: "2026-10-01T10:00:00Z",
              manageUrl: "/public/bookings/b-123",
            },
          },
        },
      });
      const booking = getExistingBookingFromError(error);
      assert.equal(booking?.id, "b-123");
      assert.equal(booking?.manageUrl, "/public/bookings/b-123");
    });
  });
});
