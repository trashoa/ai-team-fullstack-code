// Todo List 应用主逻辑
class TodoApp {
    constructor() {
        this.todos = [];
        this.init();
    }

    init() {
        // 获取DOM元素
        this.inputElement = document.getElementById('todo-input');
        this.addButton = document.getElementById('add-btn');
        this.todoList = document.getElementById('todo-list');
        this.totalCount = document.getElementById('total-count');
        this.completedCount = document.getElementById('completed-count');
        this.emptyState = document.getElementById('empty-state');

        // 绑定事件监听器
        this.addButton.addEventListener('click', () => this.addTodo());
        this.inputElement.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addTodo();
            }
        });

        // 使用事件委托绑定删除和完成事件
        this.todoList.addEventListener('click', (e) => {
            const todoItem = e.target.closest('.todo-item');
            if (!todoItem) return;

            // 获取当前待办事项ID
            const id = parseInt(todoItem.dataset.id);

            // 处理复选框点击事件（标记完成/未完成）
            if (e.target.classList.contains('todo-checkbox')) {
                this.toggleComplete(id);
            } 
            // 处理删除按钮点击事件（实现删除功能）
            else if (e.target.classList.contains('delete-btn')) {
                this.deleteTodo(id);
            }
        });

        // 初始化时加载数据
        this.loadTodos();
        this.updateStats();
    }

    // 添加待办事项功能
    addTodo() {
        const text = this.inputElement.value.trim();
        if (text === '') return;

        // 防止XSS攻击，对输入进行转义
        const escapedText = this.escapeHtml(text);

        const newTodo = {
            id: Date.now(), // 使用时间戳作为唯一ID
            text: escapedText,
            completed: false,
            createdAt: new Date()
        };

        this.todos.push(newTodo);
        this.renderTodo(newTodo);
        this.inputElement.value = '';
        this.updateStats();
        this.saveTodos(); // 保存到本地存储
    }

    // 标记完成/未完成功能
    toggleComplete(id) {
        const todo = this.todos.find(item => item.id === id);
        if (todo) {
            todo.completed = !todo.completed;
            this.renderTodo(todo);
            this.updateStats();
            this.saveTodos(); // 保存到本地存储
        }
    }

    // 实现删除待办事项功能（这是第4项任务）
    deleteTodo(id) {
        // 从数组中移除指定ID的待办事项
        this.todos = this.todos.filter(item => item.id !== id);
        
        // 从DOM中移除对应的元素
        const todoElement = document.querySelector(`[data-id="${id}"]`);
        if (todoElement) {
            todoElement.remove();
        }
        
        // 更新统计信息
        this.updateStats();
        
        // 更新空状态显示
        this.checkEmptyState();
        
        // 保存到本地存储
        this.saveTodos();
    }

    // 渲染单个待办事项
    renderTodo(todo) {
        const todoElement = document.querySelector(`[data-id="${todo.id}"]`);
        
        if (todoElement) {
            // 如果元素已存在，则更新它
            todoElement.innerHTML = this.createTodoHtml(todo);
            if (todo.completed) {
                todoElement.classList.add('completed');
            } else {
                todoElement.classList.remove('completed');
            }
            // 更新文本内容以确保转义后的数据显示正确
            todoElement.querySelector('.todo-text').innerHTML = todo.text;
        } else {
            // 如果元素不存在，则创建新的
            const li = document.createElement('li');
            li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
            li.dataset.id = todo.id;
            li.innerHTML = this.createTodoHtml(todo);
            
            this.todoList.appendChild(li);
            this.checkEmptyState();
        }
    }

    // 创建待办事项HTML结构
    createTodoHtml(todo) {
        return `
            <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''}>
            <span class="todo-text">${todo.text}</span>
            <button class="delete-btn">删除</button>
        `;
    }

    // 更新统计数据
    updateStats() {
        const total = this.todos.length;
        const completed = this.todos.filter(item => item.completed).length;
        
        this.totalCount.textContent = `共 ${total} 项`;
        this.completedCount.textContent = `已完成 ${completed} 项`;
    }

    // 检查是否为空状态
    checkEmptyState() {
        if (this.todos.length === 0) {
            this.emptyState.classList.add('show');
        } else {
            this.emptyState.classList.remove('show');
        }
    }

    // 防止XSS攻击的HTML转义函数
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 保存到本地存储（第6项任务）
    saveTodos() {
        try {
            localStorage.setItem('todos', JSON.stringify(this.todos));
        } catch (error) {
            console.error('保存到本地存储失败:', error);
            alert('本地存储空间不足，请清理浏览器数据后再试');
        }
    }

    // 从本地存储加载数据（第6项任务）
    loadTodos() {
        try {
            const savedTodos = localStorage.getItem('todos');
            if (savedTodos) {
                this.todos = JSON.parse(savedTodos);
                this.todos.forEach(todo => {
                    this.renderTodo(todo);
                });
                this.checkEmptyState();
            } else {
                // 如果没有保存的数据，显示空状态
                this.checkEmptyState();
            }
        } catch (error) {
            console.error('从本地存储加载数据失败:', error);
            this.todos = []; // 重置为空数组以防出错
        }
    }
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new TodoApp();
});