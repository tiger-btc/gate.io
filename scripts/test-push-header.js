#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 配置
const API_URL = 'http://localhost:3000/api';
const HEADER_FILE = path.join(__dirname, '../raw_datas/header.json');

async function pushHeaderConfig() {
  try {
    console.log('🚀 开始推送header配置...');
    
    // 读取header文件
    console.log('📖 读取header文件:', HEADER_FILE);
    const headerData = JSON.parse(fs.readFileSync(HEADER_FILE, 'utf8'));
    
    // 提取Cookie和csrftoken
    const cookie = headerData.cookie;
    const csrftoken = headerData.csrftoken;
    
    if (!cookie) {
      throw new Error('header.json中未找到cookie字段');
    }
    
    // 构建请求数据
    const requestData = {
      action: 'header',
      data: {
        baseURL: 'https://www.gate.com',
        headers: {
          'Cookie': cookie,
          'Accept': headerData.accept || 'application/json',
          'Accept-Language': headerData['accept-language'] || 'zh-CN,zh;q=0.9',
          'User-Agent': headerData['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': headerData.referer || 'https://www.gate.com/',
          'X-Gate-Applang': headerData['x-gate-applang'] || 'cn',
          'X-Gate-Device-Type': headerData['x-gate-device-type'] || '0'
        }
      }
    };
    
    // 如果有单独的csrftoken字段，也添加到Cookie中
    if (csrftoken && !cookie.includes('csrftoken=')) {
      requestData.data.headers.Cookie += `; csrftoken=${csrftoken}`;
    }
    
    console.log('📤 发送请求到:', API_URL);
    console.log('📋 请求数据:');
    console.log('  - baseURL:', requestData.data.baseURL);
    console.log('  - headers数量:', Object.keys(requestData.data.headers).length);
    console.log('  - Cookie长度:', requestData.data.headers.Cookie.length);
    
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
      console.log('🎉 Header配置已成功更新到交易系统!');
      console.log('⏰ 更新时间:', response.data.timestamp);
    } else {
      console.log('❌ 服务器返回失败:', response.data.error);
    }
    
  } catch (error) {
    console.error('❌ 推送失败:');
    
    if (error.code === 'ECONNREFUSED') {
      console.error('🔌 连接被拒绝 - 请确保交易系统已启动 (npm start)');
      console.error('🌐 API地址:', API_URL);
    } else if (error.code === 'ENOENT') {
      console.error('📁 文件不存在:', HEADER_FILE);
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
  pushHeaderConfig();
}

module.exports = pushHeaderConfig;