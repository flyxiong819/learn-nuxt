export class MyAudio {
  constructor(visualizeCanvas?: HTMLCanvasElement) {
    this.visualizeCanvas = visualizeCanvas;
  }

  /** 语音可视化canvas */
  visualizeCanvas: HTMLCanvasElement | undefined = undefined;

  /** 媒体流对象 */
  mediaStream: MediaStream | null = null
  /** 录音对象 */
  recorder: MediaRecorder | null = null
  /** 录音数据 */
  audioChunks: BlobPart[] = []
  /** 标记录音状态 */
  isRecording = false

  /** 开始录音 */
  async startAudio() {
    console.log('开始录音...')
    /** 如果正在录音，不需要再开始录音 */
    if (this.isRecording) return
    this.isRecording = true
    this.audioChunks = []
  
    try {
      // 检查浏览器是否支持录音
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('浏览器不支持录音功能。要么是因为浏览器不支持，要么是没有HTTPS。')
      }

      // 请求麦克风权限
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // 创建MediaRecorder对象
      this.recorder = new MediaRecorder(this.mediaStream)

      // 可视化语音
      if (this.visualizeCanvas) {
        this.visualize(this.mediaStream, this.visualizeCanvas);
      }

      // 监听数据可用事件
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }

      // 开始录音
      this.recorder.start()
      console.log('开始录音...')
    } catch (error) {
      console.error('录音失败：', error)

      // 录音失败，重置状态
      this.isRecording = false
      if (this.recorder && this.recorder.state !== 'inactive') {
        this.recorder.stop()
      }
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop())
        this.mediaStream = null
      }

      throw error;
    }
  }

  /** 停止录音并返回录音文件 */
  async stopAudio(): Promise<{
    file?: File,
    url?: string,
   }> {
    // 如果没有在录音，直接返回null
    if (!this.isRecording) {
      return {}
    }
    this.isRecording = false

    try {
      // 停止录音
      if (this.recorder && this.recorder.state !== 'inactive') {
        this.recorder.stop()
      }

      // 等待100毫秒，确保数据可用事件被触发
      await new Promise(resolve => setTimeout(resolve, 100))

      // 停止所有音频轨道
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop())
        this.mediaStream = null
      }

      // 创建音频文件
      if (this.audioChunks.length > 0) {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' })
        // const arrayBuf = await audioBlob.arrayBuffer()
        const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm;codecs=opus' })

        // 播放录音（可选）
        const audioURL = URL.createObjectURL(audioBlob)
        // const audio = new Audio(audioURL)
        // await audio.play().catch(error => {
        //   console.log('播放失败', error)
        // });

        return {
          file: audioFile,
          url: audioURL,
        };
      }

      return {}
    } catch (error) {
      console.error('录音失败：', error)
      return {}
    }
  }

  /** 语音可视化 */

  visualize(stream: MediaStream, canvas: HTMLCanvasElement) {
    const audioCtx = new AudioContext();

    const source = audioCtx.createMediaStreamSource(stream);

    const bufferLength = 2048;
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = bufferLength;
    const dataArray = new Uint8Array(bufferLength);

    source.connect(analyser);

    const canvasCtx = canvas.getContext("2d")!;
    draw();

    function draw() {
      const WIDTH = canvas.width;
      const HEIGHT = canvas.height;

      requestAnimationFrame(draw);

      analyser.getByteTimeDomainData(dataArray);

      canvasCtx.fillStyle = "rgb(200, 200, 200)";
      canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = "rgb(0, 0, 0)";

      canvasCtx.beginPath();

      let sliceWidth = (WIDTH * 1.0) / bufferLength;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        let v = (dataArray[i] ?? 0) / 128.0;
        let y = (v * HEIGHT) / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasCtx.lineTo(canvas.width, canvas.height / 2);
      canvasCtx.stroke();
    }
  }
}