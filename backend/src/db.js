const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'tutor_db',
});

// Инициализация базы данных 
const initDB = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS tutors (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(100) NOT NULL,
      subject VARCHAR(100) NOT NULL,
      price_per_hour INTEGER NOT NULL,
      experience_years INTEGER NOT NULL DEFAULT 0,
      bio TEXT,
      avatar_url VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(createTableQuery);
    console.log('Таблица tutors успешно проверена/создана.');

    const countRes = await pool.query('SELECT COUNT(*) FROM tutors');
    if (parseInt(countRes.rows[0].count, 10) === 0) {
      const seedQuery = `
        INSERT INTO tutors (full_name, subject, price_per_hour, experience_years, bio)
        VALUES 
          ('Алексей Смирнов', 'Высшая математика', 1500, 7, 'Преподаватель университета. Готовлю к сессиям, экзаменам и олимпиадам.'),
          ('Елена Кузнецова', 'Английский язык', 1800, 5, 'Сертификат CELTA. Подготовка к IELTS/TOEFL и разговорная практика.'),
          ('Дмитрий Морозов', 'Программирование (Python/JS)', 2200, 4, 'Действующий Senior разработчик. Обучение с нуля до первого оффера.');
      `;
      await pool.query(seedQuery);
      console.log('Тестовые данные успешно добавлены.');
    }
  } catch (error) {
    console.error('Ошибка инициализации БД:', error);
  }
};

module.exports = { pool, initDB };