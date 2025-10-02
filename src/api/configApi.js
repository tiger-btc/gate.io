const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../modules/logger');

class ConfigApi {
  constructor(httpClient, tradeExecutor, notificationService, socketClient) {
    this.app = express();
    this.httpClient = httpClient;
    this.tradeExecutor = tradeExecutor;
    this.notificationService = notificationService;
    this.socketClient = socketClient;
    this.runtimeConfigPath = path.join(__dirname, '../config/runtime.json');
    this.lastHeartbeat = null;
    this.heartbeatTimer = null;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.startHeartbeatMonitor();
  }

  // 设置中间件
  setupMiddleware() {
    this.app.use(express.json());
    
    // 请求日志
    this.app.use((req, res, next) => {
      logger.info('API请求', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });

    // 错误处理
    this.app.use((error, req, res, next) => {
      logger.error('API错误', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
      });
      
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
        logger.error('处理API请求失败', {
          error: error.message,
          body: req.body
        });
        
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

    // 更新HTTP客户端配置
    this.httpClient.updateConfig(data.baseURL, data.headers);

    logger.info('Header配置已更新', {
      baseURL: data.baseURL,
      headersCount: Object.keys(data.headers).length,
      heartbeat: this.lastHeartbeat
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

    logger.info('交易配置已更新', runtimeConfig.trading);

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
      const data = await fs.readFile(this.runtimeConfigPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.warn('加载运行时配置失败，使用默认配置', { error: error.message });
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
      await fs.writeFile(this.runtimeConfigPath, JSON.stringify(config, null, 2));
    } catch (error) {
      logger.error('保存运行时配置失败', { error: error.message });
      throw error;
    }
  }

  // 获取心跳状态
  getHeartbeatStatus() {
    if (!this.lastHeartbeat) {
      return 'no_heartbeat';
    }

    const now = new Date();
    const lastTime = new Date(this.lastHeartbeat);
    const diffMs = now - lastTime;
    const diffMinutes = diffMs / (1000 * 60);

    if (diffMinutes > 1) {
      return 'offline';
    } else if (diffMinutes > 0.5) {
      return 'warning';
    } else {
      return 'online';
    }
  }

  // 启动心跳监控
  startHeartbeatMonitor() {
    // 每30秒检查一次心跳状态
    this.heartbeatTimer = setInterval(async () => {
      const status = this.getHeartbeatStatus();
      
      if (status === 'offline') {
        logger.warn('检测到系统掉线', {
          lastHeartbeat: this.lastHeartbeat,
          status
        });
        
        // 发送掉线通知
        try {
          await this.notificationService.sendOfflineNotification();
        } catch (error) {
          logger.error('发送掉线通知失败', { error: error.message });
        }
      }
    }, 30000);

    logger.info('心跳监控已启动');
  }

  // 停止心跳监控
  stopHeartbeatMonitor() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      logger.info('心跳监控已停止');
    }
  }

  // 启动API服务器
  start(port, host = 'localhost') {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(port, host, () => {
        logger.info('配置API服务已启动', {
          host,
          port,
          url: `http://${host}:${port}`
        });
        resolve(server);
      });

      server.on('error', (error) => {
        logger.error('API服务启动失败', { error: error.message });
        reject(error);
      });
    });
  }
}

module.exports = ConfigApi;