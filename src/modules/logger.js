const winston = require('winston');
const path = require('path');

// 创建日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// 创建控制台格式
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    return log;
  })
);

// 创建logger实例
const logger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: consoleFormat
    }),
    // 所有日志文件
    new winston.transports.File({
      filename: path.join('logs', 'app.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),
    // 错误日志文件
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5
    }),
    // 交易日志文件
    new winston.transports.File({
      filename: path.join('logs', 'trade.log'),
      level: 'info',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10
    })
  ]
});

// 交易专用日志方法
logger.trade = (action, data) => {
  logger.info('TRADE', {
    action,
    timestamp: new Date().toISOString(),
    ...data
  });
};

// 账户专用日志方法
logger.account = (data) => {
  logger.info('ACCOUNT', {
    timestamp: new Date().toISOString(),
    ...data
  });
};

// 通知专用日志方法
logger.notification = (type, message) => {
  logger.info('NOTIFICATION', {
    type,
    message,
    timestamp: new Date().toISOString()
  });
};

module.exports = logger;