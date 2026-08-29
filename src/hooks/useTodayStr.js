import { useEffect, useState } from 'react';
import { toDateStr, todayStr } from '../lib/date';

// 跨天感知：每分钟校准一次“今天”，页面无需各自实现定时器
export function useTodayStr() {
  const [today, setToday] = useState(todayStr);

  useEffect(() => {
    const timer = setInterval(() => {
      const next = toDateStr(new Date());
      setToday((prev) => (prev !== next ? next : prev));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  return today;
}
