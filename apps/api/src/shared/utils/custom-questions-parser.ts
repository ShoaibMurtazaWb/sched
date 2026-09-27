import { randomUUID } from "node:crypto";
import type {
  BookingCustomResponseSnapshot,
  CustomQuestion,
  InboundCustomQuestion,
} from "@sched/api-contract";
import {
  customQuestionsListSchema,
  CustomQuestionTypeEnum,
} from "@sched/api-contract";
import { BadRequestError } from "../errors/app-error";

/**
 * Reconciles inbound questions (create/update), generating stable IDs for new questions/options
 * and strictly enforcing uniqueness and option limits.
 */
export function reconcileCustomQuestions(
  inbound: InboundCustomQuestion[] | undefined | null
): CustomQuestion[] {
  if (!inbound || !Array.isArray(inbound) || inbound.length === 0) {
    return [];
  }

  const seenQuestionIds = new Set<string>();
  const reconciled: CustomQuestion[] = [];

  for (const q of inbound) {
    const questionId = q.id?.trim() || `q_${randomUUID()}`;
    if (seenQuestionIds.has(questionId)) {
      throw new BadRequestError(
        "DUPLICATE_QUESTION_ID",
        `Duplicate question identifier: ${questionId}`
      );
    }
    seenQuestionIds.add(questionId);

    if (q.type === "TEXT") {
      reconciled.push({
        id: questionId,
        type: "TEXT",
        label: q.label.trim(),
        required: Boolean(q.required),
        placeholder: q.placeholder?.trim() || undefined,
      });
    } else if (q.type === "TEXTAREA") {
      reconciled.push({
        id: questionId,
        type: "TEXTAREA",
        label: q.label.trim(),
        required: Boolean(q.required),
        placeholder: q.placeholder?.trim() || undefined,
      });
    } else if (q.type === "SELECT") {
      if (!q.options || q.options.length < 2) {
        throw new BadRequestError(
          "INVALID_QUESTION_CONFIG",
          `Select question "${q.label}" requires at least 2 options.`
        );
      }

      const seenOptionIds = new Set<string>();
      const options = q.options.map((opt) => {
        const optionId = opt.id?.trim() || `opt_${randomUUID()}`;
        if (seenOptionIds.has(optionId)) {
          throw new BadRequestError(
            "DUPLICATE_OPTION_ID",
            `Duplicate option identifier "${optionId}" in question "${q.label}".`
          );
        }
        seenOptionIds.add(optionId);
        return {
          id: optionId,
          label: opt.label.trim(),
        };
      });

      reconciled.push({
        id: questionId,
        type: "SELECT",
        label: q.label.trim(),
        required: Boolean(q.required),
        allowMultiple: Boolean(q.allowMultiple),
        options,
      });
    } else if (q.type === "CHECKBOX") {
      reconciled.push({
        id: questionId,
        type: "CHECKBOX",
        label: q.label.trim(),
        required: Boolean(q.required),
      });
    }
  }

  const parseResult = customQuestionsListSchema.safeParse(reconciled);
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0];
    throw new BadRequestError(
      "INVALID_QUESTION_CONFIG",
      issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid custom questions configuration."
    );
  }

  return parseResult.data;
}

/**
 * Safely parses stored JSONB custom questions from database.
 */
export function parseStoredCustomQuestions(raw: unknown): CustomQuestion[] {
  if (!raw || !Array.isArray(raw)) {
    return [];
  }
  const parsed = customQuestionsListSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/**
 * Validates submitted attendee responses against the event type's configured custom questions,
 * enforcing type safety, hard string lengths, required checks, and option validity.
 * Returns a self-contained snapshot array to be stored on the Booking.
 */
export function validateAndBuildCustomResponses(
  questions: CustomQuestion[],
  submitted: Record<string, unknown> | undefined
): BookingCustomResponseSnapshot[] {
  const responses = submitted || {};
  const submittedKeys = Object.keys(responses);
  const questionMap = new Map<string, CustomQuestion>(questions.map((q) => [q.id, q]));

  // 1. Reject unknown question IDs submitted
  for (const key of submittedKeys) {
    if (!questionMap.has(key)) {
      throw new BadRequestError(
        "UNKNOWN_QUESTION",
        `Unknown question response submitted: "${key}".`
      );
    }
  }

  const snapshots: BookingCustomResponseSnapshot[] = [];

  // 2. Validate every configured question
  for (const q of questions) {
    const rawVal = responses[q.id];

    if (q.type === "TEXT") {
      if (rawVal === undefined || rawVal === null || rawVal === "") {
        if (q.required) {
          throw new BadRequestError(
            "REQUIRED_QUESTION_MISSING",
            `Question "${q.label}" is required.`
          );
        }
        continue;
      }

      if (typeof rawVal !== "string") {
        throw new BadRequestError(
          "INVALID_RESPONSE_TYPE",
          `Response for "${q.label}" must be a string.`
        );
      }

      const trimmed = rawVal.trim();
      if (q.required && trimmed.length === 0) {
        throw new BadRequestError(
          "REQUIRED_QUESTION_MISSING",
          `Question "${q.label}" is required.`
        );
      }

      if (trimmed.length > 255) {
        throw new BadRequestError(
          "RESPONSE_TOO_LONG",
          `Response for "${q.label}" exceeds the 255 character limit.`
        );
      }

      snapshots.push({
        questionId: q.id,
        label: q.label,
        type: "TEXT",
        value: trimmed,
      });
    } else if (q.type === "TEXTAREA") {
      if (rawVal === undefined || rawVal === null || rawVal === "") {
        if (q.required) {
          throw new BadRequestError(
            "REQUIRED_QUESTION_MISSING",
            `Question "${q.label}" is required.`
          );
        }
        continue;
      }

      if (typeof rawVal !== "string") {
        throw new BadRequestError(
          "INVALID_RESPONSE_TYPE",
          `Response for "${q.label}" must be a string.`
        );
      }

      const trimmed = rawVal.trim();
      if (q.required && trimmed.length === 0) {
        throw new BadRequestError(
          "REQUIRED_QUESTION_MISSING",
          `Question "${q.label}" is required.`
        );
      }

      if (trimmed.length > 2000) {
        throw new BadRequestError(
          "RESPONSE_TOO_LONG",
          `Response for "${q.label}" exceeds the 2000 character limit.`
        );
      }

      snapshots.push({
        questionId: q.id,
        label: q.label,
        type: "TEXTAREA",
        value: trimmed,
      });
    } else if (q.type === "SELECT") {
      const isMissing =
        rawVal === undefined ||
        rawVal === null ||
        rawVal === "" ||
        (Array.isArray(rawVal) && rawVal.length === 0);

      if (isMissing) {
        if (q.required) {
          throw new BadRequestError(
            "REQUIRED_QUESTION_MISSING",
            `Question "${q.label}" is required.`
          );
        }
        continue;
      }

      if (q.allowMultiple) {
        let selectedIds: string[] = [];
        if (Array.isArray(rawVal)) {
          selectedIds = rawVal.map((v) => String(v).trim()).filter(Boolean);
        } else if (typeof rawVal === "string") {
          selectedIds = rawVal.split(",").map((s) => s.trim()).filter(Boolean);
        } else {
          throw new BadRequestError(
            "INVALID_RESPONSE_TYPE",
            `Response for "${q.label}" must be an array of option IDs.`
          );
        }

        if (q.required && selectedIds.length === 0) {
          throw new BadRequestError(
            "REQUIRED_QUESTION_MISSING",
            `Question "${q.label}" is required.`
          );
        }

        const validOptions = q.options.filter((opt) => selectedIds.includes(opt.id));
        if (validOptions.length !== selectedIds.length) {
          throw new BadRequestError(
            "INVALID_OPTION",
            `Invalid option selected for question "${q.label}".`
          );
        }

        snapshots.push({
          questionId: q.id,
          label: q.label,
          type: "SELECT",
          value: selectedIds.join(", "),
          selectedOptionLabel: validOptions.map((o) => o.label).join(", "),
        });
      } else {
        if (typeof rawVal !== "string") {
          throw new BadRequestError(
            "INVALID_RESPONSE_TYPE",
            `Response for "${q.label}" must be an option ID.`
          );
        }

        const selectedOption = q.options.find((opt) => opt.id === rawVal.trim());
        if (!selectedOption) {
          throw new BadRequestError(
            "INVALID_OPTION",
            `Invalid option selected for question "${q.label}".`
          );
        }

        snapshots.push({
          questionId: q.id,
          label: q.label,
          type: "SELECT",
          value: selectedOption.id,
          selectedOptionLabel: selectedOption.label,
        });
      }
    } else if (q.type === "CHECKBOX") {
      if (rawVal === undefined || rawVal === null) {
        if (q.required) {
          throw new BadRequestError(
            "REQUIRED_QUESTION_MISSING",
            `Question "${q.label}" must be checked.`
          );
        }
        continue;
      }

      if (typeof rawVal !== "boolean") {
        throw new BadRequestError(
          "INVALID_RESPONSE_TYPE",
          `Response for "${q.label}" must be a boolean.`
        );
      }

      if (q.required && !rawVal) {
        throw new BadRequestError(
          "REQUIRED_QUESTION_MISSING",
          `Question "${q.label}" must be checked.`
        );
      }

      snapshots.push({
        questionId: q.id,
        label: q.label,
        type: "CHECKBOX",
        value: rawVal,
      });
    }
  }

  return snapshots;
}

/**
 * Safely parses stored JSONB booking custom responses from database.
 */
export function parseStoredBookingCustomResponses(
  raw: unknown
): BookingCustomResponseSnapshot[] | null {
  if (!raw || !Array.isArray(raw)) {
    return null;
  }

  const results: BookingCustomResponseSnapshot[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === "object" &&
      "questionId" in item &&
      "label" in item &&
      "type" in item &&
      "value" in item
    ) {
      const typeStr = String(item.type);
      const parsedType = CustomQuestionTypeEnum.safeParse(typeStr);
      if (parsedType.success) {
        results.push({
          questionId: String(item.questionId),
          label: String(item.label),
          type: parsedType.data,
          value:
            typeof item.value === "boolean" ? item.value : String(item.value),
          selectedOptionLabel:
            typeof item.selectedOptionLabel === "string"
              ? item.selectedOptionLabel
              : null,
        });
      }
    }
  }

  return results.length > 0 ? results : null;
}
