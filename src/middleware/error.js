const { AppError } = require('../utils/errors');
const config = require('../config');

const notFound = (req, res, next) => next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err.name === 'SequelizeUniqueConstraintError') {
    err = new AppError(409, 'A record with that value already exists');
  } else if (err.name === 'SequelizeValidationError') {
    err = new AppError(400, 'Validation failed', err.errors.map((e) => ({ path: e.path, message: e.message })));
  } else if (err.type === 'entity.parse.failed') {
    err = new AppError(400, 'Malformed JSON body');
  }

  const status = err.status || 500;
  if (status >= 500 && config.env !== 'test') console.error(err);

  res.status(status).json({
    error: {
      message: status >= 500 && config.env === 'production' ? 'Internal server error' : err.message,
      ...(err.details ? { details: err.details } : {}),
    },
  });
};

module.exports = { notFound, errorHandler };
