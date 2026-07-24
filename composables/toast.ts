/**
 * 全局消息提示封装
 *
 * 对外签名保持与旧版一致（success/info/warning/error），
 * 底层从 Nuxt UI useToast 改为 Element Plus ElNotification。
 */
import { ElNotification } from 'element-plus';

/** 消息显示时长（毫秒），与旧版保持一致 */
const DURATION: number = 5000;

export default () => {
  function success(title: string, description: string = ''): void {
    ElNotification({
      type: 'success',
      title: title,
      message: description || undefined,
      duration: DURATION,
    });
  }

  function info(title: string, description: string = ''): void {
    ElNotification({
      type: 'info',
      title: title,
      message: description || undefined,
      duration: DURATION,
    });
  }

  function warning(title: string, description: string = ''): void {
    ElNotification({
      type: 'warning',
      title: title,
      message: description || undefined,
      duration: DURATION,
    });
  }

  function error(title: string, description: string = ''): void {
    ElNotification({
      type: 'error',
      title: title,
      message: description || undefined,
      duration: DURATION,
    });
  }

  return {
    info,
    warning,
    success,
    error,
  };
};
