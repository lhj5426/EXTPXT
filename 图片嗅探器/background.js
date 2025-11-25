// background.js - 简单下载器

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 获取图片数据（用于打包 ZIP）
  if (request.action === "fetch_image") {
    fetch(request.url)
      .then(response => response.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ success: true, data: reader.result });
        };
        reader.readAsDataURL(blob);
      })
      .catch(error => {
        console.warn("获取图片失败:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === "download_image") {
    const imageUrl = request.url;

    // 准备下载选项
    const downloadOptions = {
      url: imageUrl,
      conflictAction: "uniquify",
      saveAs: false
    };

    // 如果指定了文件夹，拼接到文件名里
    // Chrome API 不允许绝对路径，只能是 Downloads 下的相对路径
    if (request.folder) {
      // 清理文件夹名，去掉非法字符
      const safeFolder = request.folder.replace(/[\\/:*?"<>|]/g, '_');

      // 提取原文件名
      let filename = imageUrl.split('/').pop().split('?')[0] || `image_${Date.now()}.jpg`;
      // 解码文件名（防止 %20 这种乱码）
      try { filename = decodeURIComponent(filename); } catch (e) { }

      // 组合路径: 文件夹/文件名
      downloadOptions.filename = `${safeFolder}/${filename}`;
    }

    // 执行下载，并监听下载完成
    chrome.downloads.download(downloadOptions, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.warn("下载失败:", chrome.runtime.lastError.message);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }

      // 监听下载状态变化
      const listener = (delta) => {
        if (delta.id === downloadId && delta.state) {
          if (delta.state.current === 'complete') {
            chrome.downloads.onChanged.removeListener(listener);
            sendResponse({ success: true, downloadId: downloadId });
          } else if (delta.state.current === 'interrupted') {
            chrome.downloads.onChanged.removeListener(listener);
            sendResponse({ success: false, error: 'Download interrupted' });
          }
        }
      };

      chrome.downloads.onChanged.addListener(listener);
    });

    // 返回 true 表示异步响应
    return true;
  }
});
