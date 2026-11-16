export interface DeadlineInput {
  /** Deprecated ambiguous input, retained for compatibility. */
  deadline?: number;
  deadlineMinutes?: number;
  deadlineTimestamp?: number;
}

const requireFuture = (deadline: number, now: number): number => {
  if (!Number.isSafeInteger(deadline) || deadline <= now) {
    throw new Error("Deadline must resolve to a future, safe integer Unix timestamp.");
  }
  return deadline;
};

export const resolveDeadline = (
  input: DeadlineInput,
  defaultMinutes: number,
  now = Math.floor(Date.now() / 1000),
): number => {
  const supplied = [input.deadline, input.deadlineMinutes, input.deadlineTimestamp].filter(
    (value) => value !== undefined,
  );
  if (supplied.length > 1) {
    throw new Error("Use only one of deadline, deadlineMinutes, or deadlineTimestamp.");
  }
  if (input.deadlineTimestamp !== undefined) {
    return requireFuture(input.deadlineTimestamp, now);
  }
  if (input.deadlineMinutes !== undefined) {
    if (!Number.isFinite(input.deadlineMinutes) || input.deadlineMinutes <= 0) {
      throw new Error("deadlineMinutes must be a finite positive number.");
    }
    return requireFuture(now + Math.round(input.deadlineMinutes * 60), now);
  }
  // Preserve the documented legacy interpretation, including zero = default.
  // A legacy timestamp within 60 seconds or in the past remains ambiguous;
  // callers must migrate to deadlineTimestamp to enforce expiration safely.
  if (input.deadline) {
    if (!Number.isFinite(input.deadline) || input.deadline < 0) {
      throw new Error("Legacy deadline must be a finite positive number.");
    }
    return requireFuture(
      input.deadline > now + 60
        ? Math.floor(input.deadline)
        : now + Math.round(input.deadline) * 60,
      now,
    );
  }
  if (input.deadline !== undefined && !Number.isFinite(input.deadline)) {
    throw new Error("Legacy deadline must be finite.");
  }
  return requireFuture(now + defaultMinutes * 60, now);
};
