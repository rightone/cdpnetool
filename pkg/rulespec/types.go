package rulespec

import "cdpnetool/pkg/model"

type ConditionType string
type ConditionMode string
type ConditionOp string

type PauseStage string
type PauseDefaultActionType string

type RuleMode string

type JSONPatchOpType string

const (
	JSONPatchOpAdd     JSONPatchOpType = "add"
	JSONPatchOpRemove  JSONPatchOpType = "remove"
	JSONPatchOpReplace JSONPatchOpType = "replace"
	JSONPatchOpMove    JSONPatchOpType = "move"
	JSONPatchOpCopy    JSONPatchOpType = "copy"
	JSONPatchOpTest    JSONPatchOpType = "test"
)

const (
	ConditionTypeURL         ConditionType = "url"
	ConditionTypeMethod      ConditionType = "method"
	ConditionTypeHeader      ConditionType = "header"
	ConditionTypeQuery       ConditionType = "query"
	ConditionTypeCookie      ConditionType = "cookie"
	ConditionTypeText        ConditionType = "text"
	ConditionTypeMIME        ConditionType = "mime"
	ConditionTypeSize        ConditionType = "size"
	ConditionTypeProbability ConditionType = "probability"
	ConditionTypeTimeWindow  ConditionType = "time_window"
	ConditionTypeJSONPointer ConditionType = "json_pointer"
	ConditionTypeStage       ConditionType = "stage"
)

const (
	ConditionModePrefix ConditionMode = "prefix"
	ConditionModeRegex  ConditionMode = "regex"
	ConditionModeExact  ConditionMode = "exact"
)

const (
	ConditionOpEquals   ConditionOp = "equals"
	ConditionOpContains ConditionOp = "contains"
	ConditionOpRegex    ConditionOp = "regex"
	ConditionOpLT       ConditionOp = "lt"
	ConditionOpLTE      ConditionOp = "lte"
	ConditionOpGT       ConditionOp = "gt"
	ConditionOpGTE      ConditionOp = "gte"
	ConditionOpBetween  ConditionOp = "between"
)

const (
	PauseStageRequest  PauseStage = "request"
	PauseStageResponse PauseStage = "response"
)

const (
	PauseDefaultActionContinueOriginal PauseDefaultActionType = "continue_original"
	PauseDefaultActionContinueMutated  PauseDefaultActionType = "continue_mutated"
	PauseDefaultActionFulfill          PauseDefaultActionType = "fulfill"
	PauseDefaultActionFail             PauseDefaultActionType = "fail"
)

const (
	RuleModeShortCircuit RuleMode = "short_circuit"
	RuleModeAggregate    RuleMode = "aggregate"
)

type RuleSet struct {
	Version string `json:"version"`
	Rules   []Rule `json:"rules"`
}

type Rule struct {
	ID       model.RuleID `json:"id"`
	Name     string       `json:"name,omitempty"`
	Priority int          `json:"priority"`
	Mode     RuleMode     `json:"mode"`
	Match    Match        `json:"match"`
	Action   Action       `json:"action"`
}

type Match struct {
	AllOf  []Condition `json:"allOf"`
	AnyOf  []Condition `json:"anyOf"`
	NoneOf []Condition `json:"noneOf"`
}

type Condition struct {
	Type    ConditionType `json:"type"`
	Mode    ConditionMode `json:"mode"`
	Pattern string        `json:"pattern"`
	Values  []string      `json:"values"`
	Key     string        `json:"key"`
	Op      ConditionOp   `json:"op"`
	Value   string        `json:"value"`
	Pointer string        `json:"pointer"`
}

type Action struct {
	Rewrite  *Rewrite `json:"rewrite"`
	Respond  *Respond `json:"respond"`
	Fail     *Fail    `json:"fail"`
	DelayMS  int      `json:"delayMS"`
	DropRate float64  `json:"dropRate"`
	Pause    *Pause   `json:"pause"`
}

type Rewrite struct {
	URL     *string            `json:"url"`
	Method  *string            `json:"method"`
	Headers map[string]*string `json:"headers"`
	Query   map[string]*string `json:"query"`
	Cookies map[string]*string `json:"cookies"`
	Body    *BodyPatch         `json:"body"`
}

type BodyPatch struct {
	JSONPatch []JSONPatchOp   `json:"jsonPatch,omitempty"`
	TextRegex *TextRegexPatch `json:"textRegex,omitempty"`
	Base64    *Base64Patch    `json:"base64,omitempty"`
}

type JSONPatchOp struct {
	Op    JSONPatchOpType `json:"op"`
	Path  string          `json:"path"`
	From  string          `json:"from,omitempty"`
	Value any             `json:"value,omitempty"`
}

type TextRegexPatch struct {
	Pattern string `json:"pattern"`
	Replace string `json:"replace"`
}

type Base64Patch struct {
	Value string `json:"value"`
}

type Respond struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	Body    []byte            `json:"body"`
	Base64  bool              `json:"base64"`
}

type Fail struct {
	Reason string `json:"reason"`
}

type Pause struct {
	Stage         PauseStage `json:"stage"`
	TimeoutMS     int        `json:"timeoutMS"`
	DefaultAction struct {
		Type   PauseDefaultActionType `json:"type"`
		Status int                    `json:"status"`
		Reason string                 `json:"reason"`
	} `json:"defaultAction"`
}
