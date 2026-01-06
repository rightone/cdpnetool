package obs

import "strings"

// MaskValue 对敏感值进行掩码处理
func MaskValue(v string) string {
	if len(v) <= 8 {
		return "***"
	}
	return v[:4] + "***" + v[len(v)-4:]
}

// MaskHeaders 对敏感头部字段进行掩码并返回新映射
func MaskHeaders(h map[string]string) map[string]string {
	if h == nil {
		return nil
	}
	out := make(map[string]string, len(h))
	for k, v := range h {
		lk := strings.ToLower(k)
		if lk == "authorization" || lk == "cookie" || strings.HasPrefix(lk, "x-api-key") {
			out[k] = MaskValue(v)
		} else {
			out[k] = v
		}
	}
	return out
}
