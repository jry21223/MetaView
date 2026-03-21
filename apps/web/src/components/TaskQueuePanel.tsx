import { useEffect, useState } from "react";

export interface Process {
  process_id: string;
  request_id?: string;
  prompt: string;
  title?: string;
  domain?: string;
  states?: Array<{
    stage: string;
    status: string;
    data: Record<string, any>;
    timestamp: string;
  }>;
  result?: Record<string, any>;
  error?: string;
  created_at: string;
  completed_at?: string;
  provider?: string;
  sandbox_status?: string;
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
      const [statsRes, runsRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/v1/tasks`),
        fetch(`${apiBaseUrl}/api/v1/runs`),
      ]);
      
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      
      if (runsRes.ok) {
        const runsData = await runsRes.json();
        // 将 runs 数据转换为 Process 格式
        const processesData: Process[] = runsData.map((run: Record<string, unknown>) => ({
          process_id: String(run.request_id ?? ''),
          request_id: String(run.request_id ?? ''),
          prompt: String(run.prompt ?? ''),
          title: run.title as string | undefined,
          domain: run.domain as string | undefined,
          created_at: String(run.created_at ?? ''),
          provider: run.provider as string | undefined,
          sandbox_status: run.sandbox_status as string | undefined,
          states: run.sandbox_status === 'passed' 
            ? [{ stage: 'completed', status: 'completed', data: {}, timestamp: String(run.created_at ?? '') }]
            : [{ stage: 'failed', status: 'failed', data: {}, timestamp: String(run.created_at ?? '') }]
        }));
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
      // 优先尝试 process replay 接口
      let res = await fetch(`${apiBaseUrl}/api/v1/process/${processId}/replay`);
      if (res.ok) {
        const replay = await res.json();
        setSelectedProcess(replay);
        return;
      }
      
      // 如果 process 不存在，尝试获取 run detail
      res = await fetch(`${apiBaseUrl}/api/v1/runs/${processId}`);
      if (res.ok) {
        const runDetail = await res.json();
        // 转换为 Process 格式
        const process: Process = {
          process_id: runDetail.request_id,
          request_id: runDetail.request_id,
          prompt: runDetail.request.prompt,
          title: runDetail.response?.cir?.title,
          domain: runDetail.response?.cir?.domain,
          created_at: runDetail.created_at,
          provider: runDetail.request.provider,
          sandbox_status: runDetail.request.sandbox_mode,
          states: [{
            stage: 'completed',
            status: runDetail.response?.runtime?.sandbox?.status || 'completed',
            data: {
              cir: runDetail.response?.cir,
              runtime: runDetail.response?.runtime
            },
            timestamp: runDetail.created_at
          }],
          result: runDetail.response,
          completed_at: runDetail.created_at
        };
        setSelectedProcess(process);
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
                  border: `1px solid ${getStatusColor(process.states?.[0]?.status || process.sandbox_status || 'completed')}`,
                  cursor: "pointer",
                  transition: "all 0.3s",
                }}
                onClick={() => replayProcess(process.process_id)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <div style={{ color: "#ffffff", fontWeight: "bold" }}>
                    {process.title || process.prompt.slice(0, 80)}{process.prompt.length > 80 ? "..." : ""}
                  </div>
                  <div style={{
                    color: getStatusColor(process.states?.[0]?.status || process.sandbox_status || 'completed'),
                    padding: "4px 12px",
                    borderRadius: "12px",
                    background: "rgba(0, 0, 0, 0.3)",
                    fontSize: "12px",
                  }}>
                    {process.domain || 'algorithm'}
                  </div>
                </div>
                
                <div style={{ display: "flex", gap: "10px", fontSize: "12px", color: "#a0aec0" }}>
                  <span>ID: {process.process_id.slice(0, 8)}...</span>
                  <span>{process.sandbox_status || 'completed'}</span>
                  <span>{new Date(process.created_at).toLocaleString()}</span>
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
          
          {selectedProcess.states && selectedProcess.states.length > 0 && (
            <div style={{ marginBottom: "20px" }}>
              <strong style={{ color: "#00f0ff" }}>执行阶段:</strong>
              <div style={{
                marginTop: "10px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}>
                {selectedProcess.states.map((stage: { stage?: string; status?: string; timestamp?: string; data?: Record<string, unknown> }, index: number) => (
                <div
                  key={index}
                  style={{
                    background: "rgba(10, 14, 26, 0.8)",
                    borderRadius: "6px",
                    padding: "12px",
                    borderLeft: `3px solid ${getStatusColor(stage.status ?? '')}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                    <span style={{ color: "#00f0ff", fontWeight: "bold" }}>{stage.stage}</span>
                    <span style={{ color: getStatusColor(stage.status ?? '') }}>{stage.status}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#a0aec0" }}>
                    {new Date(stage.timestamp ?? '').toLocaleString()}
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
          )}
          
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
