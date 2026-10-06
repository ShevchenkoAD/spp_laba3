import React, { useState, useEffect } from 'react';

const API_BASE = '/api/tutors';

export default function App() {
  const [tutors, setTutors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  
  // Уведомления и ошибки
  const [globalError, setGlobalError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Состояние модального окна добавления/редактирования
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
  const [selectedTutorId, setSelectedTutorId] = useState(null);

  // Поля формы
  const [formData, setFormData] = useState({
    full_name: '',
    subject: '',
    price_per_hour: '',
    experience_years: '',
    bio: ''
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [formErrors, setFormErrors] = useState([]);

  // Загрузка списка репетиторов
  const fetchTutors = async (searchQuery = '') => {
    try {
      setLoading(true);
      setGlobalError(null);
      const url = searchQuery ? `${API_BASE}?search=${encodeURIComponent(searchQuery)}` : API_BASE;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Ошибка сервера: статус ${res.status}`);
      }
      const data = await res.json();
      setTutors(data);
    } catch (err) {
      setGlobalError(err.message || 'Не удалось загрузить данные.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTutors();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchTutors(search);
  };

  // Открытие модалки на создание
  const handleOpenCreate = () => {
    setModalMode('create');
    setSelectedTutorId(null);
    setFormData({
      full_name: '',
      subject: '',
      price_per_hour: '',
      experience_years: '',
      bio: ''
    });
    setSelectedFile(null);
    setFilePreview(null);
    setFormErrors([]);
    setIsModalOpen(true);
  };

  // Открытие модалки на редактирование
  const handleOpenEdit = (tutor) => {
    setModalMode('edit');
    setSelectedTutorId(tutor.id);
    setFormData({
      full_name: tutor.full_name,
      subject: tutor.subject,
      price_per_hour: tutor.price_per_hour,
      experience_years: tutor.experience_years,
      bio: tutor.bio || ''
    });
    setSelectedFile(null);
    setFilePreview(tutor.avatar_url || null);
    setFormErrors([]);
    setIsModalOpen(true);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file));
    }
  };

  // Отправка формы 
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setFormErrors([]);

    const bodyFormData = new FormData();
    bodyFormData.append('full_name', formData.full_name);
    bodyFormData.append('subject', formData.subject);
    bodyFormData.append('price_per_hour', formData.price_per_hour);
    bodyFormData.append('experience_years', formData.experience_years);
    bodyFormData.append('bio', formData.bio);
    if (selectedFile) {
      bodyFormData.append('avatar', selectedFile);
    }

    try {
      const isEdit = modalMode === 'edit';
      const url = isEdit ? `${API_BASE}/${selectedTutorId}` : API_BASE;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        body: bodyFormData,
      });

      const responseData = await res.json();

      if (!res.ok) {
        if (responseData.details && Array.isArray(responseData.details)) {
          setFormErrors(responseData.details);
        } else {
          setFormErrors([responseData.error || 'Произошла непредвиденная ошибка']);
        }
        return;
      }

      // Обновление состояния приложения без перезагрузки
      if (isEdit) {
        setTutors(tutors.map((item) => (item.id === selectedTutorId ? responseData : item)));
        showSuccess('Анкета репетитора успешно обновлена!');
      } else {
        setTutors([responseData, ...tutors]);
        showSuccess('Репетитор успешно добавлен в базу!');
      }

      setIsModalOpen(false);
    } catch (err) {
      setFormErrors([err.message || 'Ошибка отправки запроса на сервер.']);
    }
  };

  // Удаление записи 
  const handleDelete = async (id, name) => {
    if (!window.confirm(`Вы уверены, что хотите удалить репетитора "${name}"?`)) return;

    try {
      const res = await fetch(`${API_BASE}/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Ошибка при удалении');
      }

      // Удаление из React-состояния
      setTutors(tutors.filter((t) => t.id !== id));
      showSuccess('Анкета репетитора удалена.');
    } catch (err) {
      setGlobalError(err.message);
    }
  };

  const showSuccess = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  return (
    <div className="container">
      {/* Шапка */}
      <header className="header">
        <div>
          <h1>Платформа поиска репетиторов</h1>
        </div>
        <button className="btn btn-primary" onClick={handleOpenCreate}>
          + Добавить репетитора
        </button>
      </header>

      {/* Уведомления об успехе/ошибке */}
      {successMessage && <div className="alert alert-success">{successMessage}</div>}
      {globalError && <div className="alert alert-error">{globalError}</div>}

      {/* Поиск */}
      <form className="search-bar" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          className="search-input"
          placeholder="Поиск по ФИО или учебному предмету..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn btn-secondary">Найти</button>
        {search && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => { setSearch(''); fetchTutors(''); }}
          >
            Сброс
          </button>
        )}
      </form>

      {/* Индикатор загрузки */}
      {loading && <p style={{ textAlign: 'center', padding: '20px' }}>Загрузка данных...</p>}

      {/* Список карточек */}
      {!loading && tutors.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
          Репетиторы не найдены. Нажмите «+ Добавить репетитора», чтобы создать анкету.
        </div>
      ) : (
        <div className="cards-grid">
          {tutors.map((tutor) => (
            <div key={tutor.id} className="tutor-card">
              <div className="card-header">
                {tutor.avatar_url ? (
                  <img src={tutor.avatar_url} alt={tutor.full_name} className="avatar" />
                ) : (
                  <div className="avatar avatar-placeholder">
                    {tutor.full_name.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 style={{ fontSize: '18px' }}>{tutor.full_name}</h3>
                  <span className="badge">{tutor.subject}</span>
                </div>
              </div>

              <div className="info-item">
                <strong>Ставка:</strong> {tutor.price_per_hour} ₽ / час
              </div>
              <div className="info-item">
                <strong>Опыт преподавания:</strong> {tutor.experience_years} лет
              </div>
              <div className="bio">{tutor.bio || 'Описание профиля не указано.'}</div>

              <div className="card-actions">
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => handleOpenEdit(tutor)}
                >
                  Редактировать
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => handleDelete(tutor.id, tutor.full_name)}
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Модальное окно создания / редактирования */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: '16px' }}>
              {modalMode === 'create' ? 'Добавление нового репетитора' : 'Редактирование анкеты'}
            </h2>

            {/* Вывод серверных ошибок валидации */}
            {formErrors.length > 0 && (
              <div className="alert alert-error">
                <strong>Внимание:</strong>
                <ul style={{ paddingLeft: '20px', marginTop: '6px' }}>
                  {formErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={handleSubmitForm}>
              <div className="form-group">
                <label>ФИО репетитора *</label>
                <input
                  type="text"
                  required
                  placeholder="Иванов Иван Иванович"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Предмет *</label>
                <input
                  type="text"
                  required
                  placeholder="Математика, Физика, Английский..."
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Цена за час (₽) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="1500"
                    value={formData.price_per_hour}
                    onChange={(e) => setFormData({ ...formData, price_per_hour: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Опыт (лет) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="5"
                    value={formData.experience_years}
                    onChange={(e) => setFormData({ ...formData, experience_years: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>О себе / Образование</label>
                <textarea
                  rows="3"
                  placeholder="Расскажите о методике, образовании и достижениях учеников..."
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Фотография / Аватар (multipart/form-data)</label>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  onChange={handleFileChange}
                />
                {filePreview && (
                  <div>
                    <img src={filePreview} alt="Предпросмотр" className="preview-avatar" />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Отмена
                </button>
                <button type="submit" className="btn btn-primary">
                  {modalMode === 'create' ? 'Сохранить' : 'Обновить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}