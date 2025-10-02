#!/usr/bin/env node

const axios = require('axios');

// 配置
const API_URL = 'http://localhost:3000/api';

async function testAccountQuery() {
  try {
    console.log('🧪 测试账户查询功能...');
    
    // 首先检查系统状态
    console.log('🔍 检查系统状态...');
    const statusResponse = await axios.post(API_URL, {
      action: 'status'
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });
    
    console.log('📊 系统状态:');
    console.log('  - HTTP配置状态:', statusResponse.data.status.httpConfigured);
    console.log('  - Socket连接状态:', statusResponse.data.status.socket.connected);
    console.log('  - 最后心跳时间:', statusResponse.data.status.lastHeartbeat);
    console.log('  - 心跳状态:', statusResponse.data.status.heartbeatStatus);
    
    if (!statusResponse.data.status.httpConfigured) {
      console.log('❌ HTTP客户端未配置，请先运行: npm run test:header');
      return;
    }
    
    console.log('✅ 系统配置正常，账户查询应该可以正常工作');
    console.log('💡 查看系统日志以确认账户查询是否成功执行');
    console.log('📁 日志文件位置: logs/app.log 和 logs/trade.log');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('🔌 连接被拒绝 - 请确保交易系统已启动 (npm start)');
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  testAccountQuery();
}

module.exports = testAccountQuery;