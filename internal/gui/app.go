package gui

import (
	"context"
	"encoding/json"

	"cdpnetool/pkg/api"
	"cdpnetool/pkg/model"
	"cdpnetool/pkg/rulespec"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App 暴露给前端的方法集合
type App struct {
	ctx     context.Context
	service api.Service

	// 当前活跃的 session（简化版，后续可支持多 session）
	currentSession model.SessionID
}

// NewApp 创建 App 实例
func NewApp() *App {
	return &App{
		service: api.NewService(),
	}
}

// Startup 由 Wails 在应用启动时调用
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
}

// Shutdown 由 Wails 在应用关闭时调用
func (a *App) Shutdown(ctx context.Context) {
	if a.currentSession != "" {
		_ = a.service.StopSession(a.currentSession)
	}
}

// ========== Session 管理 ==========

// SessionResult 返回给前端的会话结果
type SessionResult struct {
	SessionID string `json:"sessionId"`
	Success   bool   `json:"success"`
	Error     string `json:"error,omitempty"`
}

// StartSession 创建拦截会话
func (a *App) StartSession(devToolsURL string) SessionResult {
	cfg := model.SessionConfig{
		DevToolsURL: devToolsURL,
	}
	sid, err := a.service.StartSession(cfg)
	if err != nil {
		return SessionResult{Success: false, Error: err.Error()}
	}
	a.currentSession = sid
	// 启动事件订阅
	go a.subscribeEvents(sid)
	return SessionResult{SessionID: string(sid), Success: true}
}

// StopSession 停止会话
func (a *App) StopSession(sessionID string) SessionResult {
	err := a.service.StopSession(model.SessionID(sessionID))
	if err != nil {
		return SessionResult{Success: false, Error: err.Error()}
	}
	if a.currentSession == model.SessionID(sessionID) {
		a.currentSession = ""
	}
	return SessionResult{Success: true}
}

// GetCurrentSession 获取当前活跃会话
func (a *App) GetCurrentSession() string {
	return string(a.currentSession)
}

// ========== Target 管理 ==========

// TargetListResult 返回给前端的目标列表
type TargetListResult struct {
	Targets []model.TargetInfo `json:"targets"`
	Success bool               `json:"success"`
	Error   string             `json:"error,omitempty"`
}

// ListTargets 列出浏览器页面目标
func (a *App) ListTargets(sessionID string) TargetListResult {
	targets, err := a.service.ListTargets(model.SessionID(sessionID))
	if err != nil {
		return TargetListResult{Success: false, Error: err.Error()}
	}
	return TargetListResult{Targets: targets, Success: true}
}

// OperationResult 通用操作结果
type OperationResult struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// AttachTarget 附加指定页面目标
func (a *App) AttachTarget(sessionID, targetID string) OperationResult {
	err := a.service.AttachTarget(model.SessionID(sessionID), model.TargetID(targetID))
	if err != nil {
		return OperationResult{Success: false, Error: err.Error()}
	}
	return OperationResult{Success: true}
}

// DetachTarget 移除指定页面目标
func (a *App) DetachTarget(sessionID, targetID string) OperationResult {
	err := a.service.DetachTarget(model.SessionID(sessionID), model.TargetID(targetID))
	if err != nil {
		return OperationResult{Success: false, Error: err.Error()}
	}
	return OperationResult{Success: true}
}

// ========== 拦截控制 ==========

// EnableInterception 启用拦截
func (a *App) EnableInterception(sessionID string) OperationResult {
	err := a.service.EnableInterception(model.SessionID(sessionID))
	if err != nil {
		return OperationResult{Success: false, Error: err.Error()}
	}
	return OperationResult{Success: true}
}

// DisableInterception 停用拦截
func (a *App) DisableInterception(sessionID string) OperationResult {
	err := a.service.DisableInterception(model.SessionID(sessionID))
	if err != nil {
		return OperationResult{Success: false, Error: err.Error()}
	}
	return OperationResult{Success: true}
}

// ========== 规则管理 ==========

// LoadRules 从 JSON 字符串加载规则
func (a *App) LoadRules(sessionID string, rulesJSON string) OperationResult {
	var rs rulespec.RuleSet
	if err := json.Unmarshal([]byte(rulesJSON), &rs); err != nil {
		return OperationResult{Success: false, Error: "JSON 解析失败: " + err.Error()}
	}
	err := a.service.LoadRules(model.SessionID(sessionID), rs)
	if err != nil {
		return OperationResult{Success: false, Error: err.Error()}
	}
	return OperationResult{Success: true}
}

// StatsResult 规则统计结果
type StatsResult struct {
	Stats   model.EngineStats `json:"stats"`
	Success bool              `json:"success"`
	Error   string            `json:"error,omitempty"`
}

// GetRuleStats 获取规则命中统计
func (a *App) GetRuleStats(sessionID string) StatsResult {
	stats, err := a.service.GetRuleStats(model.SessionID(sessionID))
	if err != nil {
		return StatsResult{Success: false, Error: err.Error()}
	}
	return StatsResult{Stats: stats, Success: true}
}

// ========== 事件推送 ==========

// subscribeEvents 订阅拦截事件并推送到前端
func (a *App) subscribeEvents(sessionID model.SessionID) {
	ch, err := a.service.SubscribeEvents(sessionID)
	if err != nil {
		return
	}
	for evt := range ch {
		// 通过 Wails 事件系统推送到前端
		runtime.EventsEmit(a.ctx, "intercept-event", evt)
	}
}

// ========== Pending 审批 ==========

// PendingListResult 待审批列表结果
type PendingListResult struct {
	Items   []model.PendingItem `json:"items"`
	Success bool                `json:"success"`
	Error   string              `json:"error,omitempty"`
}

// ApproveRequest 审批请求阶段
func (a *App) ApproveRequest(itemID string, mutationsJSON string) OperationResult {
	var mutations rulespec.Rewrite
	if mutationsJSON != "" {
		if err := json.Unmarshal([]byte(mutationsJSON), &mutations); err != nil {
			return OperationResult{Success: false, Error: "JSON 解析失败: " + err.Error()}
		}
	}
	err := a.service.ApproveRequest(itemID, mutations)
	if err != nil {
		return OperationResult{Success: false, Error: err.Error()}
	}
	return OperationResult{Success: true}
}

// ApproveResponse 审批响应阶段
func (a *App) ApproveResponse(itemID string, mutationsJSON string) OperationResult {
	var mutations rulespec.Rewrite
	if mutationsJSON != "" {
		if err := json.Unmarshal([]byte(mutationsJSON), &mutations); err != nil {
			return OperationResult{Success: false, Error: "JSON 解析失败: " + err.Error()}
		}
	}
	err := a.service.ApproveResponse(itemID, mutations)
	if err != nil {
		return OperationResult{Success: false, Error: err.Error()}
	}
	return OperationResult{Success: true}
}

// Reject 拒绝审批项
func (a *App) Reject(itemID string) OperationResult {
	err := a.service.Reject(itemID)
	if err != nil {
		return OperationResult{Success: false, Error: err.Error()}
	}
	return OperationResult{Success: true}
}
