const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt-temporary-access-key-secret-2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'jwt-refresh-key-secret-2026';


function generateTokens(user) {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
}


function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Временный ключ доступа (Bearer токен) не предоставлен.', 401, 'UNAUTHORIZED'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Срок действия временного ключа доступа истек.', 401, 'TOKEN_EXPIRED'));
    }
    return next(new AppError('Недействительный временный ключ доступа.', 401, 'INVALID_TOKEN'));
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Пользователь не аутентифицирован.', 401, 'UNAUTHORIZED'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Недостаточно прав. Требуется одна из ролей: [${allowedRoles.join(', ')}]. Ваша текущая роль: '${req.user.role}'.`,
          403,
          'FORBIDDEN'
        )
      );
    }

    next();
  };
}

module.exports = {
  generateTokens,
  verifyToken,
  requireRole,
  JWT_REFRESH_SECRET,
};