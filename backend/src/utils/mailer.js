const nodemailer = require('nodemailer');
const logger = require('../logger');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mailpit',
  port: parseInt(process.env.SMTP_PORT, 10) || 1025,
  secure: false,
});

async function sendPasswordResetEmail(toEmail, resetToken) {
  const resetLink = `http://localhost:3000?resetToken=${resetToken}&email=${encodeURIComponent(toEmail)}`;

  const mailOptions = {
    from: '"Платформа Репетиторов" <noreply@tutor-platform.ru>',
    to: toEmail,
    subject: 'Восстановление доступа к учетной записи',
    text: `Здравствуйте! Вы запросили сброс пароля. Ваш токен сброса: ${resetToken}\nИли перейдите по ссылке: ${resetLink}\nСрок действия ссылки: 1 час. Если вы не отправляли запрос, проигнорируйте это письмо.`,
    html: `
      <div style="font-family: sans-serif; line-height: 1.5; color: #1e293b; max-width: 600px;">
        <h2>Восстановление доступа</h2>
        <p>Вы получили это письмо, потому что запросили сброс пароля на Платформе Репетиторов.</p>
        <p>Ваш одноразовый код сброса:</p>
        <div style="background: #f1f5f9; padding: 12px; font-size: 18px; font-weight: bold; letter-spacing: 2px;">
          ${resetToken}
        </div>
        <p style="margin-top: 20px;">Или нажмите кнопку ниже для автоматического перехода:</p>
        <a href="${resetLink}" style="display: inline-block; background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Сбросить пароль</a>
        <p style="color: #64748b; font-size: 13px; margin-top: 20px;">Срок действия токена составляет 1 час. Если вы не делали этот запрос, проигнорируйте письмо.</p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info({ event: 'MAIL_SENT', to: toEmail, messageId: info.messageId }, 'Письмо для сброса пароля отправлено');
    return true;
  } catch (error) {
    logger.error({ event: 'MAIL_SEND_ERROR', err: error.message }, 'Ошибка отправки письма через SMTP');
    throw error;
  }
}

module.exports = { sendPasswordResetEmail };