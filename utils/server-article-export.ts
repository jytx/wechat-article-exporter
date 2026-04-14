/**
 * 服务端文章导出工具函数
 */

import TurndownService from 'turndown';
import { parseCgiDataNew } from '#shared/utils/html';
import { renderHTMLFromCgiDataNew } from '#shared/utils/renderer';
import { getArticleHtmlFromServer } from './server-html';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

export interface ExportArticleItem {
  url: string;
  title: string;
  fakeid: string;
  accountName: string;
}

/**
 * 导出文章到服务端
 * @param articles 要导出的文章列表
 * @param format 导出格式
 * @param exportPath 导出路径
 * @param onProgress 进度回调
 * @returns 导出结果
 */
export async function exportArticlesToServer(
  articles: ExportArticleItem[],
  format: 'markdown' | 'html' | 'txt',
  exportPath: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; message: string; results: any[] }> {
  try {
    if (!exportPath || exportPath === '') {
      return {
        success: false,
        message: '请先设置导出路径',
        results: [],
      };
    }

    const exportData = [];

    // 处理每篇文章
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];

      try {
        console.log('准备导出文章:', article);

        // 验证必需字段
        if (!article.url) {
          throw new Error('文章 URL 为空');
        }
        if (!article.title) {
          throw new Error('文章标题为空');
        }
        if (!article.accountName) {
          throw new Error('公众号名称为空');
        }

        // 获取文章 HTML
        const cached = await getArticleHtmlFromServer(article.url);
        if (!cached) {
          throw new Error('文章内容尚未下载');
        }

        const html = cached.content;
        let content = '';

        // 根据格式转换内容
        switch (format) {
          case 'html':
            content = html;
            break;
          case 'markdown':
            const cgiData = await parseCgiDataNew(html);
            if (!cgiData) {
              throw new Error('无法解析文章数据');
            }
            const renderedHTML = await renderHTMLFromCgiDataNew(cgiData, false);
            const cleaned = renderedHTML
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
              .replace(/\sstyle="[^"]*"/gi, '');
            content = turndownService.turndown(cleaned);
            break;
          case 'txt':
            const cgiDataTxt = await parseCgiDataNew(html);
            if (!cgiDataTxt) {
              throw new Error('无法解析文章数据');
            }
            const renderedHTMLTxt = await renderHTMLFromCgiDataNew(cgiDataTxt, false);
            // 移除 HTML 标签获取纯文本
            content = renderedHTMLTxt
              .replace(/<[^>]+>/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            break;
        }

        const exportItem = {
          url: article.url,
          title: article.title,
          fakeid: article.fakeid || '',
          accountName: article.accountName,
          content,
        };

        console.log('添加导出项:', exportItem);

        exportData.push(exportItem);

        // 更新进度
        if (onProgress) {
          onProgress(i + 1, articles.length);
        }
      } catch (error) {
        console.error(`处理文章 ${article.title} 失败:`, error);
        throw error;
      }
    }

    console.log('准备发送到服务器的数据:', {
      articlesCount: exportData.length,
      format,
      exportPath,
    });

    // 调用服务端 API
    const response = await fetch('/api/web/data/v1/export/articles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        articles: exportData,
        format,
        exportPath,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        message: errorData.message || '导出失败',
        results: [],
      };
    }

    const result = await response.json();

    return {
      success: result.success,
      message: `导出完成！成功: ${result.data.successCount}, 失败: ${result.data.failCount}`,
      results: result.data.results,
    };
  } catch (error) {
    console.error('exportArticlesToServer 失败:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '导出失败',
      results: [],
    };
  }
}
