




/** 创建audio播放链接 */
export function createWavUrl(pcmData: Int16Array, sampleRate: number) {
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
