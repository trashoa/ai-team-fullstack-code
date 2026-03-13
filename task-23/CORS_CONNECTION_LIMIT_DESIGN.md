# WebSocket CORS 和连接数限制技术设计方案

## 1. 设计目标

- 防止跨站 WebSocket 连接攻击
- 限制并发连接数量防止 DDoS
- 提供灵活的配置选项

## 2. 数据模型设计

### 2.1 配置模型
```javascript
// config/websocket.js
const websocketConfig = {
  cors: {
    enabled: true,                // 是否启用 CORS
    origins: ['https://safe.domain.com', 'https://another.safe.com'], // 允许的源
    methods: ['GET', 'POST'],
    credentials: true             // 是否允许发送 cookies
  },
  connectionLimits: {
    maxConnections: 100,          // 最大连接数
    perIP: 10,                   // 每个 IP 最大连接数
    checkInterval: 60000         // 检查间隔 (毫秒)
  }
};
```

### 2.2 连接状态模型
```javascript
// ConnectionStore 数据结构
class ConnectionStore {
  constructor() {
    this.connections = new Map();     // 所有连接
    this.ipCounts = new Map();        // 每个 IP 的连接数
    this.connectionStats = {          // 统计信息
      totalConnections: 0,
      peakConnections: 0,
      rejectedConnections: 0
    };
  }
}
```

## 3. API 接口设计

### 3.1 WebSocket 服务器接口
```javascript
class SecureWebSocketServer {
  /**
   * 初始化安全 WebSocket 服务器
   * @param {Object} config - 安全配置
   */
  constructor(config) {
    this.config = config;
    this.connectionStore = new ConnectionStore();
  }

  /**
   * 验证请求来源
   * @param {Request} req - HTTP 请求对象
   * @returns {Boolean} 是否允许连接
   */
  validateOrigin(req) {}

  /**
   * 检查连接限制
   * @param {String} ip - 客户端 IP
   * @returns {Boolean} 是否超过限制
   */
  checkConnectionLimit(ip) {}

  /**
   * 记录连接
   * @param {String} ip - 客户端 IP
   * @param {WebSocket} ws - WebSocket 对象
   */
  registerConnection(ip, ws) {}

  /**
   * 清理连接
   * @param {String} ip - 客户端 IP
   * @param {WebSocket} ws - WebSocket 对象
   */
  unregisterConnection(ip, ws) {}
}
```

## 4. 技术方案

### 4.1 CORS 实现方案

#### 4.1.1 Origin 头验证
```javascript
function validateOrigin(req, allowedOrigins) {
  const origin = req.headers.origin;
  
  // 如果没有 Origin 头，认为是合法连接（如直接通过 IP 连接）
  if (!origin) return true;
  
  // 检查是否在允许列表中
  return allowedOrigins.includes(origin);
}
```

#### 4.1.2 预检请求处理（如果需要）
虽然 WebSocket 连接本身不经过预检请求，但可以在中间件层面进行控制：

```javascript
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);  // 没有 Origin 头时允许
    
    const isAllowed = config.cors.origins.includes(origin);
    callback(null, isAllowed);
  },
  credentials: config.cors.credentials
};
```

### 4.2 连接数限制实现方案

#### 4.2.1 IP 地址获取
```javascript
function getClientIP(req) {
  // 尝试从多个头部获取真实 IP
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip']?.split(',')[0]?.trim() ||
         req.socket.remoteAddress;
}
```

#### 4.2.2 连接计数与限制
```javascript
class ConnectionLimiter {
  constructor(options) {
    this.maxTotal = options.maxConnections;
    this.maxPerIP = options.perIP;
    this.ipConnections = new Map();
    this.totalConnections = 0;
  }

  canConnect(clientIP) {
    // 检查总连接数
    if (this.totalConnections >= this.maxTotal) {
      return { allowed: false, reason: 'MAX_TOTAL_EXCEEDED' };
    }

    // 检查单 IP 连接数
    const currentIPCount = this.ipConnections.get(clientIP) || 0;
    if (currentIPCount >= this.maxPerIP) {
      return { allowed: false, reason: 'MAX_PER_IP_EXCEEDED' };
    }

    return { allowed: true };
  }

  addConnection(clientIP) {
    this.totalConnections++;
    this.ipConnections.set(clientIP, (this.ipConnections.get(clientIP) || 0) + 1);
  }

  removeConnection(clientIP) {
    this.totalConnections = Math.max(0, this.totalConnections - 1);
    
    const currentIPCount = this.ipConnections.get(clientIP) || 0;
    if (currentIPCount <= 1) {
      this.ipConnections.delete(clientIP);
    } else {
      this.ipConnections.set(clientIP, currentIPCount - 1);
    }
  }
}
```

## 5. 架构说明

### 5.1 整体架构
```
[Client Request] -> [Origin Validation] -> [Connection Limit Check] -> [Auth Token Validation] -> [WebSocket Connection]
                         |                          |                        |
                     CORS Filter              Rate Limiting            Auth Layer
```

### 5.2 配置文件结构
```
config/
├── websocket.js          # WebSocket 相关配置
├── security.js           # 安全相关配置
└── limits.js             # 限流配置
```

### 5.3 中间件集成
```javascript
// 集成到 Express 中间件
app.use((req, res, next) => {
  if (req.headers.upgrade === 'websocket') {
    // WebSocket 连接的特殊处理
    const clientIP = getClientIP(req);
    
    // 检查来源
    if (!validateOrigin(req)) {
      res.writeHead(403, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'Forbidden origin'}));
      return;
    }
    
    // 检查连接限制
    if (!connectionLimiter.canConnect(clientIP)) {
      res.writeHead(429, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'Too many connections'}));
      return;
    }
  }
  
  next();
});
```

### 5.4 安全监控面板
```javascript
// 提供监控接口
app.get('/api/ws/stats', (req, res) => {
  res.json({
    connections: connectionStore.connectionStats,
    ipDistribution: Array.from(connectionStore.ipCounts.entries())
  });
});
```

## 6. 部署和配置考虑

### 6.1 环境变量配置
```bash
# 生产环境配置
WS_CORS_ENABLED=true
WS_MAX_CONNECTIONS=1000
WS_MAX_CONNECTIONS_PER_IP=5
WS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
```

### 6.2 监控告警
- 连接数接近上限时发出警告
- 异常 IP 连接行为监控
- 性能指标监控

## 7. 安全测试要点

1. 验证 CORS 限制是否生效
2. 测试连接数限制功能
3. 验证拒绝超限连接的行为
4. 确保正常连接不受影响

## 8. 性能优化

- 使用 Map 而非 Object 存储连接信息（性能更好）
- 定期清理过期的 IP 计数信息
- 连接统计信息异步更新避免阻塞