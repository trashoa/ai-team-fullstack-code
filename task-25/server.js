// 任务进度监控服务器 - 安全修复版本
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const port = 3000;

// ============== 安全配置 ==============
// 1. WebSocket Token 认证
const WS_SECRET = process.env.WS_SECRET || crypto.randomBytes(32).toString('hex');
console.log('WebSocket Secret (保存好这个值):', WS_SECRET);

// 2. 连接数限制
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS) || 100;
const MAX_MESSAGES_PER_MINUTE = 60;

// 3. CORS 配置
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:8080'];
app.use(cors({
  origin: function(origin, callback) {
    // 允许无 origin 的请求（如 Postman）
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
      callback(null, true);
    } else {
      console.warn(`[CORS] 拒绝来源: ${origin}`);
      callback(new Error('不允许的来源'));
    }
  },
  credentials: true
}));

// 4. 请求体大小限制
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h'  // 缓存控制
}));

// ============== 日志系统 ==============
const fs = require('fs');
const logFile = process.env.LOG_FILE || '/var/log/ai-team-websocket.log';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // debug, info, warn, error

function log(level, message, data = null) {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  if (levels[level] < levels[LOG_LEVEL]) return;

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    message,
    ...(data && { data })
  };

  console[level === 'error' ? 'error' : 'log'](`[${timestamp}] [${level.toUpperCase()}] ${message}`, data ? JSON.stringify(data) : '');

  // 异步写入日志文件
  if (logFile) {
    fs.appendFile(logFile, JSON.stringify(logEntry) + '\n', (err) => {
      if (err) console.error('日志写入失败:', err.message);
    });
  }
}

// ============== WebSocket 服务器 ==============
const WebSocket = require('ws');

const wss = new WebSocket.Server({ 
  port: 8080,
  // 5. 连接验证
  verifyClient: (info, cb) => {
    const url = new URL(info.req.url, `http://${info.req.headers.host}`);
    const token = url.searchParams.get('token');
    
    // 检查连接数限制
    if (wss.clients.size >= MAX_CONNECTIONS) {
      log('warn', '连接数超限，拒绝新连接', { current: wss.clients.size, max: MAX_CONNECTIONS });
      cb(false, 4002, '连接数过多');
      return;
    }
    
    // Token 验证
    if (token !== WS_SECRET) {
      log('warn', 'WebSocket 认证失败', { ip: info.req.socket.remoteAddress });
      cb(false, 4001, '未授权');
      return;
    }
    
    cb(true);
  }
});

// 存储工作者状态的对象
const workers = {};

// 存储当前处理的任务信息
const currentTasks = {};

// 存储工作者的Token消耗统计
const tokenUsage = {};

// 消息频率限制器
const messageRateLimiter = new Map();

function checkRateLimit(clientId) {
  const now = Date.now();
  const clientLimit = messageRateLimiter.get(clientId) || { count: 0, resetTime: now + 60000 };
  
  if (now > clientLimit.resetTime) {
    clientLimit.count = 1;
    clientLimit.resetTime = now + 60000;
  } else {
    clientLimit.count++;
  }
  
  messageRateLimiter.set(clientId, clientLimit);
  
  if (clientLimit.count > MAX_MESSAGES_PER_MINUTE) {
    log('warn', '消息频率超限', { clientId, count: clientLimit.count });
    return false;
  }
  return true;
}

// 6. 消息格式验证
function validateMessage(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: '消息必须是对象' };
  }
  
  if (!data.type || typeof data.type !== 'string') {
    return { valid: false, error: '消息必须有 type 字段且为字符串' };
  }
  
  const validTypes = ['heartbeat', 'token_usage', 'status_update'];
  if (!validTypes.includes(data.type)) {
    return { valid: false, error: `无效的 type: ${data.type}` };
  }
  
  if (data.workerId && typeof data.workerId !== 'string') {
    return { valid: false, error: 'workerId 必须是字符串' };
  }
  
  if (data.workerId && data.workerId.length > 100) {
    return { valid: false, error: 'workerId 过长' };
  }
  
  // 清理输入防止 XSS
  if (data.name && typeof data.name === 'string') {
    data.name = data.name.replace(/[<>"'&]/g, '').substring(0, 50);
  }
  
  return { valid: true };
}

// 广播函数
function broadcastWorkersStatus() {
  const message = JSON.stringify({
    type: 'workers_status',
    data: Object.values(workers)
  });
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastTokenUsage() {
  const message = JSON.stringify({
    type: 'token_usage',
    data: tokenUsage
  });
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// WebSocket 连接处理
wss.on('connection', (ws, req) => {
  const clientId = `${req.socket.remoteAddress}-${Date.now()}`;
  ws.clientId = clientId;
  ws.isAlive = true;
  
  log('info', '新的 WebSocket 连接已建立', { 
    clientId, 
    ip: req.socket.remoteAddress,
    totalConnections: wss.clients.size 
  });

  // 发送当前所有工作者状态给新连接的客户端
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'workers_status',
      data: Object.values(workers)
    }));
    
    ws.send(JSON.stringify({
      type: 'token_usage',
      data: tokenUsage
    }));
    
    ws.send(JSON.stringify({
      type: 'connection_info',
      data: {
        clientId,
        connectedAt: new Date().toISOString(),
        serverVersion: '2.0.0-secure'
      }
    }));
  }

  // 心跳响应
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (message) => {
    // 频率限制检查
    if (!checkRateLimit(clientId)) {
      ws.send(JSON.stringify({ type: 'error', message: '消息频率超限，请稍后再试' }));
      return;
    }

    try {
      const data = JSON.parse(message);
      
      // 消息格式验证
      const validation = validateMessage(data);
      if (!validation.valid) {
        log('warn', '消息格式验证失败', { clientId, error: validation.error });
        ws.send(JSON.stringify({ type: 'error', message: validation.error }));
        return;
      }
      
      if (data.type === 'heartbeat') {
        // 处理工作者心跳上报
        const workerId = data.workerId;
        if (!workerId) {
          ws.send(JSON.stringify({ type: 'error', message: 'heartbeat 消息必须包含 workerId' }));
          return;
        }
        
        const timestamp = Date.now();
        
        // 更新或创建工作者信息
        workers[workerId] = {
          id: workerId,
          name: data.name || workerId,
          lastHeartbeat: timestamp,
          status: 'online',
          ip: data.ip || 'unknown',
          timestamp: timestamp,
          clientId: ws.clientId
        };
        
        log('debug', `收到 ${workerId} 的心跳`, { time: new Date(timestamp).toLocaleString() });
        
        // 广播给所有客户端工作者状态变化
        broadcastWorkersStatus();
        
        // 发送确认
        ws.send(JSON.stringify({ type: 'heartbeat_ack', timestamp }));
        
      } else if (data.type === 'token_usage') {
        // 处理Token消耗上报
        const workerId = data.workerId;
        if (!workerId) {
          ws.send(JSON.stringify({ type: 'error', message: 'token_usage 消息必须包含 workerId' }));
          return;
        }
        
        const tokensUsed = typeof data.tokensUsed === 'number' ? data.tokensUsed : 0;
        const timestamp = Date.now();
        
        // 更新Token消耗信息
        tokenUsage[workerId] = {
          workerId: workerId,
          tokensUsed: tokensUsed,
          timestamp: timestamp
        };
        
        log('debug', `收到 ${workerId} 的Token消耗数据`, { tokensUsed });
        
        // 广播给所有客户端Token消耗变化
        broadcastTokenUsage();
        
        // 发送确认
        ws.send(JSON.stringify({ type: 'token_usage_ack', timestamp }));
      }
    } catch (error) {
      log('error', '解析消息时出错', { clientId, error: error.message });
      ws.send(JSON.stringify({ type: 'error', message: '消息解析失败: ' + error.message }));
    }
  });

  ws.on('close', (code, reason) => {
    log('info', 'WebSocket 连接关闭', { clientId, code, reason: reason?.toString() });
    
    // 清理频率限制器
    messageRateLimiter.delete(clientId);
    
    // 将该客户端关联的工作者标记为离线
    let updated = false;
    for (const workerId in workers) {
      if (workers[workerId].clientId === clientId) {
        workers[workerId].status = 'offline';
        workers[workerId].lastDisconnect = Date.now();
        updated = true;
      }
    }
    if (updated) {
      broadcastWorkersStatus();
    }
  });

  ws.on('error', (error) => {
    log('error', 'WebSocket 错误', { clientId, error: error.message });
  });
});

// 7. 心跳检测（检测僵尸连接）
const HEARTBEAT_INTERVAL = 30000; // 30秒
const HEARTBEAT_TIMEOUT = 90000;  // 90秒超时

const heartbeatInterval = setInterval(() => {
  const now = Date.now();
  
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      log('warn', '心跳超时，断开连接', { clientId: ws.clientId });
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping();
  });
  
  // 检查工作者超时
  let updated = false;
  for (const workerId in workers) {
    if (workers[workerId].status === 'online' && 
        now - workers[workerId].lastHeartbeat > HEARTBEAT_TIMEOUT) {
      log('warn', `${workers[workerId].name} 心跳超时，标记为离线`);
      workers[workerId].status = 'offline';
      updated = true;
    }
  }
  
  if (updated) {
    broadcastWorkersStatus();
  }
}, HEARTBEAT_INTERVAL);

// 服务器关闭时清理
process.on('SIGTERM', () => {
  log('info', '收到 SIGTERM，正在关闭服务器...');
  clearInterval(heartbeatInterval);
  wss.close(() => {
    log('info', 'WebSocket 服务器已关闭');
    process.exit(0);
  });
});

// ============== HTTP API ==============

// 8. 健康检查端点
app.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    websocket_connections: wss.clients.size,
    max_connections: MAX_CONNECTIONS,
    active_workers: Object.values(workers).filter(w => w.status === 'online').length,
    timestamp: new Date().toISOString(),
    version: '2.0.0-secure'
  });
});

// 指标端点（用于监控）
app.get('/metrics', (req, res) => {
  const metrics = {
    websocket: {
      total_connections: wss.clients.size,
      max_connections: MAX_CONNECTIONS,
      utilization_percent: Math.round((wss.clients.size / MAX_CONNECTIONS) * 100)
    },
    workers: {
      total: Object.keys(workers).length,
      online: Object.values(workers).filter(w => w.status === 'online').length,
      offline: Object.values(workers).filter(w => w.status === 'offline').length
    },
    token_usage: Object.values(tokenUsage).reduce((sum, w) => sum + (w.tokensUsed || 0), 0),
    memory: process.memoryUsage(),
    uptime: process.uptime()
  };
  res.json(metrics);
});

// 启动 HTTP 服务器
app.listen(port, () => {
  log('info', '🦞 AI Team Dashboard 安全版已启动', { port, ws_port: 8080 });
  log('info', '安全配置', {
    max_connections: MAX_CONNECTIONS,
    allowed_origins: ALLOWED_ORIGINS,
    log_level: LOG_LEVEL,
    rate_limit: `${MAX_MESSAGES_PER_MINUTE}/min`
  });
});

module.exports = { app, wss, workers, tokenUsage };
