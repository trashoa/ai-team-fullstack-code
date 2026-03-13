#!/usr/bin/env python3
"""
Python 问候脚本

这是一个简单的 Python 脚本，用于输出问候信息。
它被设计为测试飞书通知功能的一部分。
"""

import datetime
import sys


def greet():
    """
    输出问候信息
    """
    current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    greeting_message = f"Hello! 当前时间是: {current_time}"
    print(greeting_message)
    
    # 额外的问候变化，增加趣味性
    greetings = [
        "欢迎使用我们的系统！",
        "祝您有美好的一天！",
        "感谢您的使用！",
        "希望一切顺利！"
    ]
    
    # 随机选择一个问候语（不使用随机模块以保持简单）
    index = hash(current_time) % len(greetings)
    additional_greeting = greetings[index]
    print(f"额外问候: {additional_greeting}")
    
    return greeting_message


def main():
    """
    主函数
    """
    print("=" * 50)
    print("🧪 飞书通知验证 - Python 问候脚本")
    print("这个脚本被用来验证 Worker 完成后能否正确推送通知到飞书群")
    print("=" * 50)
    
    # 执行问候功能
    result = greet()
    
    print("=" * 50)
    print("✅ 脚本执行完毕")
    print("=" * 50)
    
    # 返回成功状态
    return 0


if __name__ == "__main__":
    sys.exit(main())