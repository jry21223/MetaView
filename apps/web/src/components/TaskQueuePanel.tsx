import { useEffect, useState } from "react";

export interface Process {
  process_id: string;
  prompt: string;
  states: Array<{
    stage: string;
    status: string;
    data: Record<string, any>;
    timestamp: string;
  }>;
  result?: Record<string, any>;
  error?: string;
  created_at: string;
  completed_at?: string;
}

export interface TaskQueueStats {
  queued: number;
  active: number;
  completed: number;
  failed: number;
  max_concurrent: number;
  max_queue_size: number;
}

interface TaskQueuePanelProps {
  apiBaseUrl: string;
}

export function TaskQueuePanel({ apiBaseUrl }: TaskQueuePanelProps) {
  const [stats, setStats] = useState<TaskQueueStats | null>(null);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 5000); // 每 5 秒刷新
    return () => clearInterval(interval);
  }, []);

  async function loadTasks() {
    try {
      const [statsRes, processesRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/v1/tasks`),
        fetch(`${apiBaseUrl}/api/v1/process?limit=50`),
      ]);
      
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      
      if (processesRes.ok) {
        const processesData = await processesRes.json();
        setProcesses(processesData);
      }
    } catch (error) {
      console.error("加载任务失败:", error);
    } finally {
      setLoading(false);
    }
  }

  async function replayProcess(processId: string) {
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/process/${processId}/replay`);
      if (res.ok) {
        const replay = await res.json();
        setSelectedProcess(replay);
      }
    } catch (error) {
      console.error("回放失败:", error);
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "completed":
      case "success":
        return "#0aff0a";
      case "failed":
      case "error":
        return "#ff0055";
      case "processing":
        return "#00f0ff";
      case "pending":
      case "queued":
        return "#f0ff0a";
      default:
        return "#a0aec0";
    }
  }

  return (
    <div style={{ padding: "20px" }}>
      <h2 style={{ color: "#00f0ff", marginBottom: "20px" }}>📋 任务队列 & 过程回放</h2>

      {/* 统计卡片 */}
      {stats && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "15px",
          marginBottom: "30px",
        }}>
          <StatCard label="队列中" value={stats.queued} color="#f0ff0a" />
          <StatCard label="执行中" value={stats.active} color="#00f0ff" />
          <StatCard label="已完成" value={stats.completed} color="#0aff0a" />
          <StatCard label="失败" value={stats.failed} color="#ff0055" />
        </div>
      )}

      {/* 过程列表 */}
      <div style={{
        background: "rgba(26, 32, 53, 0.8)",
        borderRadius: "12px",
        padding: "20px",
        border: "1px solid #2d3748",
      }}>
        <h3 style={{ color: "#ffffff", marginBottom: "15px" }}>过程历史</h3>
        
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#a0aec0" }}>
            加载中...
          </div>
        ) : processes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#a0aec0" }}>
            暂无过程记录
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {processes.map((process) => (
              <div
                key={process.process_id}
                style={{
                  background: "rgba(10, 14, 26, 0.8)",
                  borderRadius: "8px",
                  padding: "15px",
                  border: `1px solid ${getStatusColor(process.states[process.states.length - 1]?.status)}`,
                  cursor: "pointer",
                  transition: "all 0.3s",
                }}
                onClick={() => replayProcess(process.process_id)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <div style={{ color: "#ffffff", fontWeight: "bold" }}>
                    {process.prompt.slice(0, 80)}{process.prompt.length > 80 ? "..." : ""}
                  </div>
                  <div style={{
                    color: getStatusColor(process.states[process.states.length - 1]?.status),
                    padding: "4px 12px",
                    borderRadius: "12px",
                    background: "rgba(0, 0, 0, 0.3)",
                    fontSize: "12px",
                  }}>
                    {process.states[process.states.length - 1]?.status}
                  </div>
                </div>
                
                <div style={{ display: "flex", gap: "10px", fontSize: "12px", color: "#a0aec0" }}>
                  <span>ID: {process.process_id.slice(0, 8)}...</span>
                  <span>阶段：{process.states.length}</span>
                  <span>创建：{new Date(process.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 过程回放详情 */}
      {selectedProcess && (
        <div style={{
          marginTop: "30px",
          background: "rgba(26, 32, 53, 0.8)",
          borderRadius: "12px",
          padding: "20px",
          border: "1px solid #2d3748",
        }}>
          <h3 style={{ color: "#00f0ff", marginBottom: "15px" }}>
            🔍 过程回放：{selectedProcess.process_id.slice(0, 8)}...
          </h3>
          
          <div style={{ marginBottom: "20px", color: "#ffffff" }}>
            <strong>提示词:</strong> {selectedProcess.prompt}
          </div>
          
          <div style={{ marginBottom: "20px" }}>
            <strong style={{ color: "#00f0ff" }}>执行阶段:</strong>
            <div style={{
              marginTop: "10px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}>
              {selectedProcess.stages.map((stage, index) => (
                <div
                  key={index}
                  style={{
                    background: "rgba(10, 14, 26, 0.8)",
                    borderRadius: "6px",
                    padding: "12px",
                    borderLeft: `3px solid ${getStatusColor(stage.status)}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                    <span style={{ color: "#00f0ff", fontWeight: "bold" }}>{stage.stage}</span>
                    <span style={{ color: getStatusColor(stage.status) }}>{stage.status}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#a0aec0" }}>
                    {new Date(stage.timestamp).toLocaleString()}
                  </div>
                  {stage.data && Object.keys(stage.data).length > 0 && (
                    <pre style={{
                      marginTop: "8px",
                      background: "rgba(0, 0, 0, 0.3)",
                      padding: "10px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      color: "#0aff0a",
                      overflow: "auto",
                    }}>
                      {JSON.stringify(stage.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {selectedProcess.result && (
            <div style={{
              background: "rgba(10, 234, 10, 0.1)",
              borderRadius: "6px",
              padding: "15px",
              border: "1px solid #0aff0a",
            }}>
              <strong style={{ color: "#0aff0a" }}>✅ 结果:</strong>
              <pre style={{
                marginTop: "8px",
                fontSize: "12px",
                color: "#0aff0a",
                overflow: "auto",
              }}>
                {JSON.stringify(selectedProcess.result, null, 2)}
              </pre>
            </div>
          )}
          
          {selectedProcess.error && (
            <div style={{
              marginTop: "15px",
              background: "rgba(255, 0, 85, 0.1)",
              borderRadius: "6px",
              padding: "15px",
              border: "1px solid #ff0055",
            }}>
              <strong style={{ color: "#ff0055" }}>❌ 错误:</strong>
              <div style={{ marginTop: "8px", color: "#ff0055", fontSize: "13px" }}>
                {selectedProcess.error}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: "rgba(26, 32, 53, 0.8)",
      borderRadius: "12px",
      padding: "20px",
      textAlign: "center",
      border: "1px solid #2d3748",
    }}>
      <div style={{ fontSize: "32px", fontWeight: "bold", color, marginBottom: "5px" }}>
        {value}
      </div>
      <div style={{ fontSize: "14px", color: "#a0aec0", textTransform: "uppercase" }}>
        {label}
      </div>
    </div>
  );
}
