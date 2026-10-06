import React, { useState, useEffect } from 'react';

const API_BASE = '/api/tutors';
const AUTH_BASE = '/api/auth';

export default function App() {
  const [tutors, setTutors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [currentUser, setCurrentUser] = useState(null);
  const [accessToken, setAccessToken] = useState(localStorage.getItem('accessToken') || null);

  const [globalError, setGlobalError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedTutorId, setSelectedTutorId] = useState(null);
  const [formData, setFormData] = useState({ full_name: '', subject: '', price_per_hour: '', experience_years: '', bio: '' });
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [formErrors, setFormErrors] = useState([]);

  
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState(null);

  
  const [isSessionsModalOpen, setIsSessionsModalOpen] = useState(false);
  const [sessions, setSessions] = useState([]);

  
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('resetToken');
    const emailFromUrl = params.get('email');
    if (tokenFromUrl && emailFromUrl) {
      setForgotEmail(emailFromUrl);
      setResetToken(tokenFromUrl);
      setIsResetModalOpen(true);
    }
  }, []);

  useEffect(() => {
    if (accessToken) {
      fetch(`${AUTH_BASE}/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error('Сессия недействительна');
          return res.json();
        })
        .then((data) => setCurrentUser(data))
        .catch(() => handleLogout());
    }
  }, [accessToken]);

  const fetchTutors = async (searchQuery = '') => {
    try {
      setLoading(true);
      setGlobalError(null);
      const url = searchQuery ? `${API_BASE}?search=${encodeURIComponent(searchQuery)}` : API_BASE;
      const res = await fetch(url);
      const data = await res.json();
      setTutors(data);
    } catch (err) {
      setGlobalError(err.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTutors();
  }, []);

  const handleLogout = async () => {
    const storedToken = localStorage.getItem('accessToken');
    const storedSessionId = localStorage.getItem('sessionId');

    if (storedToken) {
      try {
        await fetch(`${AUTH_BASE}/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${storedToken}`,
          },
          body: JSON.stringify({ sessionId: storedSessionId }),
        });
      } catch (err) {
      }
    }

    localStorage.removeItem('accessToken');
    localStorage.removeItem('sessionId');
    setAccessToken(null);
    setCurrentUser(null);
    showSuccess('Выход из системы выполнен.');
  };


  const handleQuickLogin = async (email, password) => {
    try {
      setGlobalError(null);
      setAuthError(null);

      const currentToken = localStorage.getItem('accessToken');
      const currentSessionId = localStorage.getItem('sessionId');
      if (currentToken) {
        try {
          await fetch(`${AUTH_BASE}/logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${currentToken}`,
            },
            body: JSON.stringify({ sessionId: currentSessionId }),
          });
        } catch (e) {
        }
      }

      const res = await fetch(`${AUTH_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error);

      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('sessionId', data.sessionId);
      setAccessToken(data.accessToken);
      setCurrentUser(data.user);
      setIsAuthModalOpen(false);
      showSuccess(`Вход выполнен успешно. Роль: ${data.user.role.toUpperCase()} (${data.user.email})`);
    } catch (err) {
      setAuthError(err.message);
    }
  };

  
  const handleOpenSessions = async () => {
    try {
      const res = await fetch(`${AUTH_BASE}/sessions`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Не удалось загрузить сессии');
      const data = await res.json();
      setSessions(data);
      setIsSessionsModalOpen(true);
    } catch (err) {
      setGlobalError(err.message);
    }
  };

  
  const handleTerminateSession = async (sessionId) => {
    try {
      const res = await fetch(`${AUTH_BASE}/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Ошибка завершения сессии');
      setSessions(sessions.filter((s) => s.id !== sessionId));
      showSuccess('Подключение успешно завершено.');
    } catch (err) {
      setGlobalError(err.message);
    }
  };

  
  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${AUTH_BASE}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error);

      setIsForgotModalOpen(false);
      showSuccess('Письмо сформировано. Откройте веб-почту Mailpit по адресу http://localhost:8025 для просмотра.');
      setIsResetModalOpen(true);
    } catch (err) {
      setGlobalError(err.message);
    }
  };

  
  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${AUTH_BASE}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, token: resetToken, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error);

      setIsResetModalOpen(false);
      showSuccess('Пароль успешно обновлен. Теперь войдите в систему.');
      setIsAuthModalOpen(true);
    } catch (err) {
      setGlobalError(err.message);
    }
  };

  const handleOpenCreate = () => {
    if (!currentUser) return setGlobalError('Для создания анкеты необходимо войти в систему.');
    if (currentUser.role === 'student') return setGlobalError('Код 403: У роли STUDENT нет прав на создание анкет.');
    setModalMode('create');
    setSelectedTutorId(null);
    setFormData({ full_name: currentUser.full_name || '', subject: '', price_per_hour: '', experience_years: '', bio: '' });
    setSelectedFile(null);
    setFilePreview(null);
    setFormErrors([]);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (tutor) => {
    setModalMode('edit');
    setSelectedTutorId(tutor.id);
    setFormData({
      full_name: tutor.full_name,
      subject: tutor.subject,
      price_per_hour: tutor.price_per_hour,
      experience_years: tutor.experience_years,
      bio: tutor.bio || '',
    });
    setSelectedFile(null);
    setFilePreview(tutor.avatar_url || null);
    setFormErrors([]);
    setIsModalOpen(true);
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setFormErrors([]);

    const bodyFormData = new FormData();
    bodyFormData.append('full_name', formData.full_name);
    bodyFormData.append('subject', formData.subject);
    bodyFormData.append('price_per_hour', formData.price_per_hour);
    bodyFormData.append('experience_years', formData.experience_years);
    bodyFormData.append('bio', formData.bio);
    if (selectedFile) bodyFormData.append('avatar', selectedFile);

    try {
      const isEdit = modalMode === 'edit';
      const url = isEdit ? `${API_BASE}/${selectedTutorId}` : API_BASE;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${accessToken}` },
        body: bodyFormData,
      });

      const responseData = await res.json();
      if (!res.ok) {
        if (responseData.invalidParams) {
          setFormErrors(responseData.invalidParams.map((p) => `${p.field}: ${p.reason}`));
        } else {
          setFormErrors([responseData.detail || responseData.error || 'Ошибка при сохранении']);
        }
        return;
      }

      if (isEdit) {
        setTutors(tutors.map((t) => (t.id === selectedTutorId ? responseData : t)));
        showSuccess('Код 200 OK: Анкета репетитора успешно обновлена.');
      } else {
        setTutors([responseData, ...tutors]);
        showSuccess('Код 201 Created: Анкета репетитора успешно создана.');
      }
      setIsModalOpen(false);
    } catch (err) {
      setFormErrors([err.message]);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Подтвердите удаление репетитора "${name}"`)) return;

    try {
      const res = await fetch(`${API_BASE}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || errorData.error || 'Ошибка удаления');
      }

      setTutors(tutors.filter((t) => t.id !== id));
      showSuccess('Код 204 No Content: Анкета репетитора удалена.');
    } catch (err) {
      setGlobalError(err.message);
    }
  };

  const showSuccess = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const canModifyCard = (tutor) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    if (currentUser.role === 'tutor' && tutor.user_id === currentUser.id) return true;
    return false;
  };

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1>Платформа поиска репетиторов</h1>
          <p style={{ color: '#64748b' }}>Лабораторная работа 3</p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {currentUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '14px', background: '#e2e8f0', padding: '6px 12px', borderRadius: '8px' }}>
                Пользователь: {currentUser.email} | Роль: {currentUser.role.toUpperCase()}
              </span>
              <button className="btn btn-secondary" onClick={handleOpenSessions}>Активные сессии</button>
              <button className="btn btn-secondary" onClick={handleLogout}>Выйти</button>
            </div>
          ) : (
            <button className="btn btn-secondary" onClick={() => setIsAuthModalOpen(true)}>Войти в систему</button>
          )}

          {currentUser && currentUser.role !== 'student' && (
            <button className="btn btn-primary" onClick={handleOpenCreate}>+ Добавить репетитора</button>
          )}
        </div>
      </header>

      <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <strong>Быстрый вход для проверки ролей:</strong>
        <button className="btn btn-secondary" style={{ fontSize: '13px', padding: '4px 10px' }} onClick={() => handleQuickLogin('admin@tutor.ru', 'admin123')}>
          Войти как ADMIN
        </button>
        <button className="btn btn-secondary" style={{ fontSize: '13px', padding: '4px 10px' }} onClick={() => handleQuickLogin('tutor@tutor.ru', 'tutor123')}>
          Войти как TUTOR 1
        </button>
        <button className="btn btn-secondary" style={{ fontSize: '13px', padding: '4px 10px' }} onClick={() => handleQuickLogin('tutor2@tutor.ru', 'tutor123')}>
          Войти как TUTOR 2
        </button>
        <button className="btn btn-secondary" style={{ fontSize: '13px', padding: '4px 10px' }} onClick={() => handleQuickLogin('student@tutor.ru', 'student123')}>
          Войти как STUDENT
        </button>
      </div>

      {successMessage && <div className="alert alert-success">{successMessage}</div>}
      {globalError && <div className="alert alert-error">{globalError}</div>}

      <form className="search-bar" onSubmit={(e) => { e.preventDefault(); fetchTutors(search); }}>
        <input
          type="text"
          className="search-input"
          placeholder="Поиск по ФИО или учебному предмету..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn btn-secondary">Найти</button>
      </form>

      {loading && <p style={{ textAlign: 'center' }}>Загрузка данных...</p>}

      <div className="cards-grid">
        {tutors.map((tutor) => (
          <div key={tutor.id} className="tutor-card">
            <div className="card-header">
              {tutor.avatar_url ? (
                <img src={tutor.avatar_url} alt={tutor.full_name} className="avatar" />
              ) : (
                <div className="avatar avatar-placeholder">{tutor.full_name.charAt(0)}</div>
              )}
              <div>
                <h3>{tutor.full_name}</h3>
                <span className="badge">{tutor.subject}</span>
              </div>
            </div>

            <div className="info-item"><strong>Ставка:</strong> {tutor.price_per_hour} рублей в час</div>
            <div className="info-item"><strong>Опыт:</strong> {tutor.experience_years} лет</div>
            <div className="bio">{tutor.bio}</div>

            {canModifyCard(tutor) && (
              <div className="card-actions">
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => handleOpenEdit(tutor)}>
                  Редактировать
                </button>
                <button className="btn btn-danger" onClick={() => handleDelete(tutor.id, tutor.full_name)}>
                  Удалить
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Модальное окно создания/редактирования анкеты */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{modalMode === 'create' ? 'Новая анкета репетитора' : 'Редактирование анкеты'}</h2>
            {formErrors.length > 0 && (
              <div className="alert alert-error">
                <ul>{formErrors.map((err, i) => <li key={i}>{err}</li>)}</ul>
              </div>
            )}
            <form onSubmit={handleSubmitForm}>
              <div className="form-group">
                <label>ФИО *</label>
                <input type="text" required value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Предмет *</label>
                <input type="text" required value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Цена за час (руб.) *</label>
                  <input type="number" required value={formData.price_per_hour} onChange={(e) => setFormData({ ...formData, price_per_hour: e.target.value })} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Опыт (лет) *</label>
                  <input type="number" required value={formData.experience_years} onChange={(e) => setFormData({ ...formData, experience_years: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>О себе</label>
                <textarea rows="3" value={formData.bio} onChange={(e) => setFormData({ ...formData, bio: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Фотография (multipart/form-data)</label>
                <input type="file" accept="image/*" onChange={(e) => {
                  if (e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                    setFilePreview(URL.createObjectURL(e.target.files[0]));
                  }
                }} />
                {filePreview && <img src={filePreview} alt="Превью" className="preview-avatar" />}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Отмена</button>
                <button type="submit" className="btn btn-primary">Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модальное окно входа */}
      {isAuthModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAuthModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Вход в систему</h2>
            {authError && <div className="alert alert-error">{authError}</div>}
            <form onSubmit={(e) => { e.preventDefault(); handleQuickLogin(authEmail, authPassword); }}>
              <div className="form-group">
                <label>Email</label>
                <input type="email" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Пароль</label>
                <input type="password" required value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} />
              </div>
              <div style={{ marginBottom: '12px', textAlign: 'right' }}>
                <button type="button" style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '13px' }} onClick={() => { setIsAuthModalOpen(false); setIsForgotModalOpen(true); }}>
                  Забыли пароль?
                </button>
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Войти</button>
            </form>
          </div>
        </div>
      )}

      {/* Модальное окно управления активными сессиями */}
      {isSessionsModalOpen && (
        <div className="modal-overlay" onClick={() => setIsSessionsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Активные подключения</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Список устройств и браузеров, с которых выполнен вход в вашу учетную запись:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {sessions.map((s) => (
                <div key={s.id} style={{ border: '1px solid #e2e8f0', padding: '12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{s.user_agent}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>IP: {s.ip_address} | Активность: {new Date(s.last_active_at).toLocaleString()}</div>
                  </div>
                  <button className="btn btn-danger" style={{ fontSize: '12px', padding: '6px 12px' }} onClick={() => handleTerminateSession(s.id)}>
                    Завершить
                  </button>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'right', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => setIsSessionsModalOpen(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно запроса сброса пароля */}
      {isForgotModalOpen && (
        <div className="modal-overlay" onClick={() => setIsForgotModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Восстановление доступа</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Введите ваш email для получения ссылки сброса пароля:</p>
            <form onSubmit={handleForgotPasswordSubmit}>
              <div className="form-group">
                <label>Email учетной записи</label>
                <input type="email" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsForgotModalOpen(false)}>Отмена</button>
                <button type="submit" className="btn btn-primary">Отправить письмо</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модальное окно установки нового пароля */}
      {isResetModalOpen && (
        <div className="modal-overlay" onClick={() => setIsResetModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Установка нового пароля</h2>
            <form onSubmit={handleResetPasswordSubmit}>
              <div className="form-group">
                <label>Email</label>
                <input type="email" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Токен сброса (из письма)</label>
                <input type="text" required value={resetToken} onChange={(e) => setResetToken(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Новый пароль (минимум 6 символов)</label>
                <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsResetModalOpen(false)}>Отмена</button>
                <button type="submit" className="btn btn-primary">Сменить пароль</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}