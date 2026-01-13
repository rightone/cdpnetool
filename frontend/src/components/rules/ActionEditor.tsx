import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { X, Plus, Trash2 } from 'lucide-react'
import type { 
  Action, 
  Rewrite, 
  Respond, 
  Fail, 
  Pause,
  JSONPatchOp,
  JSONPatchOpType,
  PauseStage,
  PauseDefaultActionType
} from '@/types/rules'

interface ActionEditorProps {
  action: Action
  onChange: (action: Action) => void
}

type ActionType = 'none' | 'rewrite' | 'respond' | 'fail' | 'pause'

function getActionType(action: Action): ActionType {
  if (action.respond) return 'respond'
  if (action.fail) return 'fail'
  if (action.pause) return 'pause'
  if (action.rewrite) return 'rewrite'
  return 'none'
}

export function ActionEditor({ action, onChange }: ActionEditorProps) {
  const [activeTab, setActiveTab] = useState<ActionType>(getActionType(action) || 'rewrite')

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as ActionType)
    // 切换 tab 时清除其他类型的配置
    const newAction: Action = {
      delayMS: action.delayMS,
      dropRate: action.dropRate,
    }
    onChange(newAction)
  }

  return (
    <div className="space-y-4">
      {/* 通用选项：延迟和丢弃率 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">延迟注入 (ms)</label>
          <Input
            type="number"
            value={action.delayMS || ''}
            onChange={(e) => onChange({ ...action, delayMS: parseInt(e.target.value) || undefined })}
            placeholder="0"
            min={0}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">丢弃率 (0-1)</label>
          <Input
            type="number"
            value={action.dropRate || ''}
            onChange={(e) => onChange({ ...action, dropRate: parseFloat(e.target.value) || undefined })}
            placeholder="0"
            min={0}
            max={1}
            step={0.1}
          />
        </div>
      </div>

      {/* 动作类型选择 */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="none">无动作</TabsTrigger>
          <TabsTrigger value="rewrite">重写</TabsTrigger>
          <TabsTrigger value="respond">直接响应</TabsTrigger>
          <TabsTrigger value="fail">模拟失败</TabsTrigger>
          <TabsTrigger value="pause">暂停审批</TabsTrigger>
        </TabsList>

        <TabsContent value="none" className="pt-4">
          <div className="text-sm text-muted-foreground text-center p-4 border rounded-lg border-dashed">
            仅执行延迟/丢弃，不做其他修改
          </div>
        </TabsContent>

        <TabsContent value="rewrite" className="pt-4">
          <RewriteEditor
            rewrite={action.rewrite || {}}
            onChange={(rewrite) => onChange({ ...action, rewrite, respond: undefined, fail: undefined, pause: undefined })}
          />
        </TabsContent>

        <TabsContent value="respond" className="pt-4">
          <RespondEditor
            respond={action.respond || { status: 200 }}
            onChange={(respond) => onChange({ ...action, respond, rewrite: undefined, fail: undefined, pause: undefined })}
          />
        </TabsContent>

        <TabsContent value="fail" className="pt-4">
          <FailEditor
            fail={action.fail || { reason: 'ConnectionFailed' }}
            onChange={(fail) => onChange({ ...action, fail, rewrite: undefined, respond: undefined, pause: undefined })}
          />
        </TabsContent>

        <TabsContent value="pause" className="pt-4">
          <PauseEditor
            pause={action.pause || { stage: 'request', timeoutMS: 5000, defaultAction: { type: 'continue_original' } }}
            onChange={(pause) => onChange({ ...action, pause, rewrite: undefined, respond: undefined, fail: undefined })}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ========== Rewrite 编辑器 ==========

function RewriteEditor({ rewrite, onChange }: { rewrite: Rewrite; onChange: (r: Rewrite) => void }) {
  return (
    <div className="space-y-4">
      {/* URL 和 Method */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">重写 URL</label>
          <Input
            value={rewrite.url || ''}
            onChange={(e) => onChange({ ...rewrite, url: e.target.value || undefined })}
            placeholder="留空不修改"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">重写 Method</label>
          <Select
            value={rewrite.method || ''}
            onChange={(e) => onChange({ ...rewrite, method: e.target.value || undefined })}
            options={[
              { value: '', label: '不修改' },
              { value: 'GET', label: 'GET' },
              { value: 'POST', label: 'POST' },
              { value: 'PUT', label: 'PUT' },
              { value: 'DELETE', label: 'DELETE' },
              { value: 'PATCH', label: 'PATCH' },
            ]}
          />
        </div>
      </div>

      {/* Headers 编辑 */}
      <KeyValueEditor
        title="修改 Headers"
        data={rewrite.headers || {}}
        onChange={(headers) => onChange({ ...rewrite, headers: Object.keys(headers).length ? headers : undefined })}
        keyPlaceholder="Header 名"
        valuePlaceholder="值 (留空表示删除)"
      />

      {/* Query 编辑 */}
      <KeyValueEditor
        title="修改 Query 参数"
        data={rewrite.query || {}}
        onChange={(query) => onChange({ ...rewrite, query: Object.keys(query).length ? query : undefined })}
        keyPlaceholder="参数名"
        valuePlaceholder="值 (留空表示删除)"
      />

      {/* Body JSON Patch */}
      <JSONPatchEditor
        patches={rewrite.body?.jsonPatch || []}
        onChange={(jsonPatch) => onChange({ 
          ...rewrite, 
          body: jsonPatch.length ? { ...rewrite.body, jsonPatch } : undefined 
        })}
      />
    </div>
  )
}

// ========== Respond 编辑器 ==========

function RespondEditor({ respond, onChange }: { respond: Respond; onChange: (r: Respond) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">HTTP 状态码</label>
          <Input
            type="number"
            value={respond.status}
            onChange={(e) => onChange({ ...respond, status: parseInt(e.target.value) || 200 })}
            min={100}
            max={599}
          />
        </div>
        <div className="space-y-1 flex items-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={respond.base64 || false}
              onChange={(e) => onChange({ ...respond, base64: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Body 为 Base64 编码</span>
          </label>
        </div>
      </div>

      <KeyValueEditor
        title="响应 Headers"
        data={respond.headers || {}}
        onChange={(headers) => {
          const filtered: Record<string, string> = {}
          for (const [k, v] of Object.entries(headers)) {
            if (v !== null) filtered[k] = v
          }
          onChange({ ...respond, headers: Object.keys(filtered).length ? filtered : undefined })
        }}
        keyPlaceholder="Header 名"
        valuePlaceholder="Header 值"
        allowNull={false}
      />

      <div className="space-y-1">
        <label className="text-sm font-medium">响应 Body</label>
        <Textarea
          value={respond.body || ''}
          onChange={(e) => onChange({ ...respond, body: e.target.value || undefined })}
          placeholder={respond.base64 ? 'Base64 编码内容...' : 'JSON 或文本内容...'}
          rows={5}
          className="font-mono text-sm"
        />
      </div>
    </div>
  )
}

// ========== Fail 编辑器 ==========

function FailEditor({ fail, onChange }: { fail: Fail; onChange: (f: Fail) => void }) {
  const failReasons = [
    { value: 'Failed', label: 'Failed - 通用失败' },
    { value: 'Aborted', label: 'Aborted - 请求中止' },
    { value: 'TimedOut', label: 'TimedOut - 超时' },
    { value: 'AccessDenied', label: 'AccessDenied - 拒绝访问' },
    { value: 'ConnectionClosed', label: 'ConnectionClosed - 连接关闭' },
    { value: 'ConnectionReset', label: 'ConnectionReset - 连接重置' },
    { value: 'ConnectionRefused', label: 'ConnectionRefused - 连接拒绝' },
    { value: 'ConnectionAborted', label: 'ConnectionAborted - 连接中止' },
    { value: 'ConnectionFailed', label: 'ConnectionFailed - 连接失败' },
    { value: 'NameNotResolved', label: 'NameNotResolved - DNS解析失败' },
    { value: 'InternetDisconnected', label: 'InternetDisconnected - 断网' },
    { value: 'AddressUnreachable', label: 'AddressUnreachable - 地址不可达' },
    { value: 'BlockedByClient', label: 'BlockedByClient - 被客户端阻止' },
    { value: 'BlockedByResponse', label: 'BlockedByResponse - 被响应阻止' },
  ]

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium">失败原因</label>
        <Select
          value={fail.reason}
          onChange={(e) => onChange({ reason: e.target.value })}
          options={failReasons}
        />
      </div>
      <div className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
        模拟网络错误，请求将直接失败，不会发送到服务器。
      </div>
    </div>
  )
}

// ========== Pause 编辑器 ==========

function PauseEditor({ pause, onChange }: { pause: Pause; onChange: (p: Pause) => void }) {
  const defaultActionTypes: { value: PauseDefaultActionType; label: string }[] = [
    { value: 'continue_original', label: '继续原请求' },
    { value: 'continue_mutated', label: '继续（应用自动重写）' },
    { value: 'fulfill', label: '返回自定义响应' },
    { value: 'fail', label: '使请求失败' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">暂停阶段</label>
          <Select
            value={pause.stage}
            onChange={(e) => onChange({ ...pause, stage: e.target.value as PauseStage })}
            options={[
              { value: 'request', label: '请求阶段' },
              { value: 'response', label: '响应阶段' },
            ]}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">超时时间 (ms)</label>
          <Input
            type="number"
            value={pause.timeoutMS}
            onChange={(e) => onChange({ ...pause, timeoutMS: parseInt(e.target.value) || 5000 })}
            min={1000}
            max={60000}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">超时后默认动作</label>
        <Select
          value={pause.defaultAction.type}
          onChange={(e) => onChange({ 
            ...pause, 
            defaultAction: { ...pause.defaultAction, type: e.target.value as PauseDefaultActionType } 
          })}
          options={defaultActionTypes}
        />
      </div>

      <div className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
        请求/响应将暂停等待人工审批。超时后自动执行默认动作。
      </div>
    </div>
  )
}

// ========== 通用 Key-Value 编辑器 ==========

interface KeyValueEditorProps {
  title: string
  data: Record<string, string | null>
  onChange: (data: Record<string, string | null>) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
  allowNull?: boolean
}

function KeyValueEditor({ 
  title, 
  data, 
  onChange, 
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  allowNull = true
}: KeyValueEditorProps) {
  const entries = Object.entries(data)

  const addEntry = () => {
    onChange({ ...data, '': '' })
  }

  const updateEntry = (oldKey: string, newKey: string, value: string | null) => {
    const newData = { ...data }
    if (oldKey !== newKey) {
      delete newData[oldKey]
    }
    newData[newKey] = value
    onChange(newData)
  }

  const removeEntry = (key: string) => {
    const newData = { ...data }
    delete newData[key]
    onChange(newData)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{title}</label>
        <Button variant="outline" size="sm" onClick={addEntry}>
          <Plus className="w-4 h-4 mr-1" />
          添加
        </Button>
      </div>
      
      {entries.length === 0 ? (
        <div className="text-sm text-muted-foreground p-2 border rounded border-dashed text-center">
          暂无配置
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(([key, value], index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={key}
                onChange={(e) => updateEntry(key, e.target.value, value)}
                placeholder={keyPlaceholder}
                className="flex-1"
              />
              <Input
                value={value || ''}
                onChange={(e) => updateEntry(key, key, e.target.value || (allowNull ? null : ''))}
                placeholder={valuePlaceholder}
                className="flex-1"
              />
              <Button variant="ghost" size="icon" onClick={() => removeEntry(key)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ========== JSON Patch 编辑器 ==========

interface JSONPatchEditorProps {
  patches: JSONPatchOp[]
  onChange: (patches: JSONPatchOp[]) => void
}

function JSONPatchEditor({ patches, onChange }: JSONPatchEditorProps) {
  const opOptions: { value: JSONPatchOpType; label: string }[] = [
    { value: 'add', label: '添加' },
    { value: 'remove', label: '删除' },
    { value: 'replace', label: '替换' },
    { value: 'move', label: '移动' },
    { value: 'copy', label: '复制' },
  ]

  const addPatch = () => {
    onChange([...patches, { op: 'add', path: '', value: '' }])
  }

  const updatePatch = (index: number, patch: JSONPatchOp) => {
    const newPatches = [...patches]
    newPatches[index] = patch
    onChange(newPatches)
  }

  const removePatch = (index: number) => {
    onChange(patches.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Body JSON Patch (RFC6902)</label>
        <Button variant="outline" size="sm" onClick={addPatch}>
          <Plus className="w-4 h-4 mr-1" />
          添加操作
        </Button>
      </div>

      {patches.length === 0 ? (
        <div className="text-sm text-muted-foreground p-2 border rounded border-dashed text-center">
          暂无 JSON Patch 操作
        </div>
      ) : (
        <div className="space-y-2">
          {patches.map((patch, index) => (
            <div key={index} className="flex items-center gap-2 p-2 border rounded bg-card">
              <Select
                value={patch.op}
                onChange={(e) => updatePatch(index, { ...patch, op: e.target.value as JSONPatchOpType })}
                options={opOptions}
                className="w-24"
              />
              <Input
                value={patch.path}
                onChange={(e) => updatePatch(index, { ...patch, path: e.target.value })}
                placeholder="路径 (如 /data/id)"
                className="w-40"
              />
              {(patch.op === 'move' || patch.op === 'copy') && (
                <Input
                  value={patch.from || ''}
                  onChange={(e) => updatePatch(index, { ...patch, from: e.target.value })}
                  placeholder="源路径"
                  className="w-32"
                />
              )}
              {(patch.op === 'add' || patch.op === 'replace') && (
                <Input
                  value={typeof patch.value === 'string' ? patch.value : JSON.stringify(patch.value)}
                  onChange={(e) => {
                    let val: any = e.target.value
                    try { val = JSON.parse(e.target.value) } catch {}
                    updatePatch(index, { ...patch, value: val })
                  }}
                  placeholder="值 (JSON)"
                  className="flex-1"
                />
              )}
              <Button variant="ghost" size="icon" onClick={() => removePatch(index)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
