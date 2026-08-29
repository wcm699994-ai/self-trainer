import { describe, it, expect } from 'vitest';
import {
  computeDailyScores,
  movingAverage,
  generateSuggestion,
  generateReviewConclusion,
  getRestReminders
} from './rulesEngine';

const config = {
  lossIndicators: [
    { id: 'l1', name: '屏幕时长', unit: 'h', target: 2, weight: 1 }
  ],
  gainIndicators: [
    { id: 'g1', name: '运动时长', unit: 'min', target: 30, weight: 1 }
  ]
};

const rec = (date, screen, sport, tags = []) => ({
  date,
  values: { l1: screen, g1: sport },
  tags
});

describe('computeDailyScores', () => {
  it('损失超标得分为正，达标为 0', () => {
    const scores = computeDailyScores(config, [rec('2026-08-20', 3, 30)]);
    expect(scores).toHaveLength(1);
    expect(scores[0].lossScore).toBeCloseTo(0.5);
    expect(scores[0].gainScore).toBeCloseTo(0);
  });

  it('增益不足得分为正', () => {
    const scores = computeDailyScores(config, [rec('2026-08-20', 2, 15)]);
    expect(scores[0].gainScore).toBeCloseTo(0.5);
  });

  it('空 values 的记录不产生得分', () => {
    const scores = computeDailyScores(config, [
      { date: '2026-08-20', values: {} }
    ]);
    expect(scores).toHaveLength(0);
  });

  it('结果按日期升序', () => {
    const scores = computeDailyScores(config, [
      rec('2026-08-22', 2, 30),
      rec('2026-08-21', 2, 30)
    ]);
    expect(scores.map((s) => s.date)).toEqual(['2026-08-21', '2026-08-22']);
  });
});

describe('movingAverage', () => {
  it('按窗口滚动平均', () => {
    const data = [
      { date: '1', lossScore: 1, gainScore: null },
      { date: '2', lossScore: 2, gainScore: null },
      { date: '3', lossScore: 3, gainScore: null }
    ];
    const ma = movingAverage(data, 2);
    expect(ma[0].lossMA).toBeCloseTo(1);
    expect(ma[2].lossMA).toBeCloseTo(2.5);
  });
});

describe('generateSuggestion', () => {
  it('无数据时提示先录入', () => {
    const s = generateSuggestion(config, []);
    expect(s.text).toContain('暂无数据');
  });

  it('样本不足时不生成建议', () => {
    const s = generateSuggestion(config, [rec('2026-08-28', 5, 0)]);
    expect(s.text).toContain('样本不足');
  });

  it('偏差超阈值且样本充足时生成降低建议', () => {
    const records = [
      rec('2026-08-25', 5, 0),
      rec('2026-08-26', 5, 0),
      rec('2026-08-27', 5, 0),
      rec('2026-08-28', 5, 0)
    ];
    const s = generateSuggestion(config, records);
    expect(s.text).toContain('屏幕时长');
    expect(s.text).toContain('降低');
  });

  it('存在干扰标签时步长减半', () => {
    const records = [
      rec('2026-08-25', 5, 0, ['生病']),
      rec('2026-08-26', 5, 0),
      rec('2026-08-27', 5, 0),
      rec('2026-08-28', 5, 0)
    ];
    const s = generateSuggestion(config, records);
    expect(s.text).toContain('步长已减半');
  });
});

describe('generateReviewConclusion', () => {
  it('无数据时返回暂无数据', () => {
    const c = generateReviewConclusion(config, []);
    expect(c.trend).toBe('暂无数据');
  });
});

describe('getRestReminders', () => {
  it('少于 3 条记录不提醒', () => {
    expect(getRestReminders(config, [rec('2026-08-28', 2, 30)])).toEqual([]);
  });

  it('连续 7 天无休息标记时提醒', () => {
    const records = [];
    for (let i = 1; i <= 7; i++) {
      records.push(rec(`2026-08-${20 + i}`, 2, 30));
    }
    const reminders = getRestReminders(config, records);
    expect(reminders.some((r) => r.includes('连续 7 天'))).toBe(true);
  });

  it('近期有休息标记时不提醒', () => {
    const records = [];
    for (let i = 1; i <= 7; i++) {
      records.push(rec(`2026-08-${20 + i}`, 2, 30, ['生病']));
    }
    const reminders = getRestReminders(config, records);
    expect(reminders.some((r) => r.includes('连续 7 天'))).toBe(false);
  });
});
