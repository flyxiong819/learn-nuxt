
/** emitt事件名称 */
export enum EMITT_EVENT_NAME {
  /** 保存数据 */
  saveData = 'save_data',
  /** 查看报告 */
  viewReport = 'view_report',
  
  /** 返回 */
  backHome = 'return_to_main',
  /** 返回 */
  navigateBack = 'navigate_back',
  /** 返回 */
  return = 'return',
  /** 返回 */
  back = 'back',
  
  /** 打印 */
  print = 'print',
  /** 打印 */
  printReport = 'print_report',

  /** 选择检查单 */
  selectChecklist = 'select_checklist',
  /** 选择图片 */
  selectImage = 'select_image',
  /** 选择多张图片 */
  selectImages = 'select_images',
  /** 删除图片 */
  deleteImage = 'delete_image',
  /** 删除多张图片 */
  deleteImages = 'delete_images',
}
