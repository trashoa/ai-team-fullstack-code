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

// ===== 根据ID找索引 =====
function findIndexById(id) {
    return todos.findIndex(t => t.id === id);
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

    // 渲染 - 使用 id 而非索引
    filteredTodos.forEach((todo) => {
        const li = document.createElement('li');
        li.className = `todo-item${todo.completed ? ' completed' : ''}`;
        
        li.innerHTML = `
            <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''} data-id="${todo.id}">
            <span class="todo-text">${escapeHtml(todo.text)}</span>
            <button class="delete-btn" data-id="${todo.id}">删除</button>
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
        id: Date.now(), // 唯一ID
        text: text,
        completed: false,
        createdAt: Date.now()
    });
    
    todoInput.value = '';
    saveTodos();
    render();
}

// ===== 切换状态 =====
function toggleTodo(id) {
    const index = findIndexById(id);
    if (index === -1) return;
    todos[index].completed = !todos[index].completed;
    saveTodos();
    render();
}

// ===== 删除 =====
function deleteTodo(id) {
    const index = findIndexById(id);
    if (index === -1) return;
    todos.splice(index, 1);
    saveTodos();
    render();
}

// ===== 事件绑定 =====
addBtn.addEventListener('click', addTodo);

todoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTodo();
});

// 事件委托 - 使用 id
todoList.addEventListener('click', (e) => {
    const id = parseInt(e.target.dataset.id);
    if (!id) return;
    
    if (e.target.classList.contains('todo-checkbox')) {
        toggleTodo(id);
    } else if (e.target.classList.contains('delete-btn')) {
        deleteTodo(id);
    }
});

// ===== 初始化 =====
render();
