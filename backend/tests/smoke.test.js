describe('CI Smoke Test (Базовая проверка окружения)', () => {
  it('проверка работы математики и тестового раннера Jest', () => {
    expect(1 + 1).toBe(2);
  });

  it('переменные среды Node доступны', () => {
    expect(process.env.NODE_ENV).toBeDefined();
  });
});