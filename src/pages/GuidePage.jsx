export default function GuidePage() {
  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="font-medium">项目介绍</h2>
        <p className="mt-2 text-sm leading-6 text-gray-700">
          SelfTrainer 是一款将「机器学习模型训练范式」迁移到个人行为优化的本地优先工具。
          你将行为目标拆解为损失指标与增益指标，每天用数字记录行为，系统根据目标偏差率
          生成一条梯度微调建议，帮助你稳定收敛到目标状态。
        </p>
        <p className="mt-1 text-sm leading-6 text-gray-700">
          核心闭环完全本地运行，断网可用。AI 仅作为可选增强插件，用于辅助生成指标配置和
          周度深度复盘，不侵入核心流程。
        </p>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="font-medium">DeepSeek API Key 获取步骤</h2>
        <ol className="mt-2 list-decimal list-inside text-sm leading-7 text-gray-700">
          <li>打开 DeepSeek 开放平台官网：platform.deepseek.com</li>
          <li>注册并登录账号</li>
          <li>进入「API Keys」页面，点击创建 API Key</li>
          <li>填写名称后创建，复制生成的 sk- 开头密钥</li>
          <li>回到 SelfTrainer 的「配置」页，将 API Key 粘贴到输入框</li>
          <li>点击「保存」，再点击「测试连接」确认可用</li>
        </ol>
        <p className="mt-2 text-xs text-gray-500">
          SelfTrainer 已固定使用 DeepSeek 官方服务，无需填写 API 访问地址和模型名称。
        </p>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="font-medium">AI 生成指标操作流程</h2>
        <ol className="mt-2 list-decimal list-inside text-sm leading-7 text-gray-700">
          <li>在「配置」页确认已填入有效 DeepSeek API Key</li>
          <li>在「AI 辅助生成指标」区域，用一句大白话描述目标</li>
          <li>点击「生成」，AI 会返回损失指标和增益指标候选方案</li>
          <li>检查预览内容，确认指标合理后点击「确认导入」</li>
          <li>确认后指标配置生效，可在首页开始每日录入</li>
        </ol>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="font-medium">指标规则讲解</h2>
        <ul className="mt-2 list-disc list-inside text-sm leading-7 text-gray-700">
          <li><strong>损失指标：</strong>越小越好，如屏幕使用时长、未完成任务数</li>
          <li><strong>增益指标：</strong>越大越好，如运动时长、专注时长</li>
          <li><strong>单日统计口径：</strong>所有指标只统计当天发生量，禁止周累计或月累计</li>
          <li><strong>基准值约束：</strong>每项指标必须设置目标基准值；损失指标和增益指标各最多 3 项，总计不超过 6 项</li>
          <li><strong>建议目标基准值不为 0：</strong>目标为 0 时仅作记录，系统无法生成有效调参建议，建议使用合理正向基准值</li>
        </ul>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="font-medium">完整使用流程</h2>
        <ol className="mt-2 list-decimal list-inside text-sm leading-7 text-gray-700">
          <li>在「配置」页导入内置模板，或使用 AI 辅助生成指标</li>
          <li>在「今日训练」页录入当天每个指标的实际数值</li>
          <li>可选添加标签：正常、生病、突发事件</li>
          <li>提交后系统自动生成一条今日梯度建议</li>
          <li>每天重复录入，坚持记录单日数据</li>
          <li>每周进入「复盘」页查看损失/增益趋势和调参建议</li>
          <li>定期在「配置」页导出 JSON/CSV 备份数据</li>
        </ol>
      </section>
    </div>
  );
}
