#!/usr/bin/env node

const axios = require('axios');

// 配置
const API_URL = 'http://localhost:3000/api';

async function debugHttpClient() {
  try {
    console.log('🔍 调试HTTP客户端配置...');
    
    // 查询详细状态
    const response = await axios.post(API_URL, {
      action: 'status'
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });
    
    const status = response.data.status;
    const config = status.config;
    
    console.log('📊 详细配置信息:');
    console.log('  - HTTP配置状态:', status.httpConfigured);
    console.log('  - API baseURL:', config.api.baseURL || '未配置');
    console.log('  - API headers数量:', Object.keys(config.api.headers || {}).length);
    console.log('  - 交易合约:', config.trading.contract || '未配置');
    console.log('  - 交易数量:', config.trading.amount);
    console.log('  - 最后心跳:', status.lastHeartbeat || '无');
    
    // 检查配置完整性
    console.log('\n🔧 配置检查:');
    
    if (!config.api.baseURL) {
      console.log('❌ baseURL未配置');
      console.log('💡 解决方案: 运行 npm run test:header');
    } else {
      console.log('✅ baseURL已配置:', config.api.baseURL);
    }
    
    if (!config.api.headers || Object.keys(config.api.headers).length === 0) {
      console.log('❌ headers未配置');
      console.log('💡 解决方案: 运行 npm run test:header');
    } else {
      console.log('✅ headers已配置，数量:', Object.keys(config.api.headers).length);
      
      // 检查关键headers
      const headers = config.api.headers;
      if (headers.Cookie) {
        console.log('  ✅ Cookie已配置，长度:', headers.Cookie.length);
      } else {
        console.log('  ❌ Cookie未配置');
      }
    }
    
    if (!config.trading.contract) {
      console.log('❌ 交易合约未配置');
      console.log('💡 解决方案: 运行 npm run test:config');
    } else {
      console.log('✅ 交易合约已配置:', config.trading.contract);
    }
    
    // 测试建议
    console.log('\n💡 测试建议:');
    if (!status.httpConfigured) {
      console.log('1. 先运行: npm run test:header');
      console.log('2. 再运行: npm run test:config');
      console.log('3. 最后运行: npm run test:account');
    } else {
      console.log('1. 配置看起来正常');
      console.log('2. 检查日志文件: tail -f logs/app.log');
      console.log('3. 如果仍有问题，重启系统试试');
    }
    
  } catch (error) {
    console.error('❌ 调试失败:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('🔌 连接被拒绝 - 请确保交易系统已启动 (npm start)');
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  debugHttpClient();
}

module.exports = debugHttpClient;