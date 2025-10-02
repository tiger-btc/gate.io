const { readJsonFromFileSync } = require('./modules/json');
const ConfigApi = require('./api/configApi');

class TradingSystem {
  constructor() {
    this.config = null;
    this.configApi = null;
  }

  // 加载配置
  async loadConfig() {
    try {
      const configPath = path.join('./config/default.json');
      const configData = readJsonFromFileSync(configPath);
      this.config = JSON.parse(configData);
      console.log(`配置文件 ${configPath} 加载成功`, this.config);
    } catch (error) {
      console.log(error.stack);
      throw error;
    }
  }

  // 初始化所有模块
  async initializeModules() {
    try {
      // 初始化配置API
      this.configApi = new ConfigApi();
    } catch (error) {
      console.log(error.stack);
    }
  }

  // 启动所有服务
  async start() {
    try {
      console.log('正在启动交易系统...');
      // 启动配置API服务
      await this.configApi.start(this.config.api.port, this.config.api.host);
    } catch (error) {
      console.log(error.stack);
    }
  }

  // 优雅关闭
  async shutdown() {
    console.log('正在关闭交易系统...');
    try {
      // 停止心跳监控
      if (this.configApi) {
        this.configApi.stopHeartbeatMonitor();
      }

      console.log('交易系统已安全关闭');
    } catch (error) {
      console.log(error.stack);
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
    console.log(error.stack);
    process.exit(1);
  }
}

// 处理进程信号
process.on('SIGINT', async () => {
  console.log('收到SIGINT信号，正在关闭系统...');
  await tradingSystem.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('收到SIGTERM信号，正在关闭系统...');
  await tradingSystem.shutdown();
  process.exit(0);
});

process.on('uncaughtException', async (error) => {
  console.log(error.stack);
  await tradingSystem.shutdown();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.log(error.stack);
  await tradingSystem.shutdown();
  process.exit(1);
});

// 启动系统
main();