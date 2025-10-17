export class MyAudio {
  constructor(visualizeCanvas?: HTMLCanvasElement) {
    this.visualizeCanvas = visualizeCanvas;
  }

  /** 语音可视化canvas */
  visualizeCanvas: HTMLCanvasElement | undefined = undefined;
  
  /** 媒体流对象 */
  mediaStream: MediaStream | null = null;
  /** 音频上下文 */
  audioContext: AudioContext | null = null;
  /** 音频处理节点 */
  scriptProcessor: ScriptProcessorNode | null = null;
  /** 录音数据 (PCM格式) */
  pcmChunks: Int16Array[] = [];
  /** 标记录音状态 */
  isRecording = false;
  /** 动画帧ID */
  animationFrameId: number | null = null;
  /** 分析器节点 */
  analyser: AnalyserNode | null = null;

  /** 开始录音 */
  async startAudio() {
    console.log('开始录音...');
    /** 如果正在录音，不需要再开始录音 */
    if (this.isRecording) return;
    this.isRecording = true;
    this.pcmChunks = [];

    try {
      // 检查浏览器是否支持录音
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('浏览器不支持录音功能。要么是因为浏览器不支持，要么是没有HTTPS。');
      }

      // 请求麦克风权限
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // 创建音频上下文
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // 创建分析器节点
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      
      // 创建脚本处理器
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      // 连接节点：麦克风 -> 分析器 -> 脚本处理器 -> 输出
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);
      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);
      
      // 设置脚本处理器回调
      this.scriptProcessor.onaudioprocess = (event) => {
        if (!this.isRecording) return;
        
        // 获取输入缓冲区的PCM数据
        const inputBuffer = event.inputBuffer;
        const channelData = inputBuffer.getChannelData(0);
        
        // 将浮点PCM转换为16位整数格式
        const pcmData = new Int16Array(channelData.length);
        for (let i = 0; i < channelData.length; i++) {
          // 将浮点数(-1到1)转换为16位整数(-32768到32767)
          pcmData[i] = Math.max(-1, Math.min(1, channelData[i])) * 32767;
        }

        // TODO: websocket发送给后端


        // 存储PCM数据
        this.pcmChunks.push(pcmData);
      };

      // 可视化语音
      if (this.visualizeCanvas) {
        this.visualize(this.analyser, this.visualizeCanvas);
      }

      console.log('录音已开始...');
    } catch (error) {
      console.error('录音失败：', error);
      this.isRecording = false;
      this.cleanup();
      throw error;
    }
  }

  /** 停止录音并返回录音文件 */
  async stopAudio(): Promise<{
    file?: File;
    url?: string;
    pcmData?: Int16Array;
  }> {
    // 如果没有在录音，直接返回空
    if (!this.isRecording) {
      return {};
    }
    this.isRecording = false;

    try {
      // 停止可视化
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }

      // 合并所有PCM数据块
      if (this.pcmChunks.length > 0) {
        // 计算总长度
        let totalLength = 0;
        for (const chunk of this.pcmChunks) {
          totalLength += chunk.length;
        }
        
        // 合并所有PCM数据
        const mergedPcm = new Int16Array(totalLength);
        let offset = 0;
        for (const chunk of this.pcmChunks) {
          mergedPcm.set(chunk, offset);
          offset += chunk.length;
        }

        // 创建WAV文件，用于播放
        const wavBlob = this.createWavBlob(mergedPcm);
        // const wavFile = new File([wavBlob], 'recording.wav', { type: 'audio/wav' });
        const wavUrl = URL.createObjectURL(wavBlob);
        
        // 创建pcm文件，用于传递给后端接口
        const pcmBlob = new Blob([mergedPcm], { type: 'application/octet-stream' });
        const pcmFile = new File([pcmBlob], 'recording.pcm', { type: 'application/octet-stream' });

        return {
          file: pcmFile,
          url: wavUrl,
          // pcmData: mergedPcm
        };
      }

      // 断开节点连接
      this.cleanup();

      return {};
    } catch (error) {
      console.error('停止录音失败：', error);
      // 断开节点连接
      this.cleanup();
      return {};
    }
  }

  /** 清理资源 */
  private cleanup() {
    // 断开所有音频节点
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    
    // 关闭音频上下文
    if (this.audioContext) {
      this.audioContext.close().catch(e => console.error('关闭音频上下文失败:', e));
      this.audioContext = null;
    }
    
    // 停止所有媒体轨道
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }

  /** 创建WAV文件Blob */
  private createWavBlob(pcmData: Int16Array): Blob {
    if (!this.audioContext) {
      throw new Error('音频上下文未初始化');
    }
    
    const sampleRate = this.audioContext.sampleRate;
    const numChannels = 1; // 单声道
    const byteRate = sampleRate * numChannels * 2; // 16位 = 2字节
    
    // 创建WAV文件头 (44字节)
    const buffer = new ArrayBuffer(44 + pcmData.length * 2);
    const view = new DataView(buffer);
    
    // RIFF头
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.length * 2, true); // 文件总长度
    this.writeString(view, 8, 'WAVE');
    
    // fmt子块
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // fmt块长度
    view.setUint16(20, 1, true); // PCM格式
    view.setUint16(22, numChannels, true); // 声道数
    view.setUint32(24, sampleRate, true); // 采样率
    view.setUint32(28, byteRate, true); // 字节率
    view.setUint16(32, numChannels * 2, true); // 块对齐
    view.setUint16(34, 16, true); // 位深度
    
    // data子块
    this.writeString(view, 36, 'data');
    view.setUint32(40, pcmData.length * 2, true); // 数据长度
    
    // 写入PCM数据 (16位小端)
    const dataOffset = 44;
    for (let i = 0; i < pcmData.length; i++) {
      view.setInt16(dataOffset + i * 2, pcmData[i], true);
    }
    
    return new Blob([view], { type: 'audio/wav' });
  }
  
  /** 向DataView写入字符串 */
  private writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  /** 语音可视化 */
  private visualize(analyser: AnalyserNode, canvas: HTMLCanvasElement) {
    if (!analyser) return;
    
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      if (!this.isRecording) return;
      
      this.animationFrameId = requestAnimationFrame(draw);
      
      // 获取频率数据
      analyser.getByteFrequencyData(dataArray);
      
      // 设置画布尺寸
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      
      const WIDTH = canvas.width;
      const HEIGHT = canvas.height;
      
      // 清除画布
      canvasCtx.fillStyle = 'rgb(240, 240, 240)';
      canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);
      
      // 绘制频谱
      const barWidth = (WIDTH / bufferLength) * 2.5;
      let barHeight;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * HEIGHT;
        
        // 创建渐变效果
        const gradient = canvasCtx.createLinearGradient(0, 0, 0, barHeight);
        gradient.addColorStop(0, 'rgb(0, 150, 255)');
        gradient.addColorStop(1, 'rgb(0, 50, 150)');
        
        canvasCtx.fillStyle = gradient;
        canvasCtx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight);
        
        x += barWidth + 1;
      }
    };
    
    draw();
  }
}