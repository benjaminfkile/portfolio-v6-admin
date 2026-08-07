/**
 * Shared helper for surfacing the API's failure reason in admin toasts/alerts.
 *
 * Admin mutations fail with the §4.3 error envelope `{ error: true, errorMsg }`; `errorMsg`
 * carries the specific reason (a duplicate slug, a zod validation failure, an out-of-range
 * value, …). Historically most admin catch branches dropped it and showed a generic string,
 * which made real bugs needlessly hard to diagnose. {@link serverMessage} pulls the envelope
 * message out of a rejected write so every failure surface can show it, falling back to the
 * caller's generic copy when there is no envelope (a network error, a non-JSON 5xx, …).
 *
 * It also DEFENDS the user from raw payloads: a naive server can hand back `errorMsg` that is
 * a serialized zod issue array (zod's default `ZodError.message` is exactly that). Rather than
 * dumping a JSON blob into a snackbar, {@link serverMessage} reduces it to a readable
 * one-liner (`sphere_detail.radius: Number must be less than or equal to 100`). The API is
 * concurrently being taught to send human-readable messages too, but we do not depend on that
 * — the reduction happens client-side regardless.
 */
import axios from 'axios';

/** The §4.3 error envelope shape we read `errorMsg` off of. */
interface ErrorEnvelope {
  errorMsg?: string;
}

/** A zod issue (or anything shaped like one) once JSON-parsed out of `errorMsg`. */
interface IssueLike {
  message?: unknown;
  path?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Render one zod-ish issue as `path.to.field: message`, or just the message when unpathed. */
function formatIssue(issue: unknown): string | null {
  if (!isRecord(issue) || typeof issue.message !== 'string' || issue.message.trim() === '') {
    return null;
  }
  const path = Array.isArray((issue as IssueLike).path)
    ? ((issue as IssueLike).path as unknown[])
        .filter((seg) => seg !== '' && seg != null)
        .join('.')
    : '';
  return path ? `${path}: ${issue.message}` : issue.message;
}

/**
 * Pull the list of issue strings out of a parsed JSON payload, if it looks like a zod error.
 * Handles the three shapes a server might emit: a bare issue array, a `{ issues: [...] }`
 * ZodError object, or a single `{ message }` object. Returns `[]` for anything else.
 */
function issuesFromParsed(parsed: unknown): string[] {
  const list = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.issues)
      ? (parsed.issues as unknown[])
      : isRecord(parsed) && typeof parsed.message === 'string'
        ? [parsed]
        : [];
  return list.map(formatIssue).filter((line): line is string => line !== null);
}

/**
 * Reduce a raw `errorMsg` to something safe to show. A plain human sentence is returned
 * as-is; a serialized zod issue array/object is collapsed to a one-liner; a payload that
 * merely *looks* like JSON but carries no readable issues falls back to `fallback` rather
 * than being dumped verbatim.
 */
function humanize(raw: string, fallback: string): string {
  const trimmed = raw.trim();

  // Only treat it as structured when it actually opens like JSON — a normal sentence such as
  // "Value must be in [1, 10]" must never be mistaken for a blob and clobbered.
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const issues = issuesFromParsed(JSON.parse(trimmed));
      if (issues.length > 0) return issues.join('; ');
    } catch {
      // Not valid JSON after all — fall through.
    }
    // It looked like a JSON blob but yielded no readable issues: never render it verbatim.
    return fallback;
  }

  // A "prefix: [ ...zod array... ]" form (e.g. "Invalid data: [{...}]"): keep the prefix and
  // reduce the trailing array. Only activates when the bracketed part parses to real issues,
  // so ordinary prose that merely contains brackets is left untouched.
  const open = trimmed.indexOf('[');
  const close = trimmed.lastIndexOf(']');
  if (open > 0 && close > open) {
    try {
      const issues = issuesFromParsed(JSON.parse(trimmed.slice(open, close + 1)));
      if (issues.length > 0) {
        const prefix = trimmed.slice(0, open).replace(/[:\s]+$/, '').trim();
        return prefix ? `${prefix}: ${issues.join('; ')}` : issues.join('; ');
      }
    } catch {
      // Brackets were just prose punctuation — leave the message as written.
    }
  }

  return raw;
}

/**
 * Extract a human-readable failure message from a rejected admin write.
 *
 * Returns the envelope's `errorMsg` (reduced to a readable one-liner if it is a zod blob)
 * when the response body carries one, else `fallback` (network errors and non-envelope
 * responses have none). Never returns a raw JSON/zod blob.
 */
export function serverMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ErrorEnvelope | undefined;
    if (typeof body?.errorMsg === 'string' && body.errorMsg.trim() !== '') {
      return humanize(body.errorMsg, fallback);
    }
  }
  return fallback;
}

export default serverMessage;
