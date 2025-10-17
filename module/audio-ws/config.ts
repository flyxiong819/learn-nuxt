
/** websocket返回的事件 */
export enum WSSvr2ClientEvent {
  /** WS连接成功 */
  CONNECTED = 'connected',
  /** TTS状态变化，idle | active*/
  STATE_CHANGE = 'state',
  /** 响应数据 */
  RESPONSE = 'response',
  /** TTS音频返回 开始 */
  TTS_START = 'tts_start',
  /** TTS音频返回 结束 */
  TTS_END = 'tts_end',

  /** 执行动作 */
  ACTION = 'action',
  /** 错误消息 */
  ERROR = 'error',
}

/** 发送给后端的事件 */
export enum WSClient2SvrEvent {
  /** 语音结束(一句话说完了)，只有在active状态下才会有数据  */
  SPEECH_END = 'speech_end',
  /** 配置更新，obs | gyn  */
  CONFIG_UPDATE = 'config',
  /** 手动唤醒 */
  WAKE_UP = 'wake',
  /** 手动退出 */
  EXIT = 'exit',
}

/** 当前语音闲置状态 */
export enum TtsIdleState {
  /** 闲置中 */
  IDLE = 'idle',
  /** 激活中 */
  ACTIVE = 'active',
}
