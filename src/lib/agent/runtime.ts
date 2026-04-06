import type { JobRunContext } from "@/types/agent";

export function hasTimeBudgetExpired(
  context: JobRunContext,
  bufferMs = 0,
): boolean {
  return Date.now() + bufferMs >= context.softDeadlineAt;
}

export function markStoppedEarly(context: JobRunContext) {
  context.stoppedEarly = true;
}
