const logger = require('./logger');

class TradeExecutor {
  constructor(httpClient, notificationService) {
    this.httpClient = httpClient;
    this.notificationService = notificationService;
    this.contract = '';
    this.amount = 1; // 实际是缩放
  }

  // 更新交易配置
  updateConfig(config) {
    this.contract = config.contract;
    this.amount = config.amount;
    logger.info('交易配置已更新', config);
  }

  // 开仓
  async open(side = 'LONG', amount = null, season = '开多仓') {
    const dir = side === 'LONG' ? 1 : -1;
    const size = amount * this.amount;
    const orderData = {
      contract: this.contract,
      price: '0',
      size: (dir * size).toString(),
      reduce_only: false,
      text: 'web',
      tif: 'gtc'
    };
    return await this.executeOrder(season, orderData);
  }

  async add(side = 'LONG', amount = null, season = '加多仓') {
    return await this.open(side, amount, season)
  }

  async reduce(side = 'LONG', amount = null, season = '加多仓') {
    const dir = side === 'LONG' ? -1 : 1;
    const size = amount * this.amount;
    const orderData = {
      contract: this.contract,
      price: '0',
      order_type: "market",
      size: (dir * size).toString(),
      reduce_only: true,
      text: 'web',
      tif: 'gtc'
    };
    return await this.executeOrder(season, orderData);
  }

  // 平仓
  async close() {
    const closeData = {
      only_close_positions: false
    };
    return await this.executeCloseOrder('平仓', closeData);
  }

  // 执行开仓订单
  async executeOrder(action, orderData) {
    if (!this.httpClient.isConfigured()) {
      const error = 'HTTP客户端未配置';
      logger.error(error);
      await this.notificationService.sendErrorNotification(error, action);
      return { success: false, error };
    }

    if (!this.contract) {
      const error = '合约未配置';
      logger.error(error);
      await this.notificationService.sendErrorNotification(error, action);
      return { success: false, error };
    }

    try {
      logger.trade(action, {
        action: 'start',
        contract: this.contract,
        size: orderData.size
      });

      const result = await this.httpClient.post('/apiw/v2/futures/usdt/orders', orderData);

      logger.trade(action, {
        action: 'success',
        contract: this.contract,
        size: orderData.size,
        orderData,
        result
      });

      await this.notificationService.sendTradeNotification(action, { success: true });

      return { success: true, data: result };
    } catch (error) {
      logger.trade(action, {
        action: 'error',
        contract: this.contract,
        size: orderData.size,
        error: error.message
      });

      await this.notificationService.sendTradeNotification(action, {
        success: false,
        error: error.message
      });

      return { success: false, error: error.message };
    }
  }

  // 执行平仓订单
  async executeCloseOrder(action, closeData) {
    if (!this.httpClient.isConfigured()) {
      const error = 'HTTP客户端未配置';
      logger.error(error);
      await this.notificationService.sendErrorNotification(error, action);
      return { success: false, error };
    }

    try {
      logger.trade(action, {
        action: 'start'
      });

      const result = await this.httpClient.post('/apiw/v2/futures/usdt/positions/close_all', closeData);

      logger.trade(action, {
        action: 'success',
        result
      });

      await this.notificationService.sendTradeNotification(action, { success: true });

      return { success: true, data: result };
    } catch (error) {
      logger.trade(action, {
        action: 'error',
        error: error.message
      });

      await this.notificationService.sendTradeNotification(action, {
        success: false,
        error: error.message
      });

      return { success: false, error: error.message };
    }
  }

  // 查询账户信息
  async getAccount() {
    if (!this.httpClient.isConfigured()) {
      logger.warn('HTTP客户端未配置，跳过账户查询');
      return null;
    }

    try {
      const result = await this.httpClient.get('/apiw/v2/futures/usdt/accounts');

      if (result && result.data && result.data.length > 0) {
        const account = result.data[0];
        const { asset, cross_available, cross_unrealised_pnl, cross_initial_margin, cross_maintenance_margin } = account;
        const total = parseFloat(cross_initial_margin) + parseFloat(cross_available) + parseFloat(cross_unrealised_pnl) + parseFloat(cross_maintenance_margin);

        logger.account({
          asset,
          available: cross_available,
          unrealised_pnl: cross_unrealised_pnl,
          total: total.toFixed(6)
        });

        return account;
      }

      return null;
    } catch (error) {
      logger.error('查询账户信息失败', { error: error.message });
      return null;
    }
  }

  // 查询持仓信息
  async getPositions() {
    if (!this.httpClient.isConfigured()) {
      logger.warn('HTTP客户端未配置，跳过持仓查询');
      return null;
    }

    try {
      const result = await this.httpClient.get('/apiw/v2/futures/usdt/positions');

      if (result && result.data) {
        logger.info('持仓信息查询成功', {
          positionCount: result.data.length
        });
        return result.data;
      }

      return null;
    } catch (error) {
      logger.error('查询持仓信息失败', { error: error.message });
      return null;
    }
  }
}

module.exports = TradeExecutor;
