package log

import (
	"log/slog"
	"os"
)

type Logger interface {
	Debug(msg string, args ...any)
	Info(msg string, args ...any)
	Warn(msg string, args ...any)
	Error(msg string, args ...any)
}

type SLogger struct{ l *slog.Logger }

func New(l *slog.Logger) Logger { return &SLogger{l: l} }

func (s *SLogger) Debug(msg string, args ...any) { s.l.Debug(msg, args...) }
func (s *SLogger) Info(msg string, args ...any)  { s.l.Info(msg, args...) }
func (s *SLogger) Warn(msg string, args ...any)  { s.l.Warn(msg, args...) }
func (s *SLogger) Error(msg string, args ...any) { s.l.Error(msg, args...) }

var defaultLogger = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

func Set(l *slog.Logger) { defaultLogger = l }

func L() *slog.Logger { return defaultLogger }
