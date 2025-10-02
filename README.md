# 自动化交易系统

基于信号驱动的自动化期货交易系统，通过Socket.IO接收交易信号，自动执行买入、卖出和平仓操作。

## 功能特性

- 🔄 **信号驱动**: 通过Socket.IO接收实时交易信号
- 🏪 **交易执行**: 支持开多仓、开空仓、平仓操作
- 📊 **账户监控**: 定时查询账户余额和持仓信息
- 🔔 **推送通知**: 通过Bark发送iOS推送通知
- 💓 **心跳检测**: 监控连接状态，自动检测掉线
- 📝 **完整日志**: 记录所有交易操作和系统状态

## 项目结构

```
trading-system/
├── src/
│   ├── config/
│   │   ├── default.json      # 系统默认配置
│   │   └── runtime.json      # 运行时配置(API接收的配置)
│   ├── modules/
│   │   ├── httpClient.js     # HTTP客户端封装
│   │   ├── socketClient.js   # Socket.IO客户端
│   │   ├── tradeExecutor.js  # 交易执行器
│   │   ├── notificationService.js  # Bark通知服务
│   │   └── logger.js         # 日志管理
│   ├── api/
│   │   └── configApi.js      # 配置API服务
│   └── app.js                # 主程序入口
├── logs/                     # 日志目录
├── package.json
└── README.md
```

## 安装依赖

```bash
npm install
```

## 配置说明

### 1. 系统配置 (src/config/default.json)

```json
{
  "socket": {
    "url": "ws://localhost:3001",   // Socket.IO服务器地址
    "reconnectDelay": 5000,         // 重连延迟(ms)
    "maxReconnectAttempts": 10      // 最大重连次数
  },
  "system": {
    "logLevel": "info",             // 日志级别
    "apiTimeout": 10000,            // API请求超时(ms)
    "accountQueryInterval": 10000,  // 账户查询间隔(ms)
    "heartbeatInterval": 60000      // 心跳检测间隔(ms)
  },
  "notification": {
    "barkUrl": "https://api.day.app/YOUR_KEY",  // Bark推送URL
    "enabled": true,                            // 是否启用通知
    "title": "交易系统告警"                      // 通知标题
  },
  "api": {
    "port": 3000,                   // API服务端口
    "host": "localhost"             // API服务地址
  }
}
```

### 2. Bark通知配置

1. 在iOS设备上安装Bark应用
2. 获取您的Bark推送URL
3. 在`default.json`中更新`notification.barkUrl`

## 启动系统

```bash
# 生产环境
npm start

# 开发环境
npm run dev
```

## API接口

### 1. 更新请求头配置

```bash
curl -X POST http://localhost:3000/api \
  -H "Content-Type: application/json" \
  -d '{
    "action": "header",
    "data": {
      "baseURL": "https://www.gate.com",
      "headers": {
        "Cookie": "token=...; csrftoken=..."
      }
    }
  }'
```

### 2. 更新交易配置

```bash
curl -X POST http://localhost:3000/api \
  -H "Content-Type: application/json" \
  -d '{
    "action": "config",
    "data": {
      "contract": "BTC_USDT",
      "amount": 1
    }
  }'
```

### 3. 查询系统状态

```bash
curl -X POST http://localhost:3000/api \
  -H "Content-Type: application/json" \
  -d '{
    "action": "status"
  }'
```

### 4. 健康检查

```bash
curl http://localhost:3000/health
```

## Socket.IO信号格式

系统监听`action`事件，信号格式如下：

```json
{
  "direction": "buy|sell|close",
  "timestamp": 1234567890
}
```

- `buy`: 开多仓
- `sell`: 开空仓  
- `close`: 平仓

## 日志说明

系统会在`logs/`目录下生成以下日志文件：

- `app.log`: 所有系统日志
- `error.log`: 错误日志
- `trade.log`: 交易操作日志

## 监控功能

### 1. 心跳检测
- 监控header更新时间
- 超过1分钟未更新视为掉线
- 自动发送Bark推送通知

### 2. 账户监控
- 定时查询账户余额
- 记录资金变化
- 监控持仓状态

### 3. 连接监控
- Socket.IO连接状态监控
- 自动重连机制
- 连接异常通知

## 安全说明

- API服务只监听localhost，仅接受本地请求
- 敏感信息通过配置文件管理
- 完整的操作日志记录

## 故障排除

### 1. Socket连接失败
- 检查Socket.IO服务器地址和端口
- 确认网络连接正常
- 查看日志文件中的错误信息

### 2. 交易执行失败
- 确认已正确配置API headers
- 检查合约名称和交易数量
- 查看交易日志了解具体错误

### 3. 通知发送失败
- 确认Bark URL配置正确
- 检查网络连接
- 验证Bark应用是否正常工作

## 开发说明

### 添加新功能
1. 在相应模块中添加功能代码
2. 更新日志记录
3. 添加错误处理
4. 更新文档

### 调试模式
设置环境变量启用调试日志：
```bash
export LOG_LEVEL=debug
npm start
```

## 许可证

MIT License