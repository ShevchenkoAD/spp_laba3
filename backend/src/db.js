const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const logger = require('./logger');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'tutor_db',
});

const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'tutor', 'student')),
        full_name VARCHAR(100),
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        reset_token VARCHAR(255) DEFAULT NULL,
        reset_token_expires TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE DEFAULT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255) DEFAULT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP WITH TIME ZONE DEFAULT NULL;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_token_hash VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45),
        user_agent VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tutors (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        full_name VARCHAR(100) NOT NULL,
        subject VARCHAR(100) NOT NULL,
        price_per_hour INTEGER NOT NULL,
        experience_years INTEGER NOT NULL DEFAULT 0,
        bio TEXT,
        avatar_url VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      ALTER TABLE tutors ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    `);

    logger.info({ event: 'DB_TABLES_INITIALIZED' }, 'Таблицы users, sessions и tutors проверены');

    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(usersCount.rows[0].count, 10) === 0) {
      const hashAdmin = await bcrypt.hash('admin123', 10);
      const hashTutor1 = await bcrypt.hash('tutor123', 10);
      const hashTutor2 = await bcrypt.hash('tutor123', 10);
      const hashStudent = await bcrypt.hash('student123', 10);

      await pool.query(
        `INSERT INTO users (email, password_hash, role, full_name) VALUES ($1, $2, 'admin', 'Администратор')`,
        ['admin@tutor.ru', hashAdmin]
      );

      const tutor1Res = await pool.query(
        `INSERT INTO users (email, password_hash, role, full_name) VALUES ($1, $2, 'tutor', 'Алексей Смирнов') RETURNING id`,
        ['tutor@tutor.ru', hashTutor1]
      );

      const tutor2Res = await pool.query(
        `INSERT INTO users (email, password_hash, role, full_name) VALUES ($1, $2, 'tutor', 'Елена Кузнецова') RETURNING id`,
        ['tutor2@tutor.ru', hashTutor2]
      );

      await pool.query(
        `INSERT INTO users (email, password_hash, role, full_name) VALUES ($1, $2, 'student', 'Иван Студентов')`,
        ['student@tutor.ru', hashStudent]
      );

      await pool.query(
        `INSERT INTO tutors (user_id, full_name, subject, price_per_hour, experience_years, bio)
         VALUES ($1, 'Алексей Смирнов', 'Высшая математика', 1500, 7, 'Подготовка к экзаменам и олимпиадам.')`,
        [tutor1Res.rows[0].id]
      );

      await pool.query(
        `INSERT INTO tutors (user_id, full_name, subject, price_per_hour, experience_years, bio)
         VALUES 
          ($1, 'Елена Кузнецова', 'Английский язык', 1800, 5, 'Подготовка к IELTS и международным экзаменам.'),
          ($1, 'Дмитрий Морозов', 'Программирование', 2200, 4, 'Обучение backend-разработке на Node.js.')`,
        [tutor2Res.rows[0].id]
      );

      logger.info({ event: 'DB_SEED_COMPLETED' }, 'Начальные учетные записи и распределенные анкеты успешно созданы');
    }
  } catch (error) {
    logger.error({ event: 'DB_INIT_ERROR', err: error.message, stack: error.stack }, 'Ошибка инициализации БД');
  }
};

module.exports = { pool, initDB };