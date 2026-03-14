// 这是一个故意有安全问题的文件，用于测试审查失败告警

// ❌ 硬编码密码
const API_KEY = "sk-1234567890abcdef";

// ❌ SQL 注入漏洞
function queryUser(userId) {
  return "SELECT * FROM users WHERE id = " + userId;
}

// ❌ 未验证的用户输入
function processPayment(userInput) {
  eval(userInput);  // 危险！
}

// ❌ 泄露敏感信息
function logError(err) {
  console.log("Password: " + password);
  console.log("Token: " + token);
}

// ❌ 不安全的随机数
function generateId() {
  return Math.random();
}

module.exports = { queryUser, processPayment, logError, generateId };
