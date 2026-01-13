import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { X, Plus } from 'lucide-react'
import type { 
  Condition, 
  ConditionType, 
  ConditionMode, 
  ConditionOp 
} from '@/types/rules'
import { 
  CONDITION_TYPE_LABELS, 
  CONDITION_MODE_LABELS,
  HTTP_METHODS,
  createEmptyCondition 
} from '@/types/rules'

interface ConditionEditorProps {
  condition: Condition
  onChange: (condition: Condition) => void
  onRemove: () => void
}

// 条件类型选项
const conditionTypeOptions = Object.entries(CONDITION_TYPE_LABELS)
  .filter(([key]) => key !== 'time_window') // 暂不支持时间窗口
  .map(([value, label]) => ({ value, label }))

// 模式选项
const modeOptions = Object.entries(CONDITION_MODE_LABELS).map(([value, label]) => ({ value, label }))

// 操作符选项（字符串类型）
const stringOpOptions: { value: ConditionOp; label: string }[] = [
  { value: 'equals', label: '等于' },
  { value: 'contains', label: '包含' },
  { value: 'regex', label: '正则匹配' },
]

// 操作符选项（数字类型）
const numericOpOptions: { value: ConditionOp; label: string }[] = [
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
]

// 阶段选项
const stageOptions = [
  { value: 'request', label: '请求阶段' },
  { value: 'response', label: '响应阶段' },
]

export function ConditionEditor({ condition, onChange, onRemove }: ConditionEditorProps) {
  const handleTypeChange = (newType: ConditionType) => {
    onChange(createEmptyCondition(newType))
  }

  const updateField = <K extends keyof Condition>(key: K, value: Condition[K]) => {
    onChange({ ...condition, [key]: value })
  }

  return (
    <div className="flex items-start gap-2 p-3 rounded-lg border bg-card">
      {/* 条件类型选择 */}
      <Select
        value={condition.type}
        onChange={(e) => handleTypeChange(e.target.value as ConditionType)}
        options={conditionTypeOptions}
        className="w-32"
      />

      {/* 根据条件类型渲染不同的编辑器 */}
      <div className="flex-1 flex items-center gap-2 flex-wrap">
        {renderConditionFields(condition, updateField)}
      </div>

      {/* 删除按钮 */}
      <Button variant="ghost" size="icon" onClick={onRemove} className="shrink-0">
        <X className="w-4 h-4" />
      </Button>
    </div>
  )
}

// 根据条件类型渲染对应的字段
function renderConditionFields(
  condition: Condition, 
  updateField: <K extends keyof Condition>(key: K, value: Condition[K]) => void
) {
  switch (condition.type) {
    case 'url':
      return (
        <>
          <Select
            value={condition.mode || 'prefix'}
            onChange={(e) => updateField('mode', e.target.value as ConditionMode)}
            options={modeOptions}
            className="w-28"
          />
          <Input
            value={condition.pattern || ''}
            onChange={(e) => updateField('pattern', e.target.value)}
            placeholder="URL 模式..."
            className="flex-1 min-w-[200px]"
          />
        </>
      )

    case 'method':
      return (
        <MethodSelector
          values={condition.values || []}
          onChange={(values) => updateField('values', values)}
        />
      )

    case 'header':
    case 'query':
    case 'cookie':
      return (
        <>
          <Input
            value={condition.key || ''}
            onChange={(e) => updateField('key', e.target.value)}
            placeholder={condition.type === 'header' ? 'Header 名' : condition.type === 'query' ? '参数名' : 'Cookie 名'}
            className="w-32"
          />
          <Select
            value={condition.op || 'equals'}
            onChange={(e) => updateField('op', e.target.value as ConditionOp)}
            options={stringOpOptions}
            className="w-28"
          />
          <Input
            value={condition.value || ''}
            onChange={(e) => updateField('value', e.target.value)}
            placeholder="值..."
            className="flex-1 min-w-[150px]"
          />
        </>
      )

    case 'json_pointer':
      return (
        <>
          <Input
            value={condition.pointer || ''}
            onChange={(e) => updateField('pointer', e.target.value)}
            placeholder="JSON Pointer (如 /data/id)"
            className="w-40"
          />
          <Select
            value={condition.op || 'equals'}
            onChange={(e) => updateField('op', e.target.value as ConditionOp)}
            options={stringOpOptions}
            className="w-28"
          />
          <Input
            value={condition.value || ''}
            onChange={(e) => updateField('value', e.target.value)}
            placeholder="值..."
            className="flex-1 min-w-[150px]"
          />
        </>
      )

    case 'text':
      return (
        <>
          <Select
            value={condition.op || 'contains'}
            onChange={(e) => updateField('op', e.target.value as ConditionOp)}
            options={stringOpOptions}
            className="w-28"
          />
          <Input
            value={condition.value || ''}
            onChange={(e) => updateField('value', e.target.value)}
            placeholder="文本内容..."
            className="flex-1 min-w-[200px]"
          />
        </>
      )

    case 'mime':
      return (
        <>
          <Select
            value={condition.mode || 'prefix'}
            onChange={(e) => updateField('mode', e.target.value as ConditionMode)}
            options={[
              { value: 'prefix', label: '前缀匹配' },
              { value: 'exact', label: '精确匹配' },
            ]}
            className="w-28"
          />
          <Input
            value={condition.pattern || ''}
            onChange={(e) => updateField('pattern', e.target.value)}
            placeholder="MIME 类型 (如 application/json)"
            className="flex-1 min-w-[200px]"
          />
        </>
      )

    case 'size':
      return (
        <>
          <Select
            value={condition.op || 'lt'}
            onChange={(e) => updateField('op', e.target.value as ConditionOp)}
            options={numericOpOptions}
            className="w-28"
          />
          <Input
            value={condition.value || ''}
            onChange={(e) => updateField('value', e.target.value)}
            placeholder="字节数"
            type="number"
            className="w-32"
          />
          <span className="text-sm text-muted-foreground">bytes</span>
        </>
      )

    case 'probability':
      return (
        <>
          <Input
            value={condition.value || '1.0'}
            onChange={(e) => updateField('value', e.target.value)}
            placeholder="0.0 - 1.0"
            type="number"
            step="0.1"
            min="0"
            max="1"
            className="w-24"
          />
          <span className="text-sm text-muted-foreground">
            ({Math.round(parseFloat(condition.value || '1') * 100)}% 概率触发)
          </span>
        </>
      )

    case 'stage':
      return (
        <Select
          value={condition.value || 'request'}
          onChange={(e) => updateField('value', e.target.value)}
          options={stageOptions}
          className="w-32"
        />
      )

    default:
      return <span className="text-muted-foreground">暂不支持此条件类型</span>
  }
}

// HTTP 方法多选组件
function MethodSelector({ 
  values, 
  onChange 
}: { 
  values: string[]
  onChange: (values: string[]) => void 
}) {
  const toggleMethod = (method: string) => {
    if (values.includes(method)) {
      onChange(values.filter(m => m !== method))
    } else {
      onChange([...values, method])
    }
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {HTTP_METHODS.map(method => (
        <Badge
          key={method}
          variant={values.includes(method) ? 'default' : 'outline'}
          className="cursor-pointer"
          onClick={() => toggleMethod(method)}
        >
          {method}
        </Badge>
      ))}
    </div>
  )
}

// 条件组编辑器（allOf / anyOf / noneOf）
interface ConditionGroupProps {
  title: string
  description: string
  conditions: Condition[]
  onChange: (conditions: Condition[]) => void
}

export function ConditionGroup({ title, description, conditions, onChange }: ConditionGroupProps) {
  const addCondition = () => {
    onChange([...conditions, createEmptyCondition('url')])
  }

  const updateCondition = (index: number, condition: Condition) => {
    const newConditions = [...conditions]
    newConditions[index] = condition
    onChange(newConditions)
  }

  const removeCondition = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium">{title}</h4>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button variant="outline" size="sm" onClick={addCondition}>
          <Plus className="w-4 h-4 mr-1" />
          添加条件
        </Button>
      </div>

      {conditions.length === 0 ? (
        <div className="text-sm text-muted-foreground p-3 border rounded-lg border-dashed text-center">
          暂无条件，点击上方按钮添加
        </div>
      ) : (
        <div className="space-y-2">
          {conditions.map((condition, index) => (
            <ConditionEditor
              key={index}
              condition={condition}
              onChange={(c) => updateCondition(index, c)}
              onRemove={() => removeCondition(index)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
