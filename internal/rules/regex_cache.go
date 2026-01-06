package rules

import (
	"regexp"
	"sync"
)

type rc struct {
	mu sync.Mutex
	m  map[string]*regexp.Regexp
}

var regexCache = &rc{m: make(map[string]*regexp.Regexp)}

// Get 返回缓存中的正则或编译后加入缓存
func (r *rc) Get(p string) (*regexp.Regexp, error) {
	r.mu.Lock()
	re, ok := r.m[p]
	r.mu.Unlock()
	if ok {
		return re, nil
	}
	compiled, err := regexp.Compile(p)
	if err != nil {
		return nil, err
	}
	r.mu.Lock()
	r.m[p] = compiled
	r.mu.Unlock()
	return compiled, nil
}
