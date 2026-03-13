// 任务进度监控服务器
const express = require('express');
const path = require('path');
const app = express();
const port = 3000;
const WebSocket = require('ws');

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ port: 8080 });

// 存储工作者状态的对象
const workers = {};

// 存储当前处理的任务信息
const currentTasks = {};

// WebSocket 连接处理
wss.on('connection', (ws) => {
  console.log('新的 WebSocket 连接建立');

  // 发送当前所有工作者状态给新连接的客户端
  ws.send(JSON.stringify({
    type: 'workers_status',
    data: Object.values(workers)
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'heartbeat') {
        // 处理工作者心跳上报
        const workerId = data.workerId;
        const timestamp = Date.now();
        
        // 更新或创建工作者信息
        workers[workerId] = {
          id: workerId,
          name: data.name || workerId,
          lastHeartbeat: timestamp,
          status: 'online',
          ip: data.ip || 'unknown',
          timestamp: timestamp
        };
        
        console.log(`收到 ${workerId} 的心跳，时间: ${new Date(timestamp).toLocaleString()}`);
        
        // 广播给所有客户端工作者状态变化
        broadcastWorkersStatus();
      }
    } catch (error) {
      console.error('解析消息时出错:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket 连接关闭');
  });

  ws.on('error', (error) => {
    console.error('WebSocket 错误:', error);
  });
});

// 定期清理不活跃的工作者（30秒没心跳视为离线）
setInterval(() => {
  const now = Date.now();
  const timeoutThreshold = 30000; // 30秒
  
  let updated = false;
  for (const workerId in workers) {
    if (now - workers[workerId].lastHeartbeat > timeoutThreshold) {
      console.log(`${workers[workerId].name} 超时，标记为离线`);
      workers[workerId].status = 'offline';
    }
  }
  
  if (updated) {
    broadcastWorkersStatus();
  }
}, 10000); // 每10秒检查一次

// 广播工作者状态给所有连接的客户端
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

// 中间件
app.use(express.json());
app.use(express.static('.')); // 提供静态文件服务

// 模拟任务数据
let tasks = [
  {
    id: 1,
    title: '实现用户认证功能',
    status: 'in-progress',
    assignedTo: '张三',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    startTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    estimatedCompletionTime: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(),
    description: '开发用户登录、注册和权限验证功能'
  },
  {
    id: 2,
    title: '设计数据库架构',
    status: 'completed',
    assignedTo: '李四',
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    startTime: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    estimatedCompletionTime: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    description: '设计用户表、产品表和订单表的结构'
  },
  {
    id: 3,
    title: '编写API文档',
    status: 'pending',
    assignedTo: '王五',
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    estimatedCompletionTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    description: '为所有API端点编写详细的文档'
  },
  {
    id: 4,
    title: '修复登录页面bug',
    status: 'in-progress',
    assignedTo: '赵六',
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    startTime: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    estimatedCompletionTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    description: '解决登录页面密码验证失败的问题'
  },
  {
    id: 5,
    title: '性能优化',
    status: 'pending',
    assignedTo: '钱七',
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    estimatedCompletionTime: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    description: '优化数据库查询和前端响应速度'
  }
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

// 模拟任务状态更新的端点（用于演示目的）
app.post('/api/tasks/:id/status', (req, res) => {
  const taskId = parseInt(req.params.id);
  const { status } = req.body;
  
  const task = tasks.find(t => t.id === taskId);
  if (!task) {
    return res.status(404).json({ error: '任务未找到' });
  }
  
  task.status = status;
  if (status === 'in-progress' && !task.startTime) {
    task.startTime = new Date().toISOString();
  } else if (status === 'completed' && !task.completedAt) {
    task.completedAt = new Date().toISOString();
  }
  
  res.json(task);
});

// 主页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'monitor.html'));
});

// 启动服务器
app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
});