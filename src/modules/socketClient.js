const { io } = require('socket.io-client');
const logger = require('./logger');

class SocketClient {
  constructor(config, tradeExecutor, notificationService) {
    this.config = config;
    this.tradeExecutor = tradeExecutor;
    this.notificationService = notificationService;
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
  }

  // 连接Socket.IO服务器
  connect() {
    logger.info('正在连接Socket.IO服务器', { url: this.config.url });

    this.socket = io(this.config.url, {
      reconnection: true,
      reconnectionDelay: this.config.reconnectDelay,
      reconnectionAttempts: this.config.maxReconnectAttempts,
      timeout: 10000
    });

    this.setupEventHandlers();
  }

  // 设置事件处理器
  setupEventHandlers() {
    // 连接成功
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      logger.info('Socket.IO连接成功', {
        socketId: this.socket.id,
        url: this.config.url
      });
    });

    // 连接断开
    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      logger.warn('Socket.IO连接断开', {
        reason,
        socketId: this.socket.id
      });
    });

    // 连接错误
    this.socket.on('connect_error', (error) => {
      this.reconnectAttempts++;
      logger.error('Socket.IO连接错误', {
        error: error.message,
        attempts: this.reconnectAttempts,
        maxAttempts: this.config.maxReconnectAttempts
      });

      // 如果重连次数超过限制，发送通知
      if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
        this.notificationService.sendErrorNotification(
          'Socket连接失败',
          `重连${this.reconnectAttempts}次后仍无法连接`
        );
      }
    });

    // 重连尝试
    this.socket.on('reconnect_attempt', (attemptNumber) => {
      logger.info('Socket.IO重连尝试', {
        attempt: attemptNumber,
        maxAttempts: this.config.maxReconnectAttempts
      });
    });

    // 重连成功
    this.socket.on('reconnect', (attemptNumber) => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      logger.info('Socket.IO重连成功', {
        attempts: attemptNumber,
        socketId: this.socket.id
      });
    });

    // 监听交易信号
    const trade_map = ['open', 'add', 'reduce', 'close'];
    for (let action of trade_map) {
      this.socket.on(`trade:${action}`, async (data) => {
        await this.handleTradeSignal(data.trade);
      });
    }


    // 监听其他事件
    this.socket.onAny((eventName, ...args) => {
      // 其他事件暂不关心
    });
  }

  // 处理交易信号
  async handleTradeSignal(data) {
    try {
      logger.info('收到交易信号', data);

      const { quantity: amount, type, side, timestamp, reason } = data;
      // 检查信号时效性（可选）
      if (timestamp) {
        const now = Date.now();
        const signalTime = new Date(timestamp).getTime();
        const delay = now - signalTime;

        if (delay > 30000) { // 30秒
          logger.warn('交易信号过期', {
            delay: `${delay}ms`,
            side
          });
          return;
        }
      }

      // 执行交易操作
      let result = {};
      if (type === 'OPEN') {
        result = await this.tradeExecutor.open(side, amount, reason);
      }
      if (type === 'ADD') {
        result = await this.tradeExecutor.add(side, amount, reason);
      }
      if (type === 'REDUCE') {
        result = await this.tradeExecutor.reduce(side, amount, reason);
      }

      if (type === 'CLOSE') {
        result = await this.tradeExecutor.close();
      }

      logger.info('交易信号处理完成', {
        side,
        success: result.success,
        error: result.error
      });

    } catch (error) {
      logger.error('处理交易信号时发生错误', {
        data,
        error: error.message,
        es: error.stack
      });

      await this.notificationService.sendErrorNotification(
        '交易信号处理失败',
        error.message
      );
    }
  }

  // 断开连接
  disconnect() {
    if (this.socket) {
      logger.info('正在断开Socket.IO连接');
      this.socket.disconnect();
      this.isConnected = false;
    }
  }

  // 获取连接状态
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      socketId: this.socket?.id || null,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  // 更新配置并重连
  updateConfig(config) {
    this.config = { ...this.config, ...config };

    if (this.socket) {
      this.disconnect();
      setTimeout(() => {
        this.connect();
      }, 1000);
    }

    logger.info('Socket客户端配置已更新', this.config);
  }
}

module.exports = SocketClient;