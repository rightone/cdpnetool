package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"cdpnetool/pkg/rulespec"

	"gorm.io/gorm"
)

// ConfigRepo 配置仓库
type ConfigRepo struct {
	db *DB
}

// NewConfigRepo 创建配置仓库实例
func NewConfigRepo(db *DB) *ConfigRepo {
	return &ConfigRepo{db: db}
}

// Create 创建新配置
func (r *ConfigRepo) Create(cfg *rulespec.Config) (*ConfigRecord, error) {
	// 校验配置 ID
	if err := rulespec.ValidateConfigID(cfg.ID); err != nil {
		return nil, err
	}

	// 校验规则 ID
	if err := r.validateRuleIDs(cfg.Rules); err != nil {
		return nil, err
	}

	configJSON, err := json.Marshal(cfg)
	if err != nil {
		return nil, fmt.Errorf("序列化配置失败: %w", err)
	}

	record := &ConfigRecord{
		ConfigID:   cfg.ID,
		Name:       cfg.Name,
		Version:    cfg.Version,
		ConfigJSON: string(configJSON),
		IsActive:   false,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	if err := r.db.GormDB().Create(record).Error; err != nil {
		return nil, err
	}
	return record, nil
}

// Update 更新配置（按数据库 ID）
func (r *ConfigRepo) Update(dbID uint, cfg *rulespec.Config) error {
	// 校验配置 ID
	if err := rulespec.ValidateConfigID(cfg.ID); err != nil {
		return err
	}

	// 校验规则 ID
	if err := r.validateRuleIDs(cfg.Rules); err != nil {
		return err
	}

	configJSON, err := json.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}

	return r.db.GormDB().Model(&ConfigRecord{}).Where("id = ?", dbID).Updates(map[string]any{
		"config_id":   cfg.ID,
		"name":        cfg.Name,
		"version":     cfg.Version,
		"config_json": string(configJSON),
		"updated_at":  time.Now(),
	}).Error
}

// Delete 删除配置
func (r *ConfigRepo) Delete(id uint) error {
	return r.db.GormDB().Delete(&ConfigRecord{}, id).Error
}

// GetByID 根据数据库 ID 获取配置
func (r *ConfigRepo) GetByID(id uint) (*ConfigRecord, error) {
	var record ConfigRecord
	if err := r.db.GormDB().First(&record, id).Error; err != nil {
		return nil, err
	}
	return &record, nil
}

// GetByConfigID 根据配置业务 ID 获取配置
func (r *ConfigRepo) GetByConfigID(configID string) (*ConfigRecord, error) {
	var record ConfigRecord
	if err := r.db.GormDB().Where("config_id = ?", configID).First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &record, nil
}

// List 列出所有配置
func (r *ConfigRepo) List() ([]ConfigRecord, error) {
	var records []ConfigRecord
	if err := r.db.GormDB().Order("updated_at DESC").Find(&records).Error; err != nil {
		return nil, err
	}
	return records, nil
}

// SetActive 设置激活的配置（只能有一个激活）
func (r *ConfigRepo) SetActive(id uint) error {
	return r.db.GormDB().Transaction(func(tx *gorm.DB) error {
		// 先取消所有激活
		if err := tx.Model(&ConfigRecord{}).Where("is_active = ?", true).Update("is_active", false).Error; err != nil {
			return err
		}
		// 激活指定配置
		if err := tx.Model(&ConfigRecord{}).Where("id = ?", id).Update("is_active", true).Error; err != nil {
			return err
		}
		return nil
	})
}

// GetActive 获取当前激活的配置
func (r *ConfigRepo) GetActive() (*ConfigRecord, error) {
	var record ConfigRecord
	if err := r.db.GormDB().Where("is_active = ?", true).First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &record, nil
}

// ToRulespecConfig 将记录转换为 rulespec.Config
func (r *ConfigRepo) ToRulespecConfig(record *ConfigRecord) (*rulespec.Config, error) {
	if record == nil || record.ConfigJSON == "" {
		return nil, nil
	}

	var cfg rulespec.Config
	if err := json.Unmarshal([]byte(record.ConfigJSON), &cfg); err != nil {
		return nil, fmt.Errorf("解析配置失败: %w", err)
	}
	return &cfg, nil
}

// Save 保存配置（根据数据库 ID 判断新增或更新）
func (r *ConfigRepo) Save(dbID uint, cfg *rulespec.Config) (*ConfigRecord, error) {
	if dbID == 0 {
		// 创建新记录
		return r.Create(cfg)
	}
	// 更新现有记录
	if err := r.Update(dbID, cfg); err != nil {
		return nil, err
	}
	return r.GetByID(dbID)
}

// Upsert 导入配置（根据配置业务 ID 判断覆盖或新增）
func (r *ConfigRepo) Upsert(cfg *rulespec.Config) (*ConfigRecord, error) {
	// 校验配置 ID
	if err := rulespec.ValidateConfigID(cfg.ID); err != nil {
		return nil, err
	}

	// 校验规则 ID
	if err := r.validateRuleIDs(cfg.Rules); err != nil {
		return nil, err
	}

	// 查找是否存在相同配置 ID
	existing, err := r.GetByConfigID(cfg.ID)
	if err != nil {
		return nil, err
	}

	if existing != nil {
		// 存在则更新
		if err := r.Update(existing.ID, cfg); err != nil {
			return nil, err
		}
		return r.GetByID(existing.ID)
	}

	// 不存在则创建
	return r.Create(cfg)
}

// Rename 重命名配置（同时更新 ConfigJSON 中的 name）
func (r *ConfigRepo) Rename(id uint, newName string) error {
	// 获取现有记录
	record, err := r.GetByID(id)
	if err != nil {
		return err
	}

	// 解析配置
	cfg, err := r.ToRulespecConfig(record)
	if err != nil {
		return err
	}

	// 更新名称
	cfg.Name = newName

	// 重新序列化
	configJSON, err := json.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}

	return r.db.GormDB().Model(&ConfigRecord{}).Where("id = ?", id).Updates(map[string]any{
		"name":        newName,
		"config_json": string(configJSON),
		"updated_at":  time.Now(),
	}).Error
}

// validateRuleIDs 校验规则 ID 格式和唯一性
func (r *ConfigRepo) validateRuleIDs(rules []rulespec.Rule) error {
	seen := make(map[string]bool)
	for _, rule := range rules {
		// 校验格式
		if err := rulespec.ValidateRuleID(rule.ID); err != nil {
			return fmt.Errorf("规则 '%s': %w", rule.Name, err)
		}
		// 校验唯一性
		if seen[rule.ID] {
			return fmt.Errorf("规则 ID '%s' 重复", rule.ID)
		}
		seen[rule.ID] = true
	}
	return nil
}
