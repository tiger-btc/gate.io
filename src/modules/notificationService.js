const axios = require('axios');
const logger = require('./logger');

class NotificationService {
  constructor(config) {
    this.barkUrl = config.barkUrl;
    this.enabled = config.enabled;
    this.title = config.title;
    this.lastNotificationTime = {};
  }

  // 更新配置
  updateConfig(config) {
    this.barkUrl = config.barkUrl;
    this.enabled = config.enabled;
    this.title = config.title;
    logger.info('通知服务配置已更新', config);
  }

  // 发送Bark通知
  async sendNotification(message, subtitle = '') {
    if (!this.enabled) {
      logger.debug('通知服务已禁用，跳过发送');
      return;
    }

    if (!this.barkUrl || this.barkUrl.includes('YOUR_KEY')) {
      logger.warn('Bark URL未配置，跳过发送通知');
      return;
    }

    try {
      // 构建Bark API URL
      const url = `${this.barkUrl}/${encodeURIComponent(this.title)}/${encodeURIComponent(message)}`;
      
      // 添加副标题参数
      const params = {};
      if (subtitle) {
        params.subtitle = subtitle;
      }

      const response = await axios.get(url, { 
        params,
        timeout: 5000 
      });

      logger.notification('bark_sent', `通知已发送: ${message}`);
      return response.data;
    } catch (error) {
      logger.error('发送Bark通知失败', {
        message,
        error: error.message
      });
      throw error;
    }
  }

  // 发送掉线通知（带防重复机制）
  async sendOfflineNotification() {
    const now = Date.now();
    const lastTime = this.lastNotificationTime.offline || 0;
    
    // 防止重复发送（5分钟内只发送一次）
    if (now - lastTime < 60 * 60 * 1000) {
      return;
    }

    this.lastNotificationTime.offline = now;
    
    const message = '系统掉线';
    const subtitle = `检测时间: ${new Date().toLocaleString()}`;
    
    await this.sendNotification(message, subtitle);
  }

  // 发送恢复通知
  async sendRecoveryNotification() {
    const message = '系统已恢复连接';
    const subtitle = `恢复时间: ${new Date().toLocaleString()}`;
    
    // 清除掉线通知时间戳
    delete this.lastNotificationTime.offline;
    
    await this.sendNotification(message, subtitle);
  }

  // 发送交易通知
  async sendTradeNotification(action, result) {
    const message = `交易执行: ${action}`;
    const subtitle = result.success ? '执行成功' : `执行失败: ${result.error}`;
    
    await this.sendNotification(message, subtitle);
  }

  // 发送错误通知
  async sendErrorNotification(error, context = '') {
    const message = '系统错误';
    const subtitle = context ? `${context}: ${error}` : error;
    
    await this.sendNotification(message, subtitle);
  }
}

module.exports = NotificationService;