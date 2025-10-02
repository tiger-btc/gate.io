const express = require('express');
const { saveJsonToFileSync, readJsonFromFileSync } = require('../modules/json');
const { getTokenExpiryInfoFromCookie } = require('../modules/bear');
class ConfigApi {
  constructor() {
    this.app = express();
    this.runtimeConfigPath = './config/runtime.json';
    this.lastHeartbeat = null;
    this.heartbeatTimer = null;
    this.bark = null;
    this.setupMiddleware();
    this.setupRoutes();
    this.count = 0;
  }

  set_bark(bark) {
    this.bark = bark;
  }


  async send_to_phone(msg) {
    if (this.bark) {
      return await this.bark.sendNotification(msg, 'GATE.IO');
    }
  }


  // 设置中间件
  setupMiddleware() {
    this.app.use(express.json());

    // 请求日志
    this.app.use((req, res, next) => {
      console.log('API请求', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });

    // 错误处理
    this.app.use((error, req, res, next) => {
      console.log(error.stack);

      res.status(500).json({
        success: false,
        error: 'Internal Server Error'
      });
    });
  }

  // 设置路由
  setupRoutes() {
    // 主要配置接口
    this.app.post('/api', async (req, res) => {
      try {
        const { action, data } = req.body;

        if (!action) {
          return res.status(400).json({
            success: false,
            error: 'Missing action parameter'
          });
        }

        const result = await this.handleAction(action, data);
        res.json(result);
      } catch (error) {
        console.log(error.stack);

        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 健康检查接口
    this.app.get('/health', (req, res) => {
      const status = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        lastHeartbeat: this.lastHeartbeat,
        socket: this.socketClient.getConnectionStatus(),
        httpConfigured: this.httpClient.isConfigured()
      };

      res.json(status);
    });

    // 获取系统状态
    this.app.get('/status', async (req, res) => {
      try {
        const runtimeConfig = await this.loadRuntimeConfig();
        const status = {
          timestamp: new Date().toISOString(),
          lastHeartbeat: this.lastHeartbeat,
          heartbeatStatus: this.getHeartbeatStatus(),
          socket: this.socketClient.getConnectionStatus(),
          httpConfigured: this.httpClient.isConfigured(),
          config: {
            hasApiConfig: !!runtimeConfig.api.baseURL,
            hasTradingConfig: !!runtimeConfig.trading.contract,
            trading: runtimeConfig.trading
          }
        };

        res.json(status);
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }

  // 处理不同的action
  async handleAction(action, data) {
    switch (action) {
      case 'header':
        return await this.handleHeaderUpdate(data);
      case 'config':
        return await this.handleConfigUpdate(data);
      case 'status':
        return await this.handleStatusQuery();
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  // 处理header更新
  async handleHeaderUpdate(data) {
    if (!data || !data.headers || !data.baseURL) {
      throw new Error('Missing headers or baseURL in data');
    }



    // 更新心跳时间
    this.lastHeartbeat = new Date().toISOString();

    // 更新运行时配置
    const runtimeConfig = await this.loadRuntimeConfig();
    runtimeConfig.api = {
      baseURL: data.baseURL,
      headers: data.headers
    };


    runtimeConfig.lastHeartbeat = this.lastHeartbeat;

    await this.saveRuntimeConfig(runtimeConfig);

    const expire_msg = getTokenExpiryInfoFromCookie(data.headers.cookie);
    const { remainingDays } = expire_msg;

    if (remainingDays < 2 || this.count < 1) {
      await this.send_to_phone(`授权将在${remainingDays.toFixed(1)}天后到期`);
    }
    this.count += 1;

    console.log('Header配置已更新', {
      baseURL: data.baseURL,
      headersCount: Object.keys(data.headers).length,
      heartbeat: this.lastHeartbeat,
      remainingDays
    });

    return {
      success: true,
      message: 'Header updated successfully',
      timestamp: this.lastHeartbeat
    };
  }

  // 处理配置更新
  async handleConfigUpdate(data) {
    if (!data) {
      throw new Error('Missing data for config update');
    }

    const runtimeConfig = await this.loadRuntimeConfig();

    // 更新交易配置
    if (data.contract) {
      runtimeConfig.trading.contract = data.contract;
    }
    if (data.amount !== undefined) {
      runtimeConfig.trading.amount = data.amount;
    }

    await this.saveRuntimeConfig(runtimeConfig);

    // 更新交易执行器配置
    this.tradeExecutor.updateConfig(runtimeConfig.trading);

    console.log('交易配置已更新', runtimeConfig.trading);

    return {
      success: true,
      message: 'Config updated successfully',
      config: runtimeConfig.trading
    };
  }

  // 处理状态查询
  async handleStatusQuery() {
    const runtimeConfig = await this.loadRuntimeConfig();

    return {
      success: true,
      status: {
        timestamp: new Date().toISOString(),
        lastHeartbeat: this.lastHeartbeat,
        heartbeatStatus: this.getHeartbeatStatus(),
        socket: this.socketClient.getConnectionStatus(),
        httpConfigured: this.httpClient.isConfigured(),
        config: runtimeConfig
      }
    };
  }

  // 加载运行时配置
  async loadRuntimeConfig() {
    try {
      const data = readJsonFromFileSync(this.runtimeConfigPath);
      return data;
    } catch (error) {
      console.log(error.stack);
      return {
        api: { baseURL: '', headers: {} },
        trading: { contract: '', amount: 1 },
        lastHeartbeat: null
      };
    }
  }

  // 保存运行时配置
  async saveRuntimeConfig(config) {
    try {
      saveJsonToFileSync(this.runtimeConfigPath, config);
    } catch (error) {
      console.log(error.stack);
    }
  }




  // 启动API服务器
  start(port, host = 'localhost') {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(port, host, () => {
        console.log('配置API服务已启动', {
          host,
          port,
          url: `http://${host}:${port}`
        });
        resolve(server);
      });

      server.on('error', (error) => {
        console.log(error.stack);
        reject(error);
      });
    });
  }
}

module.exports = ConfigApi;