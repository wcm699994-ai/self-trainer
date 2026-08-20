export const templates = [
  {
    key: 'routine',
    name: '作息校准版',
    description: '适合希望稳定作息、减少时间黑洞的用户',
    indicators: {
      loss: [
        {
          name: '入睡时间偏差',
          unit: '分钟',
          target: 0,
          weight: 1,
          note: '记录实际入睡时间与计划时间的差值（越小越好）'
        },
        {
          name: '屏幕使用时长',
          unit: '小时',
          target: 2,
          weight: 1,
          note: '手机 + 电脑非工作使用时间（越小越好）'
        },
        {
          name: '未完成核心任务数',
          unit: '个',
          target: 0,
          weight: 1,
          note: '当日计划但未完成的重要任务数量（越小越好）'
        }
      ],
      gain: [
        {
          name: '户外活动时长',
          unit: '分钟',
          target: 30,
          weight: 1,
          note: '白天在户外自然光下的时间（越大越好）'
        },
        {
          name: '阅读时长',
          unit: '分钟',
          target: 20,
          weight: 1,
          note: '纸质书或电子书阅读时间（越大越好）'
        },
        {
          name: '运动时长',
          unit: '分钟',
          target: 20,
          weight: 1,
          note: '任何形式的主动运动（越大越好）'
        }
      ]
    }
  },
  {
    key: 'student',
    name: '学生备考版',
    description: '适合备考阶段，关注专注与任务完成',
    indicators: {
      loss: [
        {
          name: '未完成学习任务数',
          unit: '个',
          target: 0,
          weight: 1,
          note: '当天计划但未完成的学习任务（越小越好）'
        },
        {
          name: '分心次数',
          unit: '次',
          target: 3,
          weight: 1,
          note: '学习过程中主动分心的次数（越小越好）'
        },
        {
          name: '屏幕娱乐时长',
          unit: '小时',
          target: 1,
          weight: 1,
          note: '非学习用途的屏幕时间（越小越好）'
        }
      ],
      gain: [
        {
          name: '专注学习时长',
          unit: '小时',
          target: 4,
          weight: 1,
          note: '深度专注学习时间（越大越好）'
        },
        {
          name: '运动时长',
          unit: '分钟',
          target: 30,
          weight: 1,
          note: '保持身体活跃（越大越好）'
        },
        {
          name: '睡眠时长',
          unit: '小时',
          target: 7.5,
          weight: 1,
          note: '夜间实际睡眠时间（越大越好）'
        }
      ]
    }
  },
  {
    key: 'work',
    name: '职场效率版',
    description: '适合职场人，聚焦深度工作与加班控制',
    indicators: {
      loss: [
        {
          name: '未完成工作事项',
          unit: '个',
          target: 0,
          weight: 1,
          note: '当日计划但未完成的工作事项（越小越好）'
        },
        {
          name: '加班时长',
          unit: '小时',
          target: 0.5,
          weight: 1,
          note: '非计划加班时间（越小越好）'
        },
        {
          name: '分心打断次数',
          unit: '次',
          target: 3,
          weight: 1,
          note: '工作过程中被非必要事项打断的次数（越小越好）'
        }
      ],
      gain: [
        {
          name: '深度工作时长',
          unit: '小时',
          target: 3,
          weight: 1,
          note: '无干扰深度工作时间（越大越好）'
        },
        {
          name: '运动时长',
          unit: '分钟',
          target: 30,
          weight: 1,
          note: '任何形式的主动运动（越大越好）'
        },
        {
          name: '阅读或学习时长',
          unit: '分钟',
          target: 20,
          weight: 1,
          note: '非工作阅读/学习时间（越大越好）'
        }
      ]
    }
  }
];
