"""
过程注册表服务
管理动画生成过程的状态和记忆

类比 ManimCat 的 process-memory-registry
"""

import json
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional
import uuid


@dataclass
class ProcessState:
    """过程状态"""
    process_id: str
    stage: str  # concept_design, code_generation, execution
    status: str  # pending, running, completed, failed
    data: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    metadata: dict = field(default_factory=dict)
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "process_id": self.process_id,
            "stage": self.stage,
            "status": self.status,
            "data": self.data,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "metadata": self.metadata
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "ProcessState":
        """从字典创建"""
        return cls(
            process_id=data["process_id"],
            stage=data["stage"],
            status=data["status"],
            data=data.get("data", {}),
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
            metadata=data.get("metadata", {})
        )


@dataclass
class ProcessMemory:
    """过程记忆"""
    process_id: str
    prompt: str
    states: list[ProcessState] = field(default_factory=list)
    result: Optional[dict] = None
    error: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    
    def add_state(self, stage: str, status: str, data: dict = None):
        """添加状态"""
        state = ProcessState(
            process_id=self.process_id,
            stage=stage,
            status=status,
            data=data or {}
        )
        self.states.append(state)
        self.updated_at = datetime.now()
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "process_id": self.process_id,
            "prompt": self.prompt,
            "states": [s.to_dict() for s in self.states],
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None
        }


class ProcessRegistry:
    """
    过程注册表
    
    职责:
    1. 跟踪任务执行过程
    2. 持久化状态历史
    3. 支持断点续传
    4. 提供过程回放
    """
    
    def __init__(self, storage_path: Optional[str] = None):
        self.storage_path = Path(storage_path) if storage_path else None
        self._processes: dict[str, ProcessMemory] = {}
        
        if self.storage_path:
            self.storage_path.mkdir(parents=True, exist_ok=True)
            self._load_from_storage()
    
    def create_process(self, prompt: str) -> ProcessMemory:
        """
        创建新过程
        
        Args:
            prompt: 任务提示
        
        Returns:
            ProcessMemory: 过程记忆对象
        """
        process = ProcessMemory(
            process_id=str(uuid.uuid4()),
            prompt=prompt
        )
        
        # 记录初始状态
        process.add_state("init", "created", {"prompt": prompt})
        
        self._processes[process.process_id] = process
        self._save_process(process)
        
        return process
    
    def get_process(self, process_id: str) -> Optional[ProcessMemory]:
        """获取过程"""
        return self._processes.get(process_id)
    
    def update_process(self, process: ProcessMemory, stage: str, 
                       status: str, data: dict = None):
        """
        更新过程状态
        
        Args:
            process: 过程记忆对象
            stage: 阶段
            status: 状态
            data: 数据
        """
        process.add_state(stage, status, data)
        self._save_process(process)
    
    def complete_process(self, process: ProcessMemory, result: dict):
        """完成过程"""
        process.result = result
        process.completed_at = datetime.now()
        process.add_state("completed", "success", result)
        self._save_process(process)
    
    def fail_process(self, process: ProcessMemory, error: str):
        """失败过程"""
        process.error = error
        process.completed_at = datetime.now()
        process.add_state("failed", "error", {"error": error})
        self._save_process(process)
    
    def list_processes(self, limit: int = 50, 
                       status: Optional[str] = None) -> list[ProcessMemory]:
        """列出过程"""
        processes = list(self._processes.values())
        
        # 按时间排序
        processes.sort(key=lambda p: p.created_at, reverse=True)
        
        # 过滤状态
        if status:
            processes = [p for p in processes if p.states and p.states[-1].status == status]
        
        return processes[:limit]
    
    def get_process_history(self, process_id: str) -> Optional[dict]:
        """获取过程历史"""
        process = self.get_process(process_id)
        if not process:
            return None
        return process.to_dict()
    
    def replay_process(self, process_id: str) -> Optional[dict]:
        """回放过程"""
        process = self.get_process(process_id)
        if not process:
            return None
        
        # 构建回放数据
        replay = {
            "process_id": process_id,
            "prompt": process.prompt,
            "stages": []
        }
        
        for state in process.states:
            replay["stages"].append({
                "stage": state.stage,
                "status": state.status,
                "data": state.data,
                "timestamp": state.updated_at.isoformat()
            })
        
        if process.result:
            replay["result"] = process.result
        
        if process.error:
            replay["error"] = process.error
        
        return replay
    
    def _save_process(self, process: ProcessMemory):
        """保存过程"""
        if not self.storage_path:
            return
        
        file_path = self.storage_path / f"{process.process_id}.json"
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(process.to_dict(), f, indent=2, ensure_ascii=False)
    
    def _load_from_storage(self):
        """从存储加载"""
        if not self.storage_path or not self.storage_path.exists():
            return
        
        for file_path in self.storage_path.glob("*.json"):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    process = ProcessMemory.from_dict(data)
                    self._processes[process.process_id] = process
            except Exception:
                pass
    
    def cleanup(self, older_than_days: int = 7):
        """清理旧过程"""
        from datetime import timedelta
        
        cutoff = datetime.now() - timedelta(days=older_than_days)
        
        to_remove = [
            process_id for process_id, process in self._processes.items()
            if process.completed_at and process.completed_at < cutoff
        ]
        
        for process_id in to_remove:
            del self._processes[process_id]
            
            # 删除文件
            if self.storage_path:
                file_path = self.storage_path / f"{process_id}.json"
                if file_path.exists():
                    file_path.unlink()
