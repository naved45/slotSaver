/**
 * Validates req.body / req.query / req.params with a Zod schema. The parsed value is stored
 * on req.input so that Express 5's read-only req.query is never assigned to.
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) return next(result.error);
    req.input = { ...(req.input ?? {}), [source]: result.data };
    return next();
  };
}

/** Shorthand for reading validated input. */
export function inputOf(req, source = 'body') {
  return req.input?.[source] ?? {};
}
