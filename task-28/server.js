// 任务进度监控服务器 + PR 审查列表
const express = require('express');
const path = require('path');
const app = express();
const port = 3000;
const WebSocket = require('ws');
const https = require('https');
const http = require('http');

// 环境变量配置
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'trashoa';
const GITHUB_REPO = process.env.GITHUB_REPO || 'ai-team-tasks';
const PR_REVIEW_WEBHOOK = process.env.PR_REVIEW_WEBHOOK || 'http://47.98.233.32:3000/webhook';

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ port: 8080 });

// 存储工作者状态的对象
const workers = {};

// 存储当前处理的任务信息
const currentTasks = {};

// 存储工作者的Token消耗统计
const tokenUsage = {};

// PR 审查列表缓存
let prReviewsCache = {
  data: [],
  lastUpdate: 0,
  ttl: 30000 // 30秒缓存
};

// GitHub API 请求封装
function githubRequest(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// 获取 PR 审查列表
async function fetchPRReviews() {
  const now = Date.now();
  
  // 检查缓存
  if (prReviewsCache.data.length > 0 && 
      now - prReviewsCache.lastUpdate < prReviewsCache.ttl) {
    return prReviewsCache.data;
  }
  
  try {
    // 获取已关闭的 PR（包含审查结果）
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls?state=all&per_page=20`,
      method: 'GET',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'AI-Team-Dashboard'
      }
    };
    
    const data = await githubRequest(options);
    
    // 转换为审查列表格式
    const reviews = data.map(pr => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      state: pr.state, // open, closed
      merged: pr.merged,
      user: pr.user.login,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      url: pr.html_url,
      reviews: [] // 后续可以从审查 API 获取
    }));
    
    // 更新缓存
    prReviewsCache = {
      data: reviews,
      lastUpdate: now,
      ttl: 30000
    };
    
    return reviews;
  } catch (error) {
    console.error('获取 PR 审查列表失败:', error.message);
    return prReviewsCache.data;
  }
}

// WebSocket 连接处理
wss.on('connection', (ws, req) => {
  console.log('新的 WebSocket 连接建立');
  
  // Token 验证
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  const expectedToken = process.env.WS_SECRET || 'default-secret';
  
  if (token !== expectedToken) {
    console.log('WebSocket 认证失败');
    ws.close(4001, 'Unauthorized');
    return;
  }
  
  // 发送当前所有工作者状态给新连接的客户端
  ws.send(JSON.stringify({
    type: 'workers_status',
    data: Object.values(workers)
  }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'heartbeat') {
        const workerId = data.workerId;
        const timestamp = Date.now();
        
        workers[workerId] = {
          id: workerId,
          name: data.name || workerId,
          lastHeartbeat: timestamp,
          status: 'online',
          ip: data.ip || 'unknown',
          timestamp: timestamp
        };
        
        console.log(`收到 ${workerId} 的心跳`);
        broadcastWorkersStatus();
      } else if (data.type === 'token_usage') {
        const workerId = data.workerId;
        const tokensUsed = data.tokensUsed || 0;
        
        tokenUsage[workerId] = {
          workerId: workerId,
          tokensUsed: tokensUsed,
          timestamp: Date.now()
        };
        
        broadcastTokenUsage();
      }
    } catch (error) {
      console.error('解析消息时出错:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket 连接关闭');
  });
});

// 定期清理不活跃的工作者
setInterval(() => {
  const now = Date.now();
  const timeoutThreshold = 30000;
  
  for (const workerId in workers) {
    if (now - workers[workerId].lastHeartbeat > timeoutThreshold) {
      workers[workerId].status = 'offline';
    }
  }
  
  broadcastWorkersStatus();
}, 10000);

function broadcastWorkersStatus() {
  const message = JSON.stringify({
    type: 'workers_status',
    data: Object.values(workers)
  });
  
  wss.clients.forEach((client) => {
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
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// 中间件
app.use(express.json());
app.use(express.static('.'));

// 模拟任务数据
let tasks = [
  { id: 1, title: '实现用户认证功能', status: 'in-progress', assignedTo: '张三', createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  { id: 2, title: '设计数据库架构', status: 'completed', assignedTo: '李四', createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() },
  { id: 3, title: '编写API文档', status: 'pending', assignedTo: '王五', createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() }
];

// API路由

// 获取所有任务
app.get('/api/tasks', (req, res) => {
  res.json(tasks);
});

// 获取特定任务详情
app.get('/api/tasks/:id', (req, res) => {
  const taskId = parseInt(req.params.id);
  const task = tasks.find(t => t.id === taskId);
  
  if (!task) {
    return res.status(404).json({ error: '任务未找到' });
  }
  
  res.json(task);
});

// 获取 PR 审查列表
app.get('/api/pr-reviews', async (req, res) => {
  try {
    const reviews = await fetchPRReviews();
    res.json({
      success: true,
      data: reviews,
      cached: Date.now() - prReviewsCache.lastUpdate < prReviewsCache.ttl,
      lastUpdate: new Date(prReviewsCache.lastUpdate).toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 触发 PR 审查
app.post('/api/pr-reviews/trigger', async (req, res) => {
  const { owner, repo, prNumber } = req.body;
  
  try {
    const webhookUrl = `${PR_REVIEW_WEBHOOK}?owner=${owner || GITHUB_OWNER}&repo=${repo || GITHUB_REPO}&pr=${prNumber}`;
    
    // 这里可以添加触发大黑手审查的逻辑
    res.json({
      success: true,
      message: 'PR 审查已触发',
      webhook: webhookUrl
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 健康检查
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 主页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'monitor.html'));
});

// 启动服务器
app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
  console.log(`PR 审查列表: http://localhost:${port}/api/pr-reviews`);
});
