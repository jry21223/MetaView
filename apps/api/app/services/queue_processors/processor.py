"""
队列处理器服务
管理动画生成任务的队列处理

类比 ManimCat 的 video-processor
"""

import asyncio
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Callable, Any
from datetime import datetime
import uuid


class TaskStatus(str, Enum):
    """任务状态"""
    PENDING = "pending"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class QueueTask:
    """队列任务"""
    task_id: str
    prompt: str
    status: TaskStatus = TaskStatus.PENDING
    priority: int = 0
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    result: Optional[Any] = None
    error: Optional[str] = None
    metadata: dict = field(default_factory=dict)
    
    def __post_init__(self):
        if not self.task_id:
            self.task_id = str(uuid.uuid4())


@dataclass
class ProcessorConfig:
    """处理器配置"""
    max_concurrent_tasks: int = 3
    max_queue_size: int = 100
    task_timeout_seconds: int = 300
    retry_attempts: int = 2
    enable_priority_queue: bool = True


class QueueProcessor:
    """
    队列处理器
    
    职责:
    1. 管理任务队列
    2. 控制并发执行
    3. 任务状态跟踪
    4. 错误处理与重试
    """
    
    def __init__(self, config: Optional[ProcessorConfig] = None):
        self.config = config or ProcessorConfig()
        self._queue: list[QueueTask] = []
        self._active_tasks: dict[str, QueueTask] = {}
        self._completed_tasks: dict[str, QueueTask] = {}
        self._lock = asyncio.Lock()
        self._running = False
    
    async def submit(self, prompt: str, priority: int = 0, 
                     metadata: Optional[dict] = None) -> QueueTask:
        """
        提交任务到队列
        
        Args:
            prompt: 任务提示
            priority: 优先级 (数字越大优先级越高)
            metadata: 元数据
        
        Returns:
            QueueTask: 任务对象
        """
        task = QueueTask(
            task_id=str(uuid.uuid4()),
            prompt=prompt,
            priority=priority,
            metadata=metadata or {}
        )
        
        async with self._lock:
            if len(self._queue) >= self.config.max_queue_size:
                task.status = TaskStatus.FAILED
                task.error = "队列已满"
                return task
            
            task.status = TaskStatus.QUEUED
            self._queue.append(task)
            
            # 按优先级排序
            if self.config.enable_priority_queue:
                self._queue.sort(key=lambda t: t.priority, reverse=True)
        
        return task
    
    async def process_next(self, handler: Callable) -> Optional[QueueTask]:
        """
        处理下一个任务
        
        Args:
            handler: 任务处理函数
        
        Returns:
            QueueTask: 处理完成的任务
        """
        async with self._lock:
            if not self._queue:
                return None
            
            if len(self._active_tasks) >= self.config.max_concurrent_tasks:
                return None
            
            task = self._queue.pop(0)
            task.status = TaskStatus.PROCESSING
            task.started_at = datetime.now()
            self._active_tasks[task.task_id] = task
        
        try:
            # 执行任务
            result = await asyncio.wait_for(
                handler(task.prompt, task.metadata),
                timeout=self.config.task_timeout_seconds
            )
            
            task.status = TaskStatus.COMPLETED
            task.result = result
            task.completed_at = datetime.now()
            
        except asyncio.TimeoutError:
            task.status = TaskStatus.FAILED
            task.error = "任务超时"
        
        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = str(e)
        
        finally:
            async with self._lock:
                if task.task_id in self._active_tasks:
                    del self._active_tasks[task.task_id]
                self._completed_tasks[task.task_id] = task
        
        return task
    
    async def run(self, handler: Callable):
        """
        运行处理器
        
        Args:
            handler: 任务处理函数
        """
        self._running = True
        
        while self._running:
            try:
                await self.process_next(handler)
            except Exception:
                pass
            
            await asyncio.sleep(0.1)  # 避免空转
    
    def stop(self):
        """停止处理器"""
        self._running = False
    
    def get_task(self, task_id: str) -> Optional[QueueTask]:
        """获取任务状态"""
        # 在活跃任务中查找
        if task_id in self._active_tasks:
            return self._active_tasks[task_id]
        
        # 在已完成任务中查找
        if task_id in self._completed_tasks:
            return self._completed_tasks[task_id]
        
        # 在队列中查找
        for task in self._queue:
            if task.task_id == task_id:
                return task
        
        return None
    
    def get_queue_stats(self) -> dict:
        """获取队列统计"""
        return {
            "queued": len(self._queue),
            "active": len(self._active_tasks),
            "completed": len([t for t in self._completed_tasks.values() 
                            if t.status == TaskStatus.COMPLETED]),
            "failed": len([t for t in self._completed_tasks.values() 
                          if t.status == TaskStatus.FAILED]),
            "max_concurrent": self.config.max_concurrent_tasks,
            "max_queue_size": self.config.max_queue_size
        }
    
    def cancel_task(self, task_id: str) -> bool:
        """取消任务"""
        for i, task in enumerate(self._queue):
            if task.task_id == task_id:
                task.status = TaskStatus.CANCELLED
                self._queue.pop(i)
                return True
        
        if task_id in self._active_tasks:
            self._active_tasks[task_id].status = TaskStatus.CANCELLED
            return True
        
        return False
    
    def clear_completed(self, older_than_seconds: int = 3600):
        """清理已完成的任务"""
        cutoff = datetime.now().timestamp() - older_than_seconds
        
        to_remove = [
            task_id for task_id, task in self._completed_tasks.items()
            if task.completed_at and task.completed_at.timestamp() < cutoff
        ]
        
        for task_id in to_remove:
            del self._completed_tasks[task_id]
