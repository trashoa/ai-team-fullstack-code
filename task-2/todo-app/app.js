/**
 * Todo List 应用 - 核心功能
 * 包含：添加、删除、标记完成、过滤、localStorage、XSS防护
 */

// ===== 状态管理 =====
let todos = JSON.parse(localStorage.getItem('todos')) || [];
let currentFilter = 'all'; // all, active, completed

// ===== DOM 元素 =====
const todoInput = document.getElementById('todo-input');
const addBtn = document.getElementById('add-btn');
const todoList = document.getElementById('todo-list');
const emptyState = document.getElementById('empty-state');
const totalCount = document.getElementById('total-count');
const completedCount = document.getElementById('completed-count');

// ===== XSS 防护 =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== 存储 =====
function saveTodos() {
    localStorage.setItem('todos', JSON.stringify(todos));
}

// ===== 渲染 =====
function render() {
    // 过滤
    const filteredTodos = todos.filter(todo => {
        if (currentFilter === 'active') return !todo.completed;
        if (currentFilter === 'completed') return todo.completed;
        return true;
    });

    // 清空列表
    todoList.innerHTML = '';

    // 渲染
    filteredTodos.forEach((todo, index) => {
        const li = document.createElement('li');
        li.className = `todo-item${todo.completed ? ' completed' : ''}`;
        
        li.innerHTML = `
            <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''} data-index="${index}">
            <span class="todo-text">${escapeHtml(todo.text)}</span>
            <button class="delete-btn" data-index="${index}">删除</button>
        `;
        
        todoList.appendChild(li);
    });

    // 空状态
    emptyState.classList.toggle('show', filteredTodos.length === 0);

    // 统计
    const total = todos.length;
    const completed = todos.filter(t => t.completed).length;
    totalCount.textContent = `共 ${total} 项`;
    completedCount.textContent = `已完成 ${completed} 项`;
}

// ===== 添加 =====
function addTodo() {
    const text = todoInput.value.trim();
    if (!text) return;
    
    todos.push({
        text: text,
        completed: false,
        createdAt: Date.now()
    });
    
    todoInput.value = '';
    saveTodos();
    render();
}

// ===== 切换状态 =====
function toggleTodo(index) {
    todos[index].completed = !todos[index].completed;
    saveTodos();
    render();
}

// ===== 删除 =====
function deleteTodo(index) {
    todos.splice(index, 1);
    saveTodos();
    render();
}

// ===== 事件绑定 =====
addBtn.addEventListener('click', addTodo);

todoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTodo();
});

// 事件委托
todoList.addEventListener('click', (e) => {
    const index = parseInt(e.target.dataset.index);
    
    if (e.target.classList.contains('todo-checkbox')) {
        toggleTodo(index);
    } else if (e.target.classList.contains('delete-btn')) {
        deleteTodo(index);
    }
});

// ===== 初始化 =====
render();
