package rules

import (
	"encoding/json"
	"math/rand"
	"strconv"
	"strings"
	"sync"
	"time"

	"cdpnetool/pkg/model"
)

type Engine struct {
	rs      model.RuleSet
	mu      sync.Mutex
	total   int64
	matched int64
	byRule  map[model.RuleID]int64
}

func New(rs model.RuleSet) *Engine { return &Engine{rs: rs} }

func (e *Engine) Update(rs model.RuleSet) { e.rs = rs }

type Ctx struct {
	URL         string
	Method      string
	Headers     map[string]string
	Query       map[string]string
	Cookies     map[string]string
	Body        string
	ContentType string
	Stage       string
}

type Result struct {
	RuleID *model.RuleID
	Action *model.Action
}

func (e *Engine) Eval(ctx Ctx) *Result {
	e.mu.Lock()
	e.total++
	e.mu.Unlock()
	if len(e.rs.Rules) == 0 {
		return nil
	}
	var chosen *model.Rule
	for i := range e.rs.Rules {
		r := &e.rs.Rules[i]
		if matchRule(ctx, r.Match) {
			if chosen == nil || r.Priority > chosen.Priority {
				chosen = r
				if r.Mode == "short_circuit" {
					break
				}
			}
		}
	}
	if chosen == nil {
		return nil
	}
	e.mu.Lock()
	e.matched++
	if e.byRule == nil {
		e.byRule = make(map[model.RuleID]int64)
	}
	e.byRule[chosen.ID] = e.byRule[chosen.ID] + 1
	e.mu.Unlock()
	rid := chosen.ID
	return &Result{RuleID: &rid, Action: &chosen.Action}
}

func matchRule(ctx Ctx, m model.Match) bool {
	ok := true
	if len(m.AllOf) > 0 {
		ok = ok && allOf(ctx, m.AllOf)
	}
	if len(m.AnyOf) > 0 {
		ok = ok && anyOf(ctx, m.AnyOf)
	}
	if len(m.NoneOf) > 0 {
		ok = ok && noneOf(ctx, m.NoneOf)
	}
	return ok
}

func allOf(ctx Ctx, cs []model.Condition) bool {
	for i := range cs {
		if !cond(ctx, cs[i]) {
			return false
		}
	}
	return true
}

func anyOf(ctx Ctx, cs []model.Condition) bool {
	for i := range cs {
		if cond(ctx, cs[i]) {
			return true
		}
	}
	return false
}

func noneOf(ctx Ctx, cs []model.Condition) bool { return !anyOf(ctx, cs) }

func cond(ctx Ctx, c model.Condition) bool {
	switch c.Type {
	case "url":
		switch c.Mode {
		case "prefix":
			return strings.HasPrefix(ctx.URL, c.Pattern)
		case "regex":
			return matchRegex(ctx.URL, c.Pattern)
		case "exact":
			return ctx.URL == c.Pattern
		default:
			return glob(ctx.URL, c.Pattern)
		}
	case "method":
		for _, v := range c.Values {
			if strings.EqualFold(ctx.Method, v) {
				return true
			}
		}
		return false
	case "header":
		v, ok := ctx.Headers[c.Key]
		if !ok {
			return false
		}
		switch c.Op {
		case "equals":
			return v == c.Value
		case "contains":
			return strings.Contains(v, c.Value)
		case "regex":
			return matchRegex(v, c.Value)
		default:
			return true
		}
	case "query":
		v, ok := ctx.Query[c.Key]
		if !ok {
			return false
		}
		switch c.Op {
		case "equals":
			return v == c.Value
		case "contains":
			return strings.Contains(v, c.Value)
		case "regex":
			return matchRegex(v, c.Value)
		default:
			return true
		}
	case "cookie":
		v, ok := ctx.Cookies[c.Key]
		if !ok {
			return false
		}
		switch c.Op {
		case "equals":
			return v == c.Value
		case "contains":
			return strings.Contains(v, c.Value)
		case "regex":
			return matchRegex(v, c.Value)
		default:
			return true
		}
	case "text":
		if ctx.Body == "" {
			return false
		}
		switch c.Op {
		case "equals":
			return ctx.Body == c.Value
		case "contains":
			return strings.Contains(ctx.Body, c.Value)
		case "regex":
			return matchRegex(ctx.Body, c.Value)
		default:
			return true
		}
	case "mime":
		s := strings.ToLower(ctx.ContentType)
		p := strings.ToLower(c.Pattern)
		switch c.Mode {
		case "exact":
			return s == p
		case "prefix":
			return strings.HasPrefix(s, p)
		default:
			return strings.HasPrefix(s, p)
		}
	case "size":
		var n int64
		if ctx.Body != "" {
			n = int64(len(ctx.Body))
		} else {
			if v, ok := ctx.Headers["content-length"]; ok {
				if x, err := parseInt64(v); err == nil {
					n = x
				} else {
					return false
				}
			} else {
				return false
			}
		}
		switch c.Op {
		case "lt":
			x, err := parseInt64(c.Value)
			if err != nil {
				return false
			}
			return n < x
		case "lte":
			x, err := parseInt64(c.Value)
			if err != nil {
				return false
			}
			return n <= x
		case "gt":
			x, err := parseInt64(c.Value)
			if err != nil {
				return false
			}
			return n > x
		case "gte":
			x, err := parseInt64(c.Value)
			if err != nil {
				return false
			}
			return n >= x
		case "equals":
			x, err := parseInt64(c.Value)
			if err != nil {
				return false
			}
			return n == x
		case "between":
			parts := strings.SplitN(c.Value, ":", 2)
			if len(parts) != 2 {
				return false
			}
			a, err1 := parseInt64(strings.TrimSpace(parts[0]))
			b, err2 := parseInt64(strings.TrimSpace(parts[1]))
			if err1 != nil || err2 != nil {
				return false
			}
			if a > b {
				a, b = b, a
			}
			return n >= a && n <= b
		default:
			return true
		}
	case "probability":
		p := 0.0
		if c.Value != "" {
			if f, err := strconv.ParseFloat(c.Value, 64); err == nil {
				if f < 0 {
					f = 0
				}
				if f > 1 {
					f = 1
				}
				p = f
			}
		}
		return rand.Float64() < p
	case "time_window":
		// Value 格式: "HH:MM-HH:MM"
		parts := strings.SplitN(c.Value, "-", 2)
		if len(parts) != 2 {
			return false
		}
		s1 := strings.TrimSpace(parts[0])
		s2 := strings.TrimSpace(parts[1])
		toMin := func(s string) (int, bool) {
			t := strings.SplitN(s, ":", 2)
			if len(t) != 2 {
				return 0, false
			}
			h, err1 := strconv.Atoi(t[0])
			m, err2 := strconv.Atoi(t[1])
			if err1 != nil || err2 != nil {
				return 0, false
			}
			if h < 0 || h > 23 || m < 0 || m > 59 {
				return 0, false
			}
			return h*60 + m, true
		}
		a, ok1 := toMin(s1)
		b, ok2 := toMin(s2)
		if !ok1 || !ok2 {
			return false
		}
		now := time.Now()
		cur := now.Hour()*60 + now.Minute()
		if a <= b {
			return cur >= a && cur <= b
		}
		// 跨午夜窗口
		return cur >= a || cur <= b
	case "json_pointer":
		if ctx.Body == "" {
			return false
		}
		val, ok := jsonPointer(ctx.Body, c.Pointer)
		if !ok {
			return false
		}
		s := val
		switch c.Op {
		case "equals":
			return s == c.Value
		case "contains":
			return strings.Contains(s, c.Value)
		case "regex":
			return matchRegex(s, c.Value)
		default:
			return true
		}
	default:
		return false
	}
}

func parseInt64(s string) (int64, error) {
	var n int64
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c < '0' || c > '9' {
			return 0, strconv.ErrSyntax
		}
		n = n*10 + int64(c-'0')
	}
	return n, nil
}

func jsonPointer(body, ptr string) (string, bool) {
	var v any
	if err := json.Unmarshal([]byte(body), &v); err != nil {
		return "", false
	}
	if ptr == "" || ptr[0] != '/' {
		return "", false
	}
	cur := v
	tokens := splitPtr(ptr)
	for _, t := range tokens {
		switch c := cur.(type) {
		case map[string]any:
			tv, ok := c[t]
			if !ok {
				return "", false
			}
			cur = tv
		case []any:
			idx, ok := toIndex(t)
			if !ok || idx < 0 || idx >= len(c) {
				return "", false
			}
			cur = c[idx]
		default:
			return "", false
		}
	}
	switch x := cur.(type) {
	case string:
		return x, true
	case float64:
		return formatFloat(x), true
	case bool:
		if x {
			return "true", true
		} else {
			return "false", true
		}
	default:
		b, err := json.Marshal(x)
		if err != nil {
			return "", false
		}
		return string(b), true
	}
}

func splitPtr(p string) []string {
	var out []string
	i := 1
	for i < len(p) {
		j := i
		for j < len(p) && p[j] != '/' {
			j++
		}
		tok := p[i:j]
		tok = strings.ReplaceAll(tok, "~1", "/")
		tok = strings.ReplaceAll(tok, "~0", "~")
		out = append(out, tok)
		i = j + 1
	}
	return out
}

func toIndex(s string) (int, bool) {
	n := 0
	if len(s) == 0 {
		return 0, false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c < '0' || c > '9' {
			return 0, false
		}
		n = n*10 + int(c-'0')
	}
	return n, true
}

func formatFloat(f float64) string {
	if float64(int64(f)) == f {
		return strconv.FormatInt(int64(f), 10)
	}
	return strconv.FormatFloat(f, 'f', -1, 64)
}

func (e *Engine) Stats() model.EngineStats {
	e.mu.Lock()
	defer e.mu.Unlock()
	m := make(map[model.RuleID]int64, len(e.byRule))
	for k, v := range e.byRule {
		m[k] = v
	}
	return model.EngineStats{Total: e.total, Matched: e.matched, ByRule: m}
}

func matchRegex(s, pattern string) bool {
	re, err := regexCache.Get(pattern)
	if err != nil {
		return false
	}
	return re.MatchString(s)
}

func glob(s, pattern string) bool {
	if pattern == "*" {
		return true
	}
	if strings.HasPrefix(pattern, "*") && strings.HasSuffix(s, strings.TrimPrefix(pattern, "*")) {
		return true
	}
	if strings.HasSuffix(pattern, "*") && strings.HasPrefix(s, strings.TrimSuffix(pattern, "*")) {
		return true
	}
	return s == pattern
}
