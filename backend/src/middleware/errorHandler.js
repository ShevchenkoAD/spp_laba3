const multer = require('multer');

function errorHandler(err, req, res, _next) {
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let title = 'Ошибка сервера';
  let detail = err.message || 'Произошла непредвиденная ошибка на сервере.';

  if (err instanceof multer.MulterError) {
    statusCode = 400;
    code = 'FILE_UPLOAD_ERROR';
    detail = err.message;
  }

  if (statusCode === 400) title = 'Некорректный запрос';
  if (statusCode === 401) title = 'Требуется аутентификация';
  if (statusCode === 403) title = 'Доступ запрещен';
  if (statusCode === 404) title = 'Ресурс не найден';
  if (statusCode === 409) title = 'Конфликт данных';
  if (statusCode === 422) title = 'Ошибка валидации данных';

  return res.status(statusCode).json({
    status: statusCode,
    code,
    title,
    detail,
    instance: req.originalUrl,
    requestId: req.id,
    timestamp: new Date().toISOString(),
  });
}

module.exports = errorHandler;