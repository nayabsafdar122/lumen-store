const { AppError } = require('../utils/errors');

// validate({ body, query, params }) — each is a zod schema. Parsed values replace the raw ones.
const validate = (schemas) => (req, res, next) => {
  for (const key of ['params', 'query', 'body']) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return next(new AppError(400, 'Validation failed', details));
    }
    // req.query is a getter in Express 5, so store parsed values on req.valid
    req.valid = { ...(req.valid || {}), [key]: result.data };
  }
  next();
};

module.exports = validate;
