const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pinoHttp = require('pino-http');
const logger = require('./logger');
const { pool, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
  customAttributeKeys: {
    reqId: 'requestId',
    responseTime: 'responseTimeMs',
  },
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});

app.use(httpLogger);

app.use((req, res, next) => {
  res.setHeader('X-Request-Id', req.id);
  next();
});

app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, `tutor-${uniqueSuffix}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Недопустимый формат файла. Разрешены только изображения (JPEG, PNG, WEBP).'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

function validateTutorData(data) {
  const errors = [];
  const { full_name, subject, price_per_hour, experience_years } = data;

  if (!full_name || full_name.trim().length < 2) {
    errors.push('ФИО репетитора обязательно и должно содержать не менее 2 символов.');
  }
  if (!subject || subject.trim().length < 2) {
    errors.push('Учебный предмет обязателен к заполнению.');
  }
  const price = Number(price_per_hour);
  if (isNaN(price) || price <= 0) {
    errors.push('Стоимость занятия в час должна быть положительным числом.');
  }
  const exp = Number(experience_years);
  if (isNaN(exp) || exp < 0 || exp > 70) {
    errors.push('Опыт работы должен быть неотрицательным числом (от 0 до 70 лет).');
  }

  return errors;
}



//GET /api/tutors 
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

    req.log.info({ count: result.rows.length, search: search || null }, 'Список репетиторов успешно получен');
    return res.status(200).json(result.rows);
  } catch (error) {
    next(error);
  }
});

//GET /api/tutors/:id
app.get('/api/tutors/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM tutors WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      req.log.warn({ tutorId: id }, 'Репетитор не найден');
      return res.status(404).json({ error: `Репетитор с ID ${id} не найден.` });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

//POST /api/tutors
app.post('/api/tutors', upload.single('avatar'), async (req, res, next) => {
  try {
    const errors = validateTutorData(req.body);
    if (errors.length > 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      req.log.warn({ validationErrors: errors }, 'Ошибка валидации при создании репетитора');
      return res.status(400).json({ error: 'Ошибка валидации данных', details: errors });
    }

    const { full_name, subject, price_per_hour, experience_years, bio } = req.body;
    const avatar_url = req.file ? `/uploads/${req.file.filename}` : null;

    const insertQuery = `
      INSERT INTO tutors (full_name, subject, price_per_hour, experience_years, bio, avatar_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const values = [full_name.trim(), subject.trim(), Number(price_per_hour), Number(experience_years), bio || '', avatar_url];
    const result = await pool.query(insertQuery, values);

    req.log.info({ createdTutorId: result.rows[0].id, full_name }, 'Новый репетитор успешно создан');
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (req.file) fs.unlinkSync(req.file.path);
    next(error);
  }
});

//PUT /api/tutors/:id
app.put('/api/tutors/:id', upload.single('avatar'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM tutors WHERE id = $1', [id]);

    if (existing.rows.length === 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      req.log.warn({ tutorId: id }, 'Попытка обновления несуществующего репетитора');
      return res.status(404).json({ error: `Репетитор с ID ${id} не найден.` });
    }

    const errors = validateTutorData(req.body);
    if (errors.length > 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      req.log.warn({ tutorId: id, validationErrors: errors }, 'Ошибка валидации при обновлении репетитора');
      return res.status(400).json({ error: 'Ошибка валидации данных', details: errors });
    }

    const currentTutor = existing.rows[0];
    const { full_name, subject, price_per_hour, experience_years, bio } = req.body;
    let avatar_url = currentTutor.avatar_url;

    if (req.file) {
      if (currentTutor.avatar_url) {
        const oldFilePath = path.join(__dirname, '..', currentTutor.avatar_url);
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

    req.log.info({ updatedTutorId: id }, 'Анкета репетитора успешно обновлена');
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    if (req.file) fs.unlinkSync(req.file.path);
    next(error);
  }
});

//DELETE /api/tutors/:id
app.delete('/api/tutors/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM tutors WHERE id = $1', [id]);

    if (existing.rows.length === 0) {
      req.log.warn({ tutorId: id }, 'Попытка удаления несуществующего репетитора');
      return res.status(404).json({ error: `Репетитор с ID ${id} не найден.` });
    }

    const tutor = existing.rows[0];
    if (tutor.avatar_url) {
      const filePath = path.join(__dirname, '..', tutor.avatar_url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await pool.query('DELETE FROM tutors WHERE id = $1', [id]);
    req.log.info({ deletedTutorId: id }, 'Репетитор успешно удален');
    return res.status(200).json({ message: `Репетитор с ID ${id} успешно удален.` });
  } catch (error) {
    next(error);
  }
});


app.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError) {
    req.log.warn({ multerCode: err.code, message: err.message }, 'Ошибка загрузки файла Multer');
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Размер файла превышает лимит в 5 МБ.' });
    }
    return res.status(400).json({ error: `Ошибка загрузки файла: ${err.message}` });
  }
  req.log.error(
    {
      err: {
        message: err.message,
        stack: err.stack,
      },
    },
    'Внутренняя ошибка сервера'
  );

  return res.status(500).json({ error: err.message || 'Внутренняя ошибка сервера' });
});


initDB().then(() => {
  app.listen(PORT, () => {
    logger.info({ port: PORT, event: 'SERVER_STARTED' }, `Бэкенд успешно запущен на порту ${PORT}`);
  });
});