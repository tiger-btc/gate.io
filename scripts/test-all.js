#!/usr/bin/env node

const axios = require('axios');
const pushHeader = require('./test-push-header');
const pushConfig = require('./test-push-config');

// 配置
const API_URL = 'http://localhost:3000';

async function testSystemStatus() {
  try {
    console.log('🔍 检查系统状态...');
    const response = await axios.get(`${API_URL}/health`, { timeout: 5000 });
    console.log('✅ 系统运行正常');
    console.log('📊 系统状态:', response.data);
    return true;
  } catch (error) {
    console.error('❌ 系统未运行或无法连接');
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 请先启动交易系统: npm start');
    }
    return false;
  }
}

async function testStatusAPI() {
  try {
    console.log('\n🔍 测试状态查询API...');
    const response = await axios.post(`${API_URL}/api`, {
      action: 'status'
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });
    
    console.log('✅ 状态查询成功');
    console.log('📊 系统详细状态:');
    console.log('  - HTTP配置状态:', response.data.status.httpConfigured);
    console.log('  - Socket连接状态:', response.data.status.socket.connected);
    console.log('  - 最后心跳时间:', response.data.status.lastHeartbeat);
    console.log('  - 心跳状态:', response.data.status.heartbeatStatus);
    
    return response.data;
  } catch (error) {
    console.error('❌ 状态查询失败:', error.message);
    return null;
  }
}

async function runAllTests() {
  console.log('🧪 开始完整系统测试...\n');
  
  // 1. 检查系统状态
  const systemOk = await testSystemStatus();
  if (!systemOk) {
    process.exit(1);
  }
  
  // 2. 推送Header配置
  console.log('\n📡 步骤1: 推送Header配置');
  console.log('=' .repeat(50));
  try {
    await pushHeader();
  } catch (error) {
    console.error('Header推送失败，继续其他测试...');
  }
  
  // 3. 推送交易配置
  console.log('\n📡 步骤2: 推送交易配置');
  console.log('=' .repeat(50));
  try {
    await pushConfig();
  } catch (error) {
    console.error('交易配置推送失败，继续其他测试...');
  }
  
  // 4. 查询最终状态
  console.log('\n📡 步骤3: 查询最终状态');
  console.log('=' .repeat(50));
  await testStatusAPI();
  
  console.log('\n🎉 测试完成!');
  console.log('💡 提示: 现在您可以通过Socket.IO发送交易信号进行测试');
  console.log('📋 信号格式示例:');
  console.log('   {"direction": "buy"}    - 开多仓');
  console.log('   {"direction": "sell"}   - 开空仓');
  console.log('   {"direction": "close"}  - 平仓');
}

// 如果直接运行此脚本
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('💥 测试过程中发生错误:', error.message);
    process.exit(1);
  });
}

module.exports = {
  testSystemStatus,
  testStatusAPI,
  runAllTests
};