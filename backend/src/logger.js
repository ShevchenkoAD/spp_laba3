const pino = require('pino');
const path = require('path');
const fs = require('fs');

const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFilePath = path.join(logDir, 'app.log');

const streams = [
  { stream: process.stdout }, 
  { stream: pino.destination({ dest: logFilePath, sync: true }) }, 
];

const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    enabled: process.env.NODE_ENV !== 'test',
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      service: 'tutor-service',
      env: process.env.NODE_ENV || 'development',
    },
  },
  pino.multistream(streams)
);

module.exports = logger;