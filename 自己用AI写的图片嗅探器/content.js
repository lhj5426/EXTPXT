// content.js - 嗅探模式：只负责找图，不负责下

console.log("图片嗅探器已就绪...");

// 辅助函数：判断是否为图片 URL
function isImageUrl(url) {
    if (!url || url.startsWith('data:')) return false;
    const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
    return cleanUrl.match(/\.(jpg|jpeg|png|gif|webp|avif|bmp|svg|ico)$/);
}

// 核心功能：扫描页面所有图片信息
function getPageImages() {
    const imageMap = new Map(); // 使用 Map 去重，Key 为 URL

    // 1. 扫描 DOM 中的 img 标签 (最准确，有尺寸)
    document.querySelectorAll('img').forEach((img) => {
        if (img.src && !img.src.startsWith('data:')) {
            // 只有当图片加载完成且有尺寸时才收录
            if (img.complete && img.naturalWidth > 0) {
                imageMap.set(img.src, {
                    url: img.src,
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    type: 'dom'
                });
            }
        }
    });

    // 2. 扫描 Performance 资源 (补充那些不在 DOM 里显示的背景图等)
    performance.getEntriesByType("resource").forEach((resource) => {
        if (isImageUrl(resource.name) && !imageMap.has(resource.name)) {
            imageMap.set(resource.name, {
                url: resource.name,
                width: 0, // 网络资源暂时不知道尺寸，标记为 0
                height: 0,
                type: 'network'
            });
        }
    });

    return Array.from(imageMap.values());
}

// 监听来自 Popup 的呼叫
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "get_images") {
        const images = getPageImages();
        console.log(`扫描到 ${images.length} 张图片，发送给 Popup...`);
        sendResponse({ images: images });
    }
});
