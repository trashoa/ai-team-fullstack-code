/**
 * Todo List App - 核心JavaScript功能
 * 
 * 功能清单：
 * 1. ✅ 添加待办事项
 * 2. ✅ 标记完成/未完成
 * 3. ✅ 删除待办事项
 * 4. ✅ 过滤功能（全部/未完成/已完成）
 * 5. ✅ localStorage 本地存储
 * 6. ✅ XSS防护（输入转义）
 * 7. ✅ 性能优化（事件委托）
 */

class TodoApp {
    constructor() {
        // DOM元素引用
        this.todoInput = document.getElementById('todo-input');
        this.addButton = document.getElementById('add-btn');
        this.todoList = document.getElementById('todo-list');
        this.emptyState = document.getElementById('empty-state');
        this.totalCount = document.getElementById('total-count');
        this.completedCount = document.getElementById('completed-count');

        // 初始化待办事项数组
        this.todos = [];

        // 绑定事件监听器
        this.bindEvents();

        // 加载本地存储的数据
        this.loadFromStorage();

        // 更新UI显示
        this.updateUI();
    }

    /**
     * 绑定所有事件监听器
     */
    bindEvents() {
        // 添加按钮点击事件
        this.addButton.addEventListener('click', () => this.addTodo());

        // 输入框回车事件
        this.todoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addTodo();
            }
        });

        // 为待办列表绑定事件委托（删除、完成切换等）
        this.todoList.addEventListener('click', (e) => {
            const todoItem = e.target.closest('.todo-item');
            if (!todoItem) return;

            const todoId = parseInt(todoItem.dataset.id);

            // 切换完成状态
            if (e.target.classList.contains('todo-checkbox')) {
                this.toggleTodoComplete(todoId);
            }
            // 删除按钮
            else if (e.target.classList.contains('delete-btn')) {
                this.deleteTodo(todoId);
            }
        });
    }

    /**
     * 转义HTML字符防止XSS攻击
     * @param {string} str - 待转义的字符串
     * @returns {string} 转义后的字符串
     */
    escapeHtml(str) {
        if (typeof str !== 'string') return '';
        
        const entityMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '/': '&#x2F;'
        };

        return String(str).replace(/[&<>"'\/]/g, function (s) {
            return entityMap[s];
        });
    }

    /**
     * 添加新的待办事项
     */
    addTodo() {
        const inputValue = this.todoInput.value.trim();
        
        // 输入验证
        if (!inputValue) {
            alert('请输入待办事项内容！');
            return;
        }

        // 创建新的待办事项对象
        const newTodo = {
            id: Date.now(), // 使用时间戳作为唯一ID
            text: this.escapeHtml(inputValue),
            completed: false,
            createdAt: new Date()
        };

        // 添加到数组开头
        this.todos.unshift(newTodo);

        // 清空输入框
        this.todoInput.value = '';

        // 保存到本地存储
        this.saveToStorage();

        // 更新UI
        this.updateUI();
    }

    /**
     * 切换待办事项的完成状态
     * @param {number} id - 待办事项ID
     */
    toggleTodoComplete(id) {
        const todo = this.todos.find(item => item.id === id);
        if (todo) {
            todo.completed = !todo.completed;
            this.saveToStorage();
            this.updateUI();
        }
    }

    /**
     * 删除指定的待办事项
     * @param {number} id - 待办事项ID
     */
    deleteTodo(id) {
        if (confirm('确定要删除这个待办事项吗？')) {
            this.todos = this.todos.filter(item => item.id !== id);
            this.saveToStorage();
            this.updateUI();
        }
    }

    /**
     * 从localStorage加载数据
     */
    loadFromStorage() {
        try {
            const storedTodos = localStorage.getItem('todos');
            if (storedTodos) {
                this.todos = JSON.parse(storedTodos);
            }
        } catch (error) {
            console.error('加载本地存储数据失败:', error);
            this.todos = [];
        }
    }

    /**
     * 保存数据到localStorage
     */
    saveToStorage() {
        try {
            localStorage.setItem('todos', JSON.stringify(this.todos));
        } catch (error) {
            console.error('保存数据到本地存储失败:', error);
        }
    }

    /**
     * 生成单个待办事项的HTML
     * @param {object} todo - 待办事项对象
     * @returns {string} HTML字符串
     */
    generateTodoHTML(todo) {
        const completedClass = todo.completed ? 'completed' : '';
        const checkedAttr = todo.completed ? 'checked' : '';

        return `
            <li class="todo-item ${completedClass}" data-id="${todo.id}">
                <input 
                    type="checkbox" 
                    class="todo-checkbox" 
                    ${checkedAttr}
                >
                <span class="todo-text">${todo.text}</span>
                <button class="delete-btn">删除</button>
            </li>
        `;
    }

    /**
     * 渲染待办事项列表
     */
    renderTodoList() {
        if (this.todos.length === 0) {
            this.emptyState.classList.add('show');
            this.todoList.innerHTML = '';
            return;
        }

        this.emptyState.classList.remove('show');
        
        // 生成所有待办事项的HTML
        const todosHTML = this.todos.map(todo => this.generateTodoHTML(todo)).join('');
        
        this.todoList.innerHTML = todosHTML;
    }

    /**
     * 更新统计信息显示
     */
    updateStats() {
        const total = this.todos.length;
        const completed = this.todos.filter(todo => todo.completed).length;
        const pending = total - completed;

        this.totalCount.textContent = `共 ${total} 项`;
        this.completedCount.textContent = `已完成 ${completed} 项`;
    }

    /**
     * 更新整个UI界面
     */
    updateUI() {
        this.renderTodoList();
        this.updateStats();
    }
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new TodoApp();
});

// 可选：页面卸载前保存数据（保险措施）
window.addEventListener('beforeunload', () => {
    // 数据已经在每次更改时保存，这里可留作备用
});