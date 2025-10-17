import { WebSocketObj } from "../websocket";
import {
  TtsIdleState,
  WSSvr2ClientEvent,
  WSClient2SvrEvent,
} from "./config";
import emitter from "../event";
import { EMITT_EVENT_NAME } from "../event/event-name";


// ------------- 常量 ----------
/** 采样频率 */
const SAMPLE_RATE = 16000;
const MAX_BUFFER_CHUNKS = 10;  // 约 0.5 秒


let audioContext: AudioContext;
let audioWorkletNode: AudioWorkletNode;
/** 是否正在采集音频(State为ACTIVE的前提下) */
let isSendingAudio = false;
/** 音频缓冲区 */
let audioBuffer: Int16Array<ArrayBufferLike>[] = [];
/** 音频片段 */
let pcmData: Int16Array<ArrayBufferLike>[] = [];
/** TTS状态 */
let currentTtsState = TtsIdleState.IDLE;
/** 是否正在播放音频 */
let isTTSPlaying = false;
/** 当前TTS播放的音频源 */
let currentTTSSource: AudioBufferSourceNode | null;
let mp3Buffer: any[] = [];

let wsObj: any;

let addRecord: Function | null = null;
let setLastRecord: Function | null = null;

/** 初始化websocket和audio */
export function initWsAndAudio(addRecordCb: Function, setLastRecordCb: Function) { 
  addRecord = addRecordCb;
  setLastRecord = setLastRecordCb;

  wsObj = new WebSocketObj({
    wsUrl: '10.10.102.105:6088/ast/ws',
  });
  wsObj.connectWebsocket(onMessageCallback);
}

/** 返回websocket实例 */
export function getWsObj() {
  return wsObj;
}


/** websocket回调 */
async function onMessageCallback(event: any) {
  if (typeof event.data === 'string') {
    // 返回事件
    const msg = JSON.parse(event.data);
    handleControlMessage(msg);
  } else {
    // 返回语音
    handleBinaryAudio(event.data);
  }
}
// ---------------- websocket消息处理 ----------
/** ws返回的事件信息处理 */
function handleControlMessage(msg: any) {
  console.log('[V3] Message:', msg);
  
  switch (msg.event) {
    case WSSvr2ClientEvent.CONNECTED: {
      console.log("✅ websocket已连接");
      // 启动语音
      initAudio();
      break;
    }
    case WSSvr2ClientEvent.STATE_CHANGE: {
      console.log("✅ TTS状态已改变（语音识别开启/停止）: ", msg.state);
      currentTtsState = msg.state;
      break;
    }
    case WSSvr2ClientEvent.RESPONSE: {
      const { text = '', response_text: responseText = '', props: inputData = {} } = msg.data;
      if (setLastRecord) {
        setLastRecord({
          text,
          responseText,
        });
      }
      // handleAudioReg(inputData);
      break;
    }
    case WSSvr2ClientEvent.TTS_START: {
      if (currentTTSSource) {
        currentTTSSource.stop();
      }
      mp3Buffer = [];
      isTTSPlaying = true;
      break;
    }
    case WSSvr2ClientEvent.TTS_END:
      playMP3Buffer();
      break;
    case WSSvr2ClientEvent.ACTION:
      if (setLastRecord) {
        setLastRecord({
          responseText: msg.text,
        });
      }
      handleAction(msg.action, msg.ext);
      break;
    case WSSvr2ClientEvent.ERROR: {
      console.log("❌ TTS识别到错误: ", msg.error);
      break;
    }
  }
}
/** ws返回的TTS 音频接收 */
function handleBinaryAudio(arrayBuffer: any) {
  if (isTTSPlaying) {
    mp3Buffer.push(arrayBuffer);
  }
}

// ------------ 音频处理 ---------
/** 音频采集与VAD */
async function initAudio() {
  // 获取麦克风
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: SAMPLE_RATE,      // 16kHz
      channelCount: 1,        // Mono
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }
  });

  // 3. 初始化 AudioContext，并将语音传给worklet异步进行数据转换
  audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  await audioContext.audioWorklet.addModule('/vad/audio-worklet-processor.js');
  // 将麦克风stream创建为音频源
  const source = audioContext.createMediaStreamSource(micStream);
  audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');

  audioWorkletNode.port.onmessage = (event: any) => {
    if (event.data.type === 'audio') {
      handleAudioFromWorklet(event.data.data);
    }
  };
  // 处理链路：音频源 -> 音频处理器节点(Worklet处理，将音频转换为PCM16) -> 音频上下文的目标节点
  source.connect(audioWorkletNode);
  audioWorkletNode.connect(audioContext.destination);
  
  // 4. 初始化 VAD
  // @ts-ignore
  const vad = await window.vad.MicVAD.new({
    stream: micStream,
    // ⭐ speech start: 开始发送音频
    onSpeechStart: () => {
      if (isTTSPlaying) return; // 正在播放语音，不处理

      console.log('VAD: Speech start - 识别到讲话', audioBuffer.length);
      let prevFlag = isSendingAudio;
      if (isSendingAudio) {
        // 重复触发了start，将前一个的数据清空
        pcmData = [];
      }
      isSendingAudio = true;

      // 发送缓冲区（包含语音开头）
      audioBuffer.forEach(chunk => wsObj.sendJSON(chunk.buffer, false));
      if (currentTtsState === TtsIdleState.ACTIVE && prevFlag === false) {
        // 先插入一条记录
        if (addRecord) {
          addRecord({});
        }
      }
    },
    // ⭐ speech end: 停止发送音频 + 通知后端
    onSpeechEnd: () => {
      if (isTTSPlaying) return;

      console.log('VAD: Speech end - 讲话结束(识别到一句话结束)');
      isSendingAudio = false;
      
      // 通知后端：用户说完了，可以处理了
      if (currentTtsState === TtsIdleState.ACTIVE) {
        wsObj.sendJSON({ event: WSClient2SvrEvent.SPEECH_END });

        // 合并PCM数据
        // 计算总长度
        let totalLength = 0;
        for (const chunk of pcmData) {
          totalLength += chunk.length;
        }
        const mergePcm = new Int16Array(totalLength);
        let offset = 0;
        for (const chunk of pcmData) {
          mergePcm.set(chunk, offset);
          offset += chunk.length;
        }

        const audioUrl = createWavUrl(mergePcm, audioContext.sampleRate);

        // 将audioBuffer转为<audio>标签可播放的数据
        if (setLastRecord) {
          setLastRecord({
            url: audioUrl,
          });
        }
      }

      // 清空缓冲区
      audioBuffer = [];
      pcmData = [];
    },
    // VAD 配置
    positiveSpeechThreshold: 0.8,
    negativeSpeechThreshold: 0.75,
    // CDN 路径
    onnxWASMBasePath: "/vad/onnx-wasm/",
    baseAssetPath: "/vad/asset/"
  });

  await vad.start();
  console.log("✅ VAD已启动");
}

/** worklet线程异步将语音转换完成，接收处理 */
function handleAudioFromWorklet(arrayBuffer: any) {
  if (isTTSPlaying) return;
  
  // 维护缓冲区
  audioBuffer.push(arrayBuffer);
  if (audioBuffer.length > MAX_BUFFER_CHUNKS) {
    audioBuffer.shift();
  }
  if (isSendingAudio) {
    pcmData.push(arrayBuffer);

    // 发送音频
    wsObj.sendJSON(arrayBuffer.buffer, false);
  }
}

/** 执行某动作 */
function handleAction(action: EMITT_EVENT_NAME, ext: object) {
  emitter.emit(action, ext);
}

/** TTS 播放 */
async function playMP3Buffer() {
  const bufferToPlay = [...mp3Buffer];
  mp3Buffer = [];
  
  if (bufferToPlay.length === 0) return;
  
  try {
    const totalLength = bufferToPlay.reduce((sum, buf) => sum + buf.byteLength, 0);
    const mergedBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of bufferToPlay) {
      mergedBuffer.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }
    
    const ttsAudioContext = new AudioContext();
    const audiofBuffer = await ttsAudioContext.decodeAudioData(mergedBuffer.buffer);
    
    const source = ttsAudioContext.createBufferSource();
    source.buffer = audiofBuffer;
    source.connect(ttsAudioContext.destination);
    
    currentTTSSource = source;
    
    source.onended = () => {
      if (currentTTSSource === source) {
        isTTSPlaying = false;
        currentTTSSource = null;
      }
      ttsAudioContext.close();
    };
    
    source.start(0);
  } catch (error) {
    console.error('[V3] TTS error:', error);
  }
}

/** 创建audio播放链接 */
function createWavUrl(pcmData: Int16Array, sampleRate: number) {
  // 创建WAV文件，用于播放
  const wavBlob = createWavBlob(pcmData, sampleRate);
  const wavUrl = URL.createObjectURL(wavBlob);
  return wavUrl;
}

/** 创建WAV文件Blob */
function createWavBlob(pcmData: Int16Array, sampleRate: number): Blob {
  const numChannels = 1; // 单声道
  const byteRate = sampleRate * numChannels * 2; // 16位 = 2字节
  
  // 创建WAV文件头 (44字节)
  const buffer = new ArrayBuffer(44 + pcmData.length * 2);
  const view = new DataView(buffer);
  
  // RIFF头
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmData.length * 2, true); // 文件总长度
  writeString(view, 8, 'WAVE');
  
  // fmt子块
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt块长度
  view.setUint16(20, 1, true); // PCM格式
  view.setUint16(22, numChannels, true); // 声道数
  view.setUint32(24, sampleRate, true); // 采样率
  view.setUint32(28, byteRate, true); // 字节率
  view.setUint16(32, numChannels * 2, true); // 块对齐
  view.setUint16(34, 16, true); // 位深度
  
  // data子块
  writeString(view, 36, 'data');
  view.setUint32(40, pcmData.length * 2, true); // 数据长度
  
  // 写入PCM数据 (16位小端)
  const dataOffset = 44;
  for (let i = 0; i < pcmData.length; i++) {
    view.setInt16(dataOffset + i * 2, pcmData[i], true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

/** 向DataView写入字符串 */
function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
