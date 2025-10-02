#!/usr/bin/env node

const axios = require('axios');

// 配置
const API_URL = 'http://localhost:3000/api';

async function pushTradingConfig() {
  try {
    console.log('🚀 开始推送交易配置...');
    
    // 构建交易配置数据
    const requestData = {
      action: 'config',
      data: {
        contract: 'BTC_USDT',
        amount: 1
      }
    };
    
    console.log('📤 发送请求到:', API_URL);
    console.log('📋 交易配置:');
    console.log('  - 合约:', requestData.data.contract);
    console.log('  - 数量:', requestData.data.amount);
    
    // 发送请求
    const response = await axios.post(API_URL, requestData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ 推送成功!');
    console.log('📊 响应数据:', response.data);
    
    if (response.data.success) {
      console.log('🎉 交易配置已成功更新到交易系统!');
      console.log('⚙️  当前配置:', response.data.config);
    } else {
      console.log('❌ 服务器返回失败:', response.data.error);
    }
    
  } catch (error) {
    console.error('❌ 推送失败:');
    
    if (error.code === 'ECONNREFUSED') {
      console.error('🔌 连接被拒绝 - 请确保交易系统已启动 (npm start)');
      console.error('🌐 API地址:', API_URL);
    } else if (error.response) {
      console.error('🌐 HTTP错误:', error.response.status, error.response.statusText);
      console.error('📄 错误详情:', error.response.data);
    } else {
      console.error('💥 未知错误:', error.message);
    }
    
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  pushTradingConfig();
}

module.exports = pushTradingConfig;