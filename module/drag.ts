
/** 标记是否正在拖拽 */
let isDragging = false;


/**
 * 拖拽移动fixed元素
 * example:
 * <div 
 *  :style="{
 *    right: audioStyle.right + 'px',
 *    top: audioStyle.top + 'px',
 *  }"
 *  @mousedown="(e: MouseEvent) => handleDragFixedDom(e, audioStyle)">
 * </div>
 */
export function handleDragFixedDom(e: MouseEvent, domStyle: {
  /** top/bottom必传1个 */
  top?: number;
  bottom?: number;

  /** left/right必传1个 */
  left?: number;
  right?: number;
}) {
  if (domStyle.top === undefined && domStyle.bottom === undefined
    || domStyle.left === undefined && domStyle.right === undefined 
  ) {
    return;
  }
  isDragging = true;
  // 记录初始位置
  const startX = e.clientX;
  const startY = e.clientY;

  const startTop = domStyle.top;
  const startBottom = domStyle.bottom;
  const startLeft = domStyle.left;
  const startRight = domStyle.right;

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) {
      return;
    }
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (domStyle.top !== undefined && startTop !== undefined) {
      domStyle.top = startTop + dy;
    }
    if (domStyle.bottom !== undefined && startBottom !== undefined) {
      domStyle.bottom = startBottom - dy;
    }
    if (domStyle.left !== undefined && startLeft !== undefined) {
      domStyle.left = startLeft + dx;
    }
    if (domStyle.right !== undefined && startRight !== undefined) {
      domStyle.right = startRight - dx;
    }
  }

  const onMouseUp = () => {
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}
