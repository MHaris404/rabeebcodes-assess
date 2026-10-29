export class AppError extends Error {
  constructor(status, code, message, fieldErrors) { super(message); Object.assign(this, { status, code, fieldErrors }); }
}
export const fail = (status, code, message) => { throw new AppError(status, code, message); };
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', result.error.flatten().fieldErrors);
  return result.data;
}
