import { format } from 'date-fns';
import JSZip from 'jszip';
import TurndownService from 'turndown';
import { parseCgiDataNew } from '#shared/utils/html';
import { renderHTMLFromCgiDataNew } from '#shared/utils/renderer';
import type { DownloadableArticle } from '~/types/types';
import { downloadArticleHTMLs } from '~/utils';
import { saveFileToServer } from '~/utils/server-export';

/**
 * 批量下载合集文章（完全参考单个文章下载的逻辑）
 */
export function useDownloadAlbum() {
  const loading = ref(false);
  const phase = ref();
  const downloadedCount = ref(0);
  const packedCount = ref(0);

  async function download(articles: DownloadableArticle[], filename: string, exportPath: string) {
    loading.value = true;

    try {
      phase.value = '下载文章内容';
      const results = await downloadArticleHTMLs(articles, (count: number) => {
        downloadedCount.value = count;
      });

      phase.value = '转换并打包';
      const zip = new JSZip();
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
      });

      for (const article of results) {
        try {
          // 使用已下载的 HTML 内容
          const renderedHTML = await getRenderedHTML(article.url, article.html);

          if (!renderedHTML) {
            console.warn(`文章 ${article.title} 无法获取渲染后的 HTML，跳过`);
            continue;
          }

          // 在转 Markdown 前，移除 style 标签和内联样式（与单个文章下载一致）
          const cleaned = renderedHTML.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/\sstyle="[^"]*"/gi, '');

          // 转换为 Markdown
          const markdown = turndownService.turndown(cleaned);

          // 生成文件夹名（日期 + 标题）
          const folderName =
            format(new Date(+article.date * 1000), 'yyyy-MM-dd') + ' ' + article.title.replace(/[\/\\?%*:|"<>]/g, '_');
          const folder = zip.folder(folderName);

          // 添加 Markdown 文件（保留原始图片链接，不下载图片）
          const safeTitle = article.title.replace(/[\/\\?%*:|"<>]/g, '_');
          folder.file(`${safeTitle}.md`, markdown);

          packedCount.value++;
        } catch (error) {
          console.error(`处理文章 ${article.title} 失败:`, error);
        }
      }

      phase.value = '保存文件';
      const blob = await zip.generateAsync({ type: 'blob' });

      // 保存到服务端而不是浏览器下载
      const success = await saveFileToServer(`${filename}.zip`, blob, exportPath);

      if (!success) {
        throw new Error('保存文件到服务端失败');
      }
    } catch (e: any) {
      alert(e.message);
      console.error(e);
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    phase,
    downloadedCount,
    packedCount,
    download,
  };
}

// 复用 Exporter 的 getRenderedHTML 方法
async function getRenderedHTML(url: string, html: string): Promise<string> {
  if (!html) {
    console.warn(`文章(url: ${url})的 html 为空，不能导出其内容`);
    return '';
  }
  const cgiData = await parseCgiDataNew(html);
  if (!cgiData) {
    console.warn(`文章(url: ${url})无法解析 cgiDataNew，跳过导出`);
    return '';
  }
  return await renderHTMLFromCgiDataNew(cgiData, false);
}
