const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const logger = require('./logger');
const { pool, initDB } = require('./db');
const AppError = require('./utils/AppError');
const errorHandler = require('./middleware/errorHandler');
const { sendPasswordResetEmail } = require('./utils/mailer');
const { generateTokens, verifyToken, requireRole, JWT_REFRESH_SECRET } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;


const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
  customAttributeKeys: {
    reqId: 'requestId',
    responseTime: 'responseTimeMs',
  },
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  redact: ['req.headers.authorization', 'req.body.password', 'req.body.newPassword'],
});

app.use(httpLogger);
app.use((req, res, next) => {
  res.setHeader('X-Request-Id', req.id);
  next();
});

app.use(cors());
app.use(express.json());


const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 10, 
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, _res, next) => {
    next(new AppError('Превышен лимит попыток входа с вашего IP-адреса. Попробуйте через 15 минут.', 429, 'TOO_MANY_REQUESTS'));
  },
});


const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `tutor-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Разрешены только файлы изображений (JPEG, PNG, WEBP)', 400, 'INVALID_FILE_TYPE'), false);
    }
  },
});

function validateTutorData(data) {
  const errors = [];
  const { full_name, subject, price_per_hour, experience_years } = data;
  if (!full_name || full_name.trim().length < 2) errors.push({ field: 'full_name', reason: 'ФИО обязательно (не менее 2 символов).' });
  if (!subject || subject.trim().length < 2) errors.push({ field: 'subject', reason: 'Предмет обязателен.' });
  const price = Number(price_per_hour);
  if (isNaN(price) || price <= 0) errors.push({ field: 'price_per_hour', reason: 'Цена должна быть положительным числом.' });
  const exp = Number(experience_years);
  if (isNaN(exp) || exp < 0 || exp > 70) errors.push({ field: 'experience_years', reason: 'Опыт работы должен быть от 0 до 70 лет.' });
  return errors;
}


app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return next(new AppError('Необходимо указать email и пароль.', 400, 'BAD_REQUEST'));
    }

    const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (userRes.rows.length === 0) {
      return next(new AppError('Неверный адрес электронной почты или пароль.', 401, 'INVALID_CREDENTIALS'));
    }

    const user = userRes.rows[0];

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const waitMinutes = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      req.log.warn({ email, lockedUntil: user.locked_until }, 'Попытка входа в заблокированный аккаунт');
      return next(
        new AppError(
          `Учетная запись временно заблокирована из-за 5 неудачных попыток входа. Попробуйте через ${waitMinutes} мин.`,
          429,
          'ACCOUNT_TEMPORARILY_LOCKED'
        )
      );
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      const newAttempts = user.failed_attempts + 1;
      let lockQuery = 'UPDATE users SET failed_attempts = $1 WHERE id = $2';
      let lockParams = [newAttempts, user.id];

      if (newAttempts >= 5) {
        lockQuery = "UPDATE users SET failed_attempts = $1, locked_until = NOW() + INTERVAL '15 MINUTE' WHERE id = $2";
        req.log.warn({ email, userId: user.id }, 'Аккаунт заблокирован на 15 минут после 5 неверных попыток');
      }

      await pool.query(lockQuery, lockParams);
      return next(new AppError('Неверный адрес электронной почты или пароль.', 401, 'INVALID_CREDENTIALS'));
    }

    await pool.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);

    const tokens = generateTokens(user);

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Неизвестное устройство';
    const tokenHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');

    const sessionRes = await pool.query(
      `INSERT INTO sessions (user_id, refresh_token_hash, ip_address, user_agent)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [user.id, tokenHash, clientIp, userAgent.substring(0, 255)]
    );

    req.log.info({ userId: user.id, sessionId: sessionRes.rows[0].id }, 'Создана новая активная сессия');

    return res.status(200).json({
      user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
      sessionId: sessionRes.rows[0].id,
      ...tokens,
    });
  } catch (error) {
    next(error);
  }
});


app.post('/api/auth/logout', verifyToken, async (req, res, next) => {
  try {
    const { sessionId } = req.body;

    if (sessionId) {
      await pool.query('DELETE FROM sessions WHERE id = $1 AND user_id = $2', [sessionId, req.user.id]);
    } else {
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      await pool.query(
        'DELETE FROM sessions WHERE id = (SELECT id FROM sessions WHERE user_id = $1 AND ip_address = $2 ORDER BY last_active_at DESC LIMIT 1)',
        [req.user.id, clientIp]
      );
    }

    req.log.info({ userId: req.user.id, sessionId }, 'Сессия успешно закрыта при выходе');
    return res.status(204).send();
  } catch (error) {
    next(error);
  } 
});


app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { email, password, full_name, role } = req.body;
    if (!email || !password || password.length < 6) {
      return next(new AppError('Email и пароль (минимум 6 символов) обязательны.', 400, 'VALIDATION_FAILED'));
    }

    const assignedRole = role === 'tutor' ? 'tutor' : 'student';

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return next(new AppError('Пользователь с указанным email уже зарегистрирован.', 409, 'RESOURCE_CONFLICT'));
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, full_name) VALUES ($1, $2, $3, $4) RETURNING id, email, role, full_name`,
      [email.toLowerCase().trim(), passwordHash, assignedRole, full_name || '']
    );

    const newUser = result.rows[0];
    const tokens = generateTokens(newUser);

    return res.status(201).json({ user: newUser, ...tokens });
  } catch (error) {
    next(error);
  }
});


app.get('/api/auth/sessions', verifyToken, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, ip_address, user_agent, created_at, last_active_at 
       FROM sessions WHERE user_id = $1 ORDER BY last_active_at DESC`,
      [req.user.id]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    next(error);
  }
});


app.delete('/api/auth/sessions/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM sessions WHERE id = $1 AND user_id = $2 RETURNING id', [id, req.user.id]);
    if (result.rows.length === 0) {
      return next(new AppError('Сессия не найдена или принадлежит другому пользователю.', 404, 'NOT_FOUND'));
    }
    req.log.info({ userId: req.user.id, sessionId: id }, 'Сессия завершена пользователем');
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
});


app.post('/api/auth/refresh', async (req, res, next) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return next(new AppError('Refresh токен не передан.', 400, 'BAD_REQUEST'));
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const sessionRes = await pool.query('SELECT id FROM sessions WHERE user_id = $1 AND refresh_token_hash = $2', [decoded.id, tokenHash]);
    if (sessionRes.rows.length === 0) {
      return next(new AppError('Сессия была принудительно завершена на другом устройстве.', 401, 'SESSION_REVOKED'));
    }

    const userRes = await pool.query('SELECT id, email, role, full_name FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) {
      return next(new AppError('Пользователь не найден.', 401, 'UNAUTHORIZED'));
    }

    const tokens = generateTokens(userRes.rows[0]);
    const newTokenHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');

    await pool.query('UPDATE sessions SET refresh_token_hash = $1, last_active_at = NOW() WHERE id = $2', [
      newTokenHash,
      sessionRes.rows[0].id,
    ]);

    return res.status(200).json(tokens);
  } catch (err) {
    return next(new AppError('Недействительный или просроченный Refresh токен.', 401, 'TOKEN_EXPIRED'));
  }
});




app.post('/api/auth/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return next(new AppError('Укажите email.', 400, 'BAD_REQUEST'));

    const userRes = await pool.query('SELECT id, email FROM users WHERE email = $1', [email.toLowerCase().trim()]);

    if (userRes.rows.length === 0) {
      return res.status(200).json({
        message: 'Если учетная запись существует, письмо с инструкциями по сбросу отправлено на указанный адрес.',
      });
    }

    const user = userRes.rows[0];
    const resetToken = crypto.randomBytes(24).toString('hex');
    await pool.query(
      "UPDATE users SET reset_token = $1, reset_token_expires = NOW() + INTERVAL '1 HOUR' WHERE id = $2",
      [resetToken, user.id]
    );

    await sendPasswordResetEmail(user.email, resetToken);

    return res.status(200).json({
      message: 'Если учетная запись существует, письмо с инструкциями по сбросу отправлено на указанный адрес.',
    });
  } catch (error) {
    next(error);
  }
});


app.post('/api/auth/reset-password', async (req, res, next) => {
  try {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword || newPassword.length < 6) {
      return next(new AppError('Необходимо указать email, токен сброса и новый пароль (не менее 6 символов).', 400, 'BAD_REQUEST'));
    }

    const userRes = await pool.query(
      'SELECT id, reset_token, reset_token_expires FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (userRes.rows.length === 0) {
      return next(new AppError('Недействительный запрос сброса пароля.', 400, 'INVALID_RESET_REQUEST'));
    }

    const user = userRes.rows[0];

    if (!user.reset_token || user.reset_token !== token) {
      return next(new AppError('Неверный или использованный токен сброса.', 400, 'INVALID_TOKEN'));
    }

    if (new Date(user.reset_token_expires) < new Date()) {
      return next(new AppError('Срок действия токена сброса истек.', 400, 'TOKEN_EXPIRED'));
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL, failed_attempts = 0, locked_until = NULL WHERE id = $2',
      [newHash, user.id]
    );
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [user.id]);

    req.log.info({ userId: user.id }, 'Пароль успешно сброшен и обновлен, старые сессии аннулированы');

    return res.status(200).json({ message: 'Пароль успешно изменен. Теперь вы можете войти в систему с новым паролем.' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', verifyToken, async (req, res, next) => {
  try {
    const userRes = await pool.query('SELECT id, email, role, full_name FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows.length === 0) return next(new AppError('Пользователь не найден.', 404, 'NOT_FOUND'));
    return res.status(200).json(userRes.rows[0]);
  } catch (error) {
    next(error);
  }
});



app.get('/api/tutors', async (req, res, next) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM tutors';
    const params = [];
    if (search && search.trim() !== '') {
      query += ' WHERE full_name ILIKE $1 OR subject ILIKE $1';
      params.push(`%${search.trim()}%`);
    }
    query += ' ORDER BY id DESC';
    const result = await pool.query(query, params);
    return res.status(200).json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/tutors/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM tutors WHERE id = $1', [id]);
    if (result.rows.length === 0) return next(new AppError(`Анкета репетитора с ID ${id} не найдена.`, 404, 'NOT_FOUND'));
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.post('/api/tutors', verifyToken, requireRole('tutor', 'admin'), upload.single('avatar'), async (req, res, next) => {
  try {
    const errors = validateTutorData(req.body);
    if (errors.length > 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return next(new AppError('Введенные данные анкеты содержат ошибки.', 422, 'VALIDATION_FAILED', errors));
    }

    const { full_name, subject, price_per_hour, experience_years, bio } = req.body;
    const avatar_url = req.file ? `/uploads/${req.file.filename}` : null;

    const insertQuery = `
      INSERT INTO tutors (user_id, full_name, subject, price_per_hour, experience_years, bio, avatar_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const values = [req.user.id, full_name.trim(), subject.trim(), Number(price_per_hour), Number(experience_years), bio || '', avatar_url];
    const result = await pool.query(insertQuery, values);

    res.setHeader('Location', `/api/tutors/${result.rows[0].id}`);
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (req.file) fs.unlinkSync(req.file.path);
    next(error);
  }
});

app.put('/api/tutors/:id', verifyToken, requireRole('tutor', 'admin'), upload.single('avatar'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM tutors WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return next(new AppError(`Анкета репетитора с ID ${id} не найдена.`, 404, 'NOT_FOUND'));
    }

    const tutor = existing.rows[0];
    if (req.user.role !== 'admin' && tutor.user_id !== req.user.id) {
      if (req.file) fs.unlinkSync(req.file.path);
      return next(new AppError('Доступ запрещен: репетитор может редактировать только свою собственную анкету.', 403, 'FORBIDDEN'));
    }

    const errors = validateTutorData(req.body);
    if (errors.length > 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return next(new AppError('Введенные данные анкеты содержат ошибки.', 422, 'VALIDATION_FAILED', errors));
    }

    const { full_name, subject, price_per_hour, experience_years, bio } = req.body;
    let avatar_url = tutor.avatar_url;

    if (req.file) {
      if (tutor.avatar_url) {
        const oldFilePath = path.join(__dirname, '..', tutor.avatar_url);
        if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
      }
      avatar_url = `/uploads/${req.file.filename}`;
    }

    const updateQuery = `
      UPDATE tutors
      SET full_name = $1, subject = $2, price_per_hour = $3, experience_years = $4, bio = $5, avatar_url = $6
      WHERE id = $7
      RETURNING *;
    `;
    const values = [full_name.trim(), subject.trim(), Number(price_per_hour), Number(experience_years), bio || '', avatar_url, id];
    const result = await pool.query(updateQuery, values);

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    if (req.file) fs.unlinkSync(req.file.path);
    next(error);
  }
});

app.delete('/api/tutors/:id', verifyToken, requireRole('tutor', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM tutors WHERE id = $1', [id]);
    if (existing.rows.length === 0) return next(new AppError(`Анкета репетитора с ID ${id} не найдена.`, 404, 'NOT_FOUND'));

    const tutor = existing.rows[0];
    if (req.user.role !== 'admin' && tutor.user_id !== req.user.id) {
      return next(new AppError('Доступ запрещен: репетитор может удалять только свою собственную анкету.', 403, 'FORBIDDEN'));
    }

    if (tutor.avatar_url) {
      const filePath = path.join(__dirname, '..', tutor.avatar_url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await pool.query('DELETE FROM tutors WHERE id = $1', [id]);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.use((req, _res, next) => {
  next(new AppError(`Маршрут ${req.method} ${req.originalUrl} не найден.`, 404, 'NOT_FOUND'));
});

app.use(errorHandler);

initDB().then(() => {
  app.listen(PORT, () => {
    logger.info({ port: PORT, event: 'SERVER_STARTED' }, `Сервер запущен на порту ${PORT}`);
  });
});