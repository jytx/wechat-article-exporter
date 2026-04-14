/**
 * 服务端导出工具函数
 */

/**
 * 保存文件到服务端导出路径
 * @param filename 文件名
 * @param blob 文件内容（Blob 对象）
 * @param exportPath 导出路径（可选，从设置中获取）
 * @returns 是否保存成功
 */
export async function saveFileToServer(filename: string, blob: Blob, exportPath?: string): Promise<boolean> {
  try {
    // 将 Blob 转换为 base64
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    // 调用服务端 API
    const response = await fetch('/api/web/data/v1/export/save-file', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        filename,
        content: base64,
        type: 'base64',
        exportPath
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('保存文件到服务端失败:', error);
      return false;
    }

    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error('saveFileToServer 失败:', error);
    return false;
  }
}

/**
 * 保存文本文件到服务端导出路径
 * @param filename 文件名
 * @param content 文件内容
 * @param exportPath 导出路径（可选，从设置中获取）
 * @returns 是否保存成功
 */
export async function saveTextFileToServer(filename: string, content: string, exportPath?: string): Promise<boolean> {
  try {
    // 调用服务端 API
    const response = await fetch('/api/web/data/v1/export/save-file', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        filename,
        content,
        type: 'utf8',
        exportPath
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('保存文件到服务端失败:', error);
      return false;
    }

    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error('saveTextFileToServer 失败:', error);
    return false;
  }
}
