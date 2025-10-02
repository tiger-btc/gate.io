# 🧪 测试指南

本文档说明如何测试自动化交易系统的各项功能。

## 📋 可用的测试命令

### 1. 推送Header配置
```bash
npm run test:header
```
**功能**: 读取 `raw_datas/header.json` 文件，将其中的Cookie和其他请求头信息推送到交易系统。

**作用**: 
- 配置Gate.io API的认证信息
- 更新系统心跳时间戳
- 启用HTTP客户端功能

### 2. 推送交易配置
```bash
npm run test:config
```
**功能**: 推送交易参数配置（合约名称、交易数量等）。

**默认配置**:
- 合约: `BTC_USDT`
- 数量: `1` 张

### 3. 完整系统测试
```bash
npm run test:all
```
**功能**: 执行完整的系统测试流程：
1. 检查系统运行状态
2. 推送Header配置
3. 推送交易配置
4. 查询最终系统状态

### 4. 查询系统状态
```bash
npm run test:status
```
**功能**: 快速查询系统健康状态。

## 🚀 测试流程

### 第一步：启动交易系统
```bash
npm start
```

### 第二步：运行完整测试
```bash
npm run test:all
```

### 第三步：查看测试结果
测试脚本会显示详细的执行过程和结果：

```
🧪 开始完整系统测试...

🔍 检查系统状态...
✅ 系统运行正常

📡 步骤1: 推送Header配置
==================================================
🚀 开始推送header配置...
📖 读取header文件: /path/to/raw_datas/header.json
📤 发送请求到: http://localhost:3000/api
✅ 推送成功!
🎉 Header配置已成功更新到交易系统!

📡 步骤2: 推送交易配置
==================================================
🚀 开始推送交易配置...
📤 发送请求到: http://localhost:3000/api
✅ 推送成功!
🎉 交易配置已成功更新到交易系统!

📡 步骤3: 查询最终状态
==================================================
🔍 测试状态查询API...
✅ 状态查询成功
📊 系统详细状态:
  - HTTP配置状态: true
  - Socket连接状态: true
  - 最后心跳时间: 2024-01-01T12:00:00.000Z
  - 心跳状态: online

🎉 测试完成!
```

## 📁 文件说明

### 测试脚本文件
- `scripts/test-push-header.js` - Header配置推送脚本
- `scripts/test-push-config.js` - 交易配置推送脚本
- `scripts/test-all.js` - 完整测试脚本

### 数据文件
- `raw_datas/header.json` - 包含Gate.io请求头信息
- `src/config/default.json` - 系统默认配置
- `src/config/runtime.json` - 运行时配置（自动生成）

## 🔧 自定义测试

### 修改交易参数
编辑 `scripts/test-push-config.js`：
```javascript
const requestData = {
  action: 'config',
  data: {
    contract: 'ETH_USDT',  // 改为其他合约
    amount: 2              // 改为其他数量
  }
};
```

### 测试不同的Header
替换 `raw_datas/header.json` 文件内容，然后运行：
```bash
npm run test:header
```

## ❌ 常见错误

### 1. 连接被拒绝
```
❌ 推送失败:
🔌 连接被拒绝 - 请确保交易系统已启动 (npm start)
```
**解决**: 先运行 `npm start` 启动系统

### 2. 文件不存在
```
❌ 推送失败:
📁 文件不存在: /path/to/raw_datas/header.json
```
**解决**: 确保 `raw_datas/header.json` 文件存在

### 3. JSON格式错误
```
❌ 推送失败:
💥 未知错误: Unexpected token in JSON
```
**解决**: 检查 `raw_datas/header.json` 文件格式是否正确

## 💡 测试提示

1. **先启动系统**: 所有测试都需要系统处于运行状态
2. **检查日志**: 查看 `logs/` 目录下的日志文件了解详细信息
3. **逐步测试**: 可以先单独测试header，再测试config
4. **验证配置**: 使用 `npm run test:status` 验证配置是否生效

## 🎯 下一步

测试完成后，您可以：
1. 配置Socket.IO信号源
2. 发送交易信号测试实际交易功能
3. 监控日志文件查看系统运行状态
4. 配置Bark通知接收系统告警