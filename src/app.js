const fs = require('fs').promises;
const path = require('path');
const logger = require('./modules/logger');
const HttpClient = require('./modules/httpClient');
const NotificationService = require('./modules/notificationService');
const TradeExecutor = require('./modules/tradeExecutor');
const SocketClient = require('./modules/socketClient');
const ConfigApi = require('./api/configApi');

class TradingSystem {
  constructor() {
    this.config = null;
    this.httpClient = null;
    this.notificationService = null;
    this.tradeExecutor = null;
    this.socketClient = null;
    this.configApi = null;
    this.accountTimer = null;
  }

  // 加载配置
  async loadConfig() {
    try {
      const configPath = path.join(__dirname, 'config/default.json');
      const configData = await fs.readFile(configPath, 'utf8');
      this.config = JSON.parse(configData);
      logger.info(`配置文件 ${configPath} 加载成功`, this.config);
    } catch (error) {
      logger.error('加载配置文件失败', { error: error.message });
      throw error;
    }
  }

  // 初始化所有模块
  async initializeModules() {
    try {
      // 初始化HTTP客户端
      this.httpClient = new HttpClient();
      logger.info('HTTP客户端初始化完成');

      // 初始化通知服务
      this.notificationService = new NotificationService(this.config.notification);
      logger.info('通知服务初始化完成');

      // 初始化交易执行器
      this.tradeExecutor = new TradeExecutor(this.httpClient, this.notificationService);
      logger.info('交易执行器初始化完成');

      // 初始化Socket客户端
      this.socketClient = new SocketClient(
        this.config.socket,
        this.tradeExecutor,
        this.notificationService
      );
      logger.info('Socket客户端初始化完成');

      // 初始化配置API
      this.configApi = new ConfigApi(
        this.httpClient,
        this.tradeExecutor,
        this.notificationService,
        this.socketClient
      );
      logger.info('配置API初始化完成');

    } catch (error) {
      logger.error('模块初始化失败', { error: error.message });
      throw error;
    }
  }

  // 启动所有服务
  async start() {
    try {
      logger.info('正在启动交易系统...');

      // 启动配置API服务
      await this.configApi.start(this.config.api.port, this.config.api.host);

      // 连接Socket.IO服务器
      this.socketClient.connect();

      // 启动账户查询定时器
      this.startAccountMonitor();

      logger.info('交易系统启动完成', {
        apiPort: this.config.api.port,
        socketUrl: this.config.socket.url
      });

      // 发送启动通知
      await this.notificationService.sendNotification(
        '交易系统已启动',
        `API端口: ${this.config.api.port}`
      );

    } catch (error) {
      logger.error('启动交易系统失败', { error: error.message });
      await this.notificationService.sendErrorNotification(
        '系统启动失败',
        error.message
      );
      throw error;
    }
  }

  // 启动账户监控
  startAccountMonitor() {
    const interval = this.config.system.accountQueryInterval;

    this.accountTimer = setInterval(async () => {
      try {
        await this.tradeExecutor.getAccount();
      } catch (error) {
        if (this.notificationService) {
          await this.notificationService.sendNotification(
            '获取账户信息失败',
            `时间: ${new Date().toLocaleString()}`
          );
        }
        logger.error('账户查询失败', { error: error.message });
      }
    }, interval);

    logger.info('账户监控已启动', { interval: `${interval}ms` });
  }

  // 停止账户监控
  stopAccountMonitor() {
    if (this.accountTimer) {
      clearInterval(this.accountTimer);
      this.accountTimer = null;
      logger.info('账户监控已停止');
    }
  }

  // 优雅关闭
  async shutdown() {
    logger.info('正在关闭交易系统...');

    try {
      // 停止账户监控
      this.stopAccountMonitor();

      // 停止心跳监控
      if (this.configApi) {
        this.configApi.stopHeartbeatMonitor();
      }

      // 断开Socket连接
      if (this.socketClient) {
        this.socketClient.disconnect();
      }

      // 发送关闭通知
      if (this.notificationService) {
        await this.notificationService.sendNotification(
          '交易系统已关闭',
          `关闭时间: ${new Date().toLocaleString()}`
        );
      }

      logger.info('交易系统已安全关闭');
    } catch (error) {
      logger.error('关闭交易系统时发生错误', { error: error.message });
    }
  }
}

// 创建交易系统实例
const tradingSystem = new TradingSystem();

// 启动系统
async function main() {
  try {
    await tradingSystem.loadConfig();
    await tradingSystem.initializeModules();
    await tradingSystem.start();
  } catch (error) {
    logger.error('系统启动失败', { error: error.message });
    process.exit(1);
  }
}

// 处理进程信号
process.on('SIGINT', async () => {
  logger.info('收到SIGINT信号，正在关闭系统...');
  await tradingSystem.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('收到SIGTERM信号，正在关闭系统...');
  await tradingSystem.shutdown();
  process.exit(0);
});

process.on('uncaughtException', async (error) => {
  logger.error('未捕获的异常', { error: error.message, stack: error.stack });
  await tradingSystem.shutdown();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  logger.error('未处理的Promise拒绝', { reason, promise });
  await tradingSystem.shutdown();
  process.exit(1);
});

// 启动系统
main();