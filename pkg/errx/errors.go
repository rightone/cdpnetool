package errx

import (
	"errors"
	"fmt"
)

type Code string

type Error struct {
	Code Code
	Msg  string
	Err  error
}

// Error 返回错误的字符串表示
func (e *Error) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %s: %v", e.Code, e.Msg, e.Err)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Msg)
}

// Unwrap 返回底层错误以支持errors.Unwrap
func (e *Error) Unwrap() error { return e.Err }

// New 创建带代码与消息的错误
func New(code Code, msg string) *Error { return &Error{Code: code, Msg: msg} }

// Wrap 包装底层错误并附加代码与消息
func Wrap(code Code, err error, msg string) *Error { return &Error{Code: code, Msg: msg, Err: err} }

// Is 判断错误是否为指定代码
func Is(err error, code Code) bool {
	var e *Error
	if errors.As(err, &e) {
		return e.Code == code
	}
	return false
}

const (
	CodeSessionNotFound Code = "SESSION_NOT_FOUND"
)
