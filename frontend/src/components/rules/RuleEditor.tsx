import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChevronDown, ChevronUp, Trash2, Copy, GripVertical } from 'lucide-react'
import { ConditionGroup } from './ConditionEditor'
import { ActionEditor } from './ActionEditor'
import type { Rule, RuleMode, Match, Action, Condition } from '@/types/rules'

interface RuleEditorProps {
  rule: Rule
  onChange: (rule: Rule) => void
  onRemove: () => void
  onDuplicate: () => void
  isExpanded?: boolean
  onToggleExpand?: () => void
}

export function RuleEditor({ 
  rule, 
  onChange, 
  onRemove, 
  onDuplicate,
  isExpanded = true,
  onToggleExpand
}: RuleEditorProps) {
  const [activeTab, setActiveTab] = useState<'match' | 'action'>('match')

  const updateMatch = (key: keyof Match, conditions: Condition[]) => {
    onChange({
      ...rule,
      match: {
        ...rule.match,
        [key]: conditions.length > 0 ? conditions : undefined
      }
    })
  }

  const updateAction = (action: Action) => {
    onChange({ ...rule, action })
  }

  // 计算条件数量摘要
  const conditionCount = 
    (rule.match.allOf?.length || 0) + 
    (rule.match.anyOf?.length || 0) + 
    (rule.match.noneOf?.length || 0)

  // 获取动作类型摘要
  const getActionSummary = () => {
    if (rule.action.respond) return `直接响应 ${rule.action.respond.status}`
    if (rule.action.fail) return `模拟失败 (${rule.action.fail.reason})`
    if (rule.action.pause) return `暂停审批 (${rule.action.pause.stage})`
    if (rule.action.rewrite) return '重写请求/响应'
    if (rule.action.delayMS) return `延迟 ${rule.action.delayMS}ms`
    return '无动作'
  }

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      {/* 折叠头部 */}
      <div 
        className="flex items-center gap-3 p-3 bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors"
        onClick={onToggleExpand}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{rule.id}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              优先级 {rule.priority}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
              {rule.mode === 'short_circuit' ? '短路' : '聚合'}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {conditionCount} 个条件 · {getActionSummary()}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDuplicate() }}>
            <Copy className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onRemove() }}>
            <Trash2 className="w-4 h-4" />
          </Button>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* 基础信息 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">规则 ID</label>
              <Input
                value={rule.id}
                onChange={(e) => onChange({ ...rule, id: e.target.value })}
                placeholder="唯一标识"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">优先级</label>
              <Input
                type="number"
                value={rule.priority}
                onChange={(e) => onChange({ ...rule, priority: parseInt(e.target.value) || 0 })}
                placeholder="数值越大越优先"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">执行模式</label>
              <Select
                value={rule.mode}
                onChange={(e) => onChange({ ...rule, mode: e.target.value as RuleMode })}
                options={[
                  { value: 'short_circuit', label: '短路模式 (命中后停止)' },
                  { value: 'aggregate', label: '聚合模式 (可组合)' },
                ]}
              />
            </div>
          </div>

          {/* Match 和 Action 编辑区 */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'match' | 'action')}>
            <TabsList>
              <TabsTrigger value="match">匹配条件</TabsTrigger>
              <TabsTrigger value="action">执行动作</TabsTrigger>
            </TabsList>

            <TabsContent value="match" className="space-y-4 pt-4">
              <ConditionGroup
                title="ALL OF (全部满足)"
                description="所有条件都必须为真才能命中"
                conditions={rule.match.allOf || []}
                onChange={(conditions) => updateMatch('allOf', conditions)}
              />
              
              <ConditionGroup
                title="ANY OF (任一满足)"
                description="任意一个条件为真即命中"
                conditions={rule.match.anyOf || []}
                onChange={(conditions) => updateMatch('anyOf', conditions)}
              />
              
              <ConditionGroup
                title="NONE OF (排除)"
                description="所有条件都必须为假才能命中"
                conditions={rule.match.noneOf || []}
                onChange={(conditions) => updateMatch('noneOf', conditions)}
              />
            </TabsContent>

            <TabsContent value="action" className="pt-4">
              <ActionEditor
                action={rule.action}
                onChange={updateAction}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}

// ========== 规则列表编辑器 ==========

interface RuleListEditorProps {
  rules: Rule[]
  onChange: (rules: Rule[]) => void
}

export function RuleListEditor({ rules, onChange }: RuleListEditorProps) {
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set())

  const toggleExpand = (ruleId: string) => {
    const newSet = new Set(expandedRules)
    if (newSet.has(ruleId)) {
      newSet.delete(ruleId)
    } else {
      newSet.add(ruleId)
    }
    setExpandedRules(newSet)
  }

  const updateRule = (index: number, rule: Rule) => {
    const newRules = [...rules]
    newRules[index] = rule
    onChange(newRules)
  }

  const removeRule = (index: number) => {
    onChange(rules.filter((_, i) => i !== index))
  }

  const duplicateRule = (index: number) => {
    const rule = rules[index]
    const newRule: Rule = {
      ...JSON.parse(JSON.stringify(rule)),
      id: `${rule.id}_copy_${Date.now()}`
    }
    const newRules = [...rules]
    newRules.splice(index + 1, 0, newRule)
    onChange(newRules)
    setExpandedRules(new Set([...expandedRules, newRule.id]))
  }

  // 按优先级排序
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority)

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 pr-4">
        {sortedRules.map((rule) => {
          const originalIndex = rules.findIndex(r => r.id === rule.id)
          return (
            <RuleEditor
              key={rule.id}
              rule={rule}
              onChange={(r) => updateRule(originalIndex, r)}
              onRemove={() => removeRule(originalIndex)}
              onDuplicate={() => duplicateRule(originalIndex)}
              isExpanded={expandedRules.has(rule.id)}
              onToggleExpand={() => toggleExpand(rule.id)}
            />
          )
        })}
        
        {rules.length === 0 && (
          <div className="text-center text-muted-foreground p-8 border rounded-lg border-dashed">
            暂无规则，点击上方 "添加规则" 按钮创建
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
