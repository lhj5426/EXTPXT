// panel.js - 全功能控制台逻辑

// UI 元素
const list = document.getElementById('resourceList');
const refreshBtn = document.getElementById('refreshBtn');
const selectAllBtn = document.getElementById('selectAllBtn');
const downloadBtn = document.getElementById('downloadBtn');
const pathInput = document.getElementById('pathInput');
const useUrlBtn = document.getElementById('useUrlBtn');
const filterMinWInput = document.getElementById('filterMinW');
const filterMaxWInput = document.getElementById('filterMaxW');
const filterMinHInput = document.getElementById('filterMinH');
const filterMaxHInput = document.getElementById('filterMaxH');
const typeCheckboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]:not(#autoRefreshCheck):not(#filterDuplicateNames)');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const progressPercent = document.getElementById('progressPercent');
const stopDownloadBtn = document.getElementById('stopDownloadBtn');
const retryDownloadBtn = document.getElementById('retryDownloadBtn');
const autoRefreshCheck = document.getElementById('autoRefreshCheck');
const refreshInterval = document.getElementById('refreshInterval');
const stopAfterCount = document.getElementById('stopAfterCount');
const showFailedBtn = document.getElementById('showFailedBtn');
const failedCount = document.getElementById('failedCount');
const refreshCountdown = document.getElementById('refreshCountdown');
const batchCountdown = document.getElementById('batchCountdown');
const filterDuplicateNames = document.getElementById('filterDuplicateNames');
const statsInfo = document.getElementById('statsInfo');

// 数据状态
let allItems = []; // 存放所有扫描到的资源对象 {url, element, width, height, type}
let selectedUrls = new Set();
let showingFailedOnly = false;

// --- 1. 扫描与加载 ---

// 自然排序函数
function naturalSort(a, b) {
    const ax = [], bx = [];
    
    a.replace(/(\d+)|(\D+)/g, (_, num, str) => {
        ax.push([num || Infinity, str || '']);
    });
    b.replace(/(\d+)|(\D+)/g, (_, num, str) => {
        bx.push([num || Infinity, str || '']);
    });
    
    while (ax.length && bx.length) {
        const an = ax.shift();
        const bn = bx.shift();
        const nn = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
        if (nn) return nn;
    }
    
    return ax.length - bx.length;
}

function scanResources() {
    list.innerHTML = '<div style="padding:20px; text-align:center">正在扫描资源...</div>';
    allItems = [];
    selectedUrls.clear();
    updateUI();

    chrome.devtools.inspectedWindow.getResources((resources) => {
        // 初步筛选：只要是图片类型的资源
        const images = resources.filter(r => r.type.match('image') || r.url.match(/\.(jpg|png|gif|webp|avif|svg)/i));

        list.innerHTML = '';
        if (images.length === 0) {
            list.innerHTML = '<div style="padding:20px; text-align:center">未找到图片</div>';
            return;
        }

        // 去重：根据文件名去重（可选）
        let uniqueImages = [];
        
        if (filterDuplicateNames.checked) {
            // 过滤重复文件名
            const seenNames = new Set();
            images.forEach(img => {
                // 提取文件名（去掉路径和参数）
                const fileName = img.url.split('/').pop().split('?')[0];
                if (!seenNames.has(fileName)) {
                    seenNames.add(fileName);
                    uniqueImages.push(img);
                }
            });
        } else {
            // 不过滤，显示所有图片
            uniqueImages = images;
        }

        // 按文件名自然排序
        uniqueImages.sort((a, b) => {
            const nameA = a.url.split('/').pop().split('?')[0];
            const nameB = b.url.split('/').pop().split('?')[0];
            return naturalSort(nameA, nameB);
        });

        // 渲染每一个资源
        uniqueImages.forEach(res => createCard(res));
    });
}

function createCard(res) {
    // 创建 DOM 结构
    const div = document.createElement('div');
    div.className = 'res-item';

    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'img-wrapper';

    const img = document.createElement('img');
    img.className = 'res-thumb';
    img.src = res.url;

    // 关键：加载完成后获取尺寸
    img.onload = function () {
        const w = this.naturalWidth;
        const h = this.naturalHeight;
        div.dataset.w = w;
        div.dataset.h = h;
        sizeSpan.textContent = `${w}x${h}`;

        // 更新数据对象
        itemData.width = w;
        itemData.height = h;

        // 重新应用过滤（因为尺寸变了）
        applyFilters();
    };

    const info = document.createElement('div');
    info.className = 'res-info';

    const sizeSpan = document.createElement('div');
    sizeSpan.className = 'res-size';
    sizeSpan.textContent = '...'; // 加载中

    const extSpan = document.createElement('span');
    extSpan.className = 'res-ext';
    // 获取后缀
    let ext = res.url.split('.').pop().split('?')[0].toUpperCase();
    if (ext.length > 4) ext = 'IMG';
    extSpan.textContent = ext;
    div.dataset.ext = ext.toLowerCase();

    const nameDiv = document.createElement('div');
    nameDiv.className = 'res-name';
    nameDiv.textContent = res.url.split('/').pop().split('?')[0];
    nameDiv.title = res.url;

    const statusSpan = document.createElement('span');
    statusSpan.className = 'res-status';

    imgWrapper.appendChild(img);
    info.appendChild(sizeSpan);  // 尺寸
    info.appendChild(extSpan);   // 后缀
    info.appendChild(statusSpan); // 下载状态

    div.appendChild(imgWrapper);
    div.appendChild(nameDiv);   // 文件名
    div.appendChild(info);
    list.appendChild(div);

    // 数据绑定
    const itemData = {
        url: res.url,
        element: div,
        width: 0,
        height: 0,
        ext: ext.toLowerCase(),
        resource: res,  // 保存原始 resource 对象，用于 getContent
        statusElement: statusSpan
    };
    allItems.push(itemData);

    // 点击事件
    div.onclick = () => toggleSelect(itemData);
}

// --- 2. 过滤逻辑 ---

function applyFilters() {
    // 过滤小图的范围（在此范围内的图片会被隐藏）
    const filterMinW = parseInt(filterMinWInput.value) || 0;
    const filterMaxW = parseInt(filterMaxWInput.value) || 0;
    const filterMinH = parseInt(filterMinHInput.value) || 0;
    const filterMaxH = parseInt(filterMaxHInput.value) || 0;

    // 获取选中的类型
    const allowedTypes = Array.from(typeCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value.toLowerCase()); // ['jpg', 'png', ...]

    let visibleCount = 0;

    allItems.forEach(item => {
        // 特殊处理：如果没加载出来尺寸，暂时显示，等加载完再判断
        if (item.width === 0) {
            item.element.classList.remove('hidden');
            return;
        }

        // 尺寸检查：如果宽高都在过滤范围内，则隐藏（过滤掉小图）
        const widthInFilterRange = item.width >= filterMinW && item.width <= filterMaxW;
        const heightInFilterRange = item.height >= filterMinH && item.height <= filterMaxH;
        // 只有宽和高都在过滤范围内才过滤掉
        const shouldFilter = filterMaxW > 0 && filterMaxH > 0 && widthInFilterRange && heightInFilterRange;
        const sizeOk = !shouldFilter;

        // 类型检查 - 严格匹配
        const itemExt = item.ext.toLowerCase();
        let typeOk = false;
        
        for (const allowedType of allowedTypes) {
            if (allowedType === 'jpg' && (itemExt === 'jpg' || itemExt === 'jpeg')) {
                typeOk = true;
                break;
            } else if (itemExt === allowedType) {
                typeOk = true;
                break;
            }
        }

        if (sizeOk && typeOk) {
            item.element.classList.remove('hidden');
            visibleCount++;
        } else {
            item.element.classList.add('hidden');
            // 如果被隐藏了，取消选中
            if (selectedUrls.has(item.url)) {
                selectedUrls.delete(item.url);
                item.element.classList.remove('selected');
            }
        }
    });

    updateUI(visibleCount);
}

// --- 3. 交互逻辑 ---

function toggleSelect(item) {
    if (selectedUrls.has(item.url)) {
        selectedUrls.delete(item.url);
        item.element.classList.remove('selected');
    } else {
        selectedUrls.add(item.url);
        item.element.classList.add('selected');
    }
    updateUI();
}

// 只更新统计信息，不改变按钮状态
function updateStats() {
    const visibleCount = allItems.filter(i => !i.element.classList.contains('hidden')).length;
    
    // 统计各格式数量
    const stats = { total: allItems.length, visible: visibleCount, filtered: allItems.length - visibleCount };
    const formatStats = { jpg: 0, png: 0, gif: 0, webp: 0, avif: 0, other: 0 };
    const selectedStats = { jpg: 0, png: 0, gif: 0, webp: 0, avif: 0, other: 0 };
    const filteredStats = { jpg: 0, png: 0, gif: 0, webp: 0, avif: 0, other: 0 };
    
    allItems.forEach(item => {
        const ext = item.ext.toLowerCase();
        const isHidden = item.element.classList.contains('hidden');
        const isSelected = selectedUrls.has(item.url);
        
        let format = 'other';
        if (ext === 'jpg' || ext === 'jpeg') format = 'jpg';
        else if (ext === 'png') format = 'png';
        else if (ext === 'gif') format = 'gif';
        else if (ext === 'webp') format = 'webp';
        else if (ext === 'avif') format = 'avif';
        
        formatStats[format]++;
        if (isHidden) filteredStats[format]++;
        if (isSelected) selectedStats[format]++;
    });
    
    // 构建统计信息 HTML
    let html = '';
    const sep = '&nbsp;&nbsp;&nbsp;<span style="color:#555; font-size:16px;">|</span>&nbsp;&nbsp;&nbsp;';
    
    // 总共加载
    const loadedParts = [];
    if (formatStats.jpg > 0) loadedParts.push(`<span style="color:#f0ad4e; font-weight:bold;">JPG:${formatStats.jpg}</span>`);
    if (formatStats.png > 0) loadedParts.push(`<span style="color:#5bc0de; font-weight:bold;">PNG:${formatStats.png}</span>`);
    if (formatStats.gif > 0) loadedParts.push(`<span style="color:#d9534f; font-weight:bold;">GIF:${formatStats.gif}</span>`);
    if (formatStats.webp > 0) loadedParts.push(`<span style="color:#5cb85c; font-weight:bold;">WEBP:${formatStats.webp}</span>`);
    if (formatStats.avif > 0) loadedParts.push(`<span style="color:#9b59b6; font-weight:bold;">AVIF:${formatStats.avif}</span>`);
    html += `📊 总共: <b style="font-size:15px;">${stats.total}</b>`;
    if (loadedParts.length > 0) html += ` &nbsp;(${loadedParts.join('&nbsp;&nbsp;')})`;
    
    html += `${sep}👁 显示: <b style="color:#4ec9b0; font-size:15px;">${stats.visible}</b>`;
    
    if (stats.filtered > 0) {
        const filterParts = [];
        if (filteredStats.jpg > 0) filterParts.push(`<span style="color:#f0ad4e;">JPG:${filteredStats.jpg}</span>`);
        if (filteredStats.png > 0) filterParts.push(`<span style="color:#5bc0de;">PNG:${filteredStats.png}</span>`);
        if (filteredStats.gif > 0) filterParts.push(`<span style="color:#d9534f;">GIF:${filteredStats.gif}</span>`);
        if (filteredStats.webp > 0) filterParts.push(`<span style="color:#5cb85c;">WEBP:${filteredStats.webp}</span>`);
        if (filteredStats.avif > 0) filterParts.push(`<span style="color:#9b59b6;">AVIF:${filteredStats.avif}</span>`);
        html += `${sep}🚫 过滤: <b style="color:#d9534f; font-size:15px;">${stats.filtered}</b>`;
        if (filterParts.length > 0) html += ` &nbsp;(${filterParts.join('&nbsp;&nbsp;')})`;
    }
    
    if (selectedUrls.size > 0) {
        const selParts = [];
        if (selectedStats.jpg > 0) selParts.push(`<span style="color:#f0ad4e;">JPG:${selectedStats.jpg}</span>`);
        if (selectedStats.png > 0) selParts.push(`<span style="color:#5bc0de;">PNG:${selectedStats.png}</span>`);
        if (selectedStats.gif > 0) selParts.push(`<span style="color:#d9534f;">GIF:${selectedStats.gif}</span>`);
        if (selectedStats.webp > 0) selParts.push(`<span style="color:#5cb85c;">WEBP:${selectedStats.webp}</span>`);
        if (selectedStats.avif > 0) selParts.push(`<span style="color:#9b59b6;">AVIF:${selectedStats.avif}</span>`);
        html += `${sep}✅ 选中: <b style="color:#5cb85c; font-size:15px;">${selectedUrls.size}</b> &nbsp;(${selParts.join('&nbsp;&nbsp;')})`;
    }
    
    statsInfo.innerHTML = html;
}

function updateUI(visibleCount) {
    if (visibleCount === undefined) {
        visibleCount = allItems.filter(i => !i.element.classList.contains('hidden')).length;
    }
    
    downloadBtn.textContent = `⬇️ 下载选中 (${selectedUrls.size})`;

    if (selectedUrls.size > 0) {
        downloadBtn.style.backgroundColor = '#0e639c';
    } else {
        downloadBtn.style.backgroundColor = '#3c3c3c';
    }
    
    updateStats();
}

// 全选/反选
selectAllBtn.onclick = () => {
    // 只操作当前可见的
    const visibleItems = allItems.filter(i => !i.element.classList.contains('hidden'));
    const isAllSelected = visibleItems.every(i => selectedUrls.has(i.url));

    if (isAllSelected) {
        // 全不选
        visibleItems.forEach(i => {
            selectedUrls.delete(i.url);
            i.element.classList.remove('selected');
        });
    } else {
        // 全选
        visibleItems.forEach(i => {
            selectedUrls.add(i.url);
            i.element.classList.add('selected');
        });
    }
    updateUI();
};

// 下载控制变量
let isDownloading = false;
let shouldStopDownload = false;
let lastDownloadUrls = [];
let lastDownloadFolder = '';

// 下载 - 真正的批量处理，等待每批完成
downloadBtn.onclick = async () => {
    if (selectedUrls.size === 0) return;

    const folder = pathInput.value.trim();
    // 获取选中的 item 对象（包含 resource）
    const selectedItems = allItems.filter(item => selectedUrls.has(item.url));
    
    // 保存下载信息用于重试
    lastDownloadUrls = selectedItems;
    lastDownloadFolder = folder;
    
    await startDownload(selectedItems, folder);
};

// 停止下载
stopDownloadBtn.onclick = () => {
    shouldStopDownload = true;
    stopDownloadBtn.style.display = 'none';
    progressText.textContent = `⚠️ 已停止`;
};

// 重试下载
retryDownloadBtn.onclick = async () => {
    if (lastDownloadUrls.length > 0) {
        retryDownloadBtn.style.display = 'none';
        await startDownload(lastDownloadUrls, lastDownloadFolder);
    }
};

async function startDownload(items, folder) {
    const total = items.length;
    const batchSize = parseInt(document.getElementById('batchSize').value) || 10;
    const batchDelay = parseFloat(document.getElementById('batchDelay').value) || 3;
    
    // 保存网页标题到txt文件
    chrome.devtools.inspectedWindow.eval('document.title', (title, error) => {
        if (!error && title && folder) {
            const safeFolder = folder.replace(/[\\/:*?"<>|]/g, '_');
            const txtContent = 'data:text/plain;charset=utf-8,' + encodeURIComponent(title);
            chrome.downloads.download({
                url: txtContent,
                filename: `${safeFolder}/0A网页标题.txt`,
                saveAs: false
            });
        }
    });
    
    // 重置状态
    isDownloading = true;
    shouldStopDownload = false;
    
    // 显示进度条
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = '准备下载...';
    progressPercent.textContent = '0%';
    stopDownloadBtn.style.display = 'inline-block';
    stopDownloadBtn.disabled = false;
    stopDownloadBtn.textContent = '停止';
    retryDownloadBtn.style.display = 'none';
    
    // 禁用按钮防止重复点击
    downloadBtn.disabled = true;
    downloadBtn.style.opacity = '0.6';
    downloadBtn.style.cursor = 'not-allowed';

    let completed = 0;

    for (let i = 0; i < items.length; i += batchSize) {
        // 检查是否需要停止
        if (shouldStopDownload) {
            progressText.textContent = `⚠️ 已停止 (${completed}/${total})`;
            stopDownloadBtn.style.display = 'none';
            retryDownloadBtn.style.display = 'inline-block';
            break;
        }

        const batch = items.slice(i, i + batchSize);
        
        // 等待当前批次所有下载完成
        const promises = batch.map(item => {
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    console.warn('下载超时:', item.url);
                    completed++;
                    updateProgress();
                    resolve({ success: false, timeout: true });
                }, 30000);

                // 显示下载中状态
                item.statusElement.textContent = '下载中...';
                item.statusElement.className = 'res-status downloading';

                // 从缓存获取图片内容
                item.resource.getContent((content, encoding) => {
                    if (!content) {
                        // 如果缓存没有，回退到网络下载
                        chrome.runtime.sendMessage({
                            action: "download_image",
                            url: item.url,
                            folder: folder
                        }, (response) => {
                            clearTimeout(timeout);
                            completed++;
                            
                            // 更新状态
                            if (response && response.success) {
                                item.statusElement.textContent = '下载成功';
                                item.statusElement.className = 'res-status success';
                            } else {
                                item.statusElement.textContent = '下载失败';
                                item.statusElement.className = 'res-status failed';
                            }
                            
                            updateProgress();
                            resolve(response);
                        });
                        return;
                    }

                    // 从缓存下载
                    let dataUri;
                    if (encoding === 'base64') {
                        // 已经是 base64
                        const mimeType = item.ext === 'png' ? 'image/png' : 
                                        item.ext === 'gif' ? 'image/gif' : 
                                        item.ext === 'webp' ? 'image/webp' : 
                                        item.ext === 'avif' ? 'image/avif' : 'image/jpeg';
                        dataUri = `data:${mimeType};base64,${content}`;
                    } else {
                        // 文本内容，转 base64
                        try {
                            dataUri = 'data:text/plain;base64,' + btoa(content);
                        } catch (e) {
                            dataUri = 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(content)));
                        }
                    }

                    // 提取文件名
                    let filename = item.url.split('/').pop().split('?')[0];
                    try { filename = decodeURIComponent(filename); } catch (e) { }

                    // 生成URL哈希值（取前8位）
                    const hash = item.url.split('').reduce((acc, char) => {
                        return ((acc << 5) - acc) + char.charCodeAt(0);
                    }, 0);
                    const hashStr = Math.abs(hash).toString(36).substring(0, 8);

                    // 在文件名中插入哈希值
                    const lastDotIndex = filename.lastIndexOf('.');
                    if (lastDotIndex > 0) {
                        const name = filename.substring(0, lastDotIndex);
                        const ext = filename.substring(lastDotIndex);
                        filename = `${name}_${hashStr}${ext}`;
                    } else {
                        filename = `${filename}_${hashStr}`;
                    }

                    // 组合路径
                    const safeFolder = folder ? folder.replace(/[\\/:*?"<>|]/g, '_') : '';
                    const filepath = safeFolder ? `${safeFolder}/${filename}` : filename;

                    chrome.downloads.download({
                        url: dataUri,
                        filename: filepath,
                        saveAs: false
                    }, (downloadId) => {
                        clearTimeout(timeout);
                        completed++;
                        
                        // 更新状态
                        if (chrome.runtime.lastError) {
                            item.statusElement.textContent = '下载失败';
                            item.statusElement.className = 'res-status failed';
                        } else {
                            item.statusElement.textContent = '下载成功';
                            item.statusElement.className = 'res-status success';
                        }
                        
                        updateProgress();
                        resolve({ success: !chrome.runtime.lastError, downloadId });
                    });
                });
            });
        });

        function updateProgress() {
            const percent = Math.round((completed / total) * 100);
            progressBar.style.width = percent + '%';
            progressText.textContent = `正在下载 ${completed}/${total} 张图片`;
            progressPercent.textContent = percent + '%';
            downloadBtn.textContent = `⬇️ 下载中 ${completed}/${total}`;
        }

        await Promise.all(promises);
        
        // 批次之间延迟
        if (i + batchSize < items.length && !shouldStopDownload) {
            // 显示批次间隔倒计时
            batchCountdown.style.display = 'inline';
            let delayLeft = batchDelay;
            batchCountdown.textContent = `(等待 ${delayLeft.toFixed(1)}s)`;
            
            const countdownInterval = setInterval(() => {
                delayLeft -= 0.1;
                if (delayLeft > 0) {
                    batchCountdown.textContent = `(等待 ${delayLeft.toFixed(1)}s)`;
                } else {
                    clearInterval(countdownInterval);
                    batchCountdown.style.display = 'none';
                }
            }, 100);
            
            await new Promise(resolve => setTimeout(resolve, batchDelay * 1000));
        }
    }

    isDownloading = false;

    // 隐藏批次倒计时
    batchCountdown.style.display = 'none';
    
    if (!shouldStopDownload) {
        progressBar.style.width = '100%';
        progressText.textContent = `✅ 已完成 ${total} 张图片下载`;
        progressPercent.textContent = '100%';
        downloadBtn.textContent = `✅ 已完成 (${total})`;
        downloadBtn.style.backgroundColor = '#5cb85c';
        stopDownloadBtn.style.display = 'none';
        
        setTimeout(() => {
            progressContainer.style.display = 'none';
            downloadBtn.disabled = false;
            downloadBtn.style.opacity = '1';
            downloadBtn.style.cursor = 'pointer';
            // 不调用 updateUI()，保持"已完成"状态
            // 只更新统计信息
            updateStats();
        }, 2000);
    } else {
        downloadBtn.disabled = false;
        downloadBtn.style.opacity = '1';
        downloadBtn.style.cursor = 'pointer';
        updateStats();
    }
}

// 绑定过滤事件
[filterMinWInput, filterMaxWInput, filterMinHInput, filterMaxHInput, ...typeCheckboxes].forEach(el => {
    el.addEventListener('change', applyFilters);
    el.addEventListener('input', applyFilters);
});

// 视图切换逻辑
const viewGridBtn = document.getElementById('viewGrid');
const viewListBtn = document.getElementById('viewList');

viewGridBtn.onclick = () => {
    list.classList.add('grid-view');
    viewGridBtn.classList.add('active');
    viewListBtn.classList.remove('active');
};

viewListBtn.onclick = () => {
    list.classList.remove('grid-view');
    viewListBtn.classList.add('active');
    viewGridBtn.classList.remove('active');
};

refreshBtn.onclick = scanResources;

// 过滤重复文件名选项改变时重新扫描
filterDuplicateNames.onchange = () => {
    scanResources();
};

// 自动刷新功能
let autoRefreshTimer = null;
let lastImageCount = 0;
let unchangedCount = 0;
let refreshCountdownTimer = null;
let refreshTimeLeft = 0;

autoRefreshCheck.onchange = () => {
    if (autoRefreshCheck.checked) {
        // 启用自动刷新
        refreshInterval.disabled = false;
        stopAfterCount.disabled = false;
        lastImageCount = allItems.length;
        unchangedCount = 0;
        startAutoRefresh();
    } else {
        // 停止自动刷新
        refreshInterval.disabled = true;
        stopAfterCount.disabled = true;
        stopAutoRefresh();
    }
};

refreshInterval.onchange = () => {
    // 如果正在自动刷新，重新启动定时器
    if (autoRefreshCheck.checked) {
        stopAutoRefresh();
        startAutoRefresh();
    }
};

function startAutoRefresh() {
    const interval = parseInt(refreshInterval.value) || 10;
    refreshTimeLeft = interval;
    
    // 显示倒计时
    refreshCountdown.style.display = 'inline';
    refreshCountdown.textContent = `(${refreshTimeLeft}s)`;
    
    // 倒计时更新
    refreshCountdownTimer = setInterval(() => {
        refreshTimeLeft--;
        if (refreshTimeLeft > 0) {
            refreshCountdown.textContent = `(${refreshTimeLeft}s)`;
        } else {
            refreshTimeLeft = interval;
            refreshCountdown.textContent = `(${refreshTimeLeft}s)`;
        }
    }, 1000);
    
    autoRefreshTimer = setInterval(() => {
        scanResourcesWithCheck();
    }, interval * 1000);
}

function stopAutoRefresh() {
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }
    if (refreshCountdownTimer) {
        clearInterval(refreshCountdownTimer);
        refreshCountdownTimer = null;
    }
    refreshCountdown.style.display = 'none';
}

function scanResourcesWithCheck() {
    const beforeCount = allItems.length;
    
    // 执行扫描
    scanResources();
    
    // 延迟检查（等待扫描完成）
    setTimeout(() => {
        const afterCount = allItems.length;
        const maxUnchanged = parseInt(stopAfterCount.value) || 3;
        
        if (afterCount === beforeCount) {
            unchangedCount++;
            console.log(`图片数量未变化，计数: ${unchangedCount}/${maxUnchanged}`);
            
            if (unchangedCount >= maxUnchanged) {
                // 达到停止条件，自动停止
                console.log(`连续${maxUnchanged}次图片数量未变化，自动停止刷新`);
                autoRefreshCheck.checked = false;
                refreshInterval.disabled = true;
                stopAfterCount.disabled = true;
                stopAutoRefresh();
                
                // 显示提示
                const originalText = refreshBtn.textContent;
                refreshBtn.textContent = `✓ 已完成 (${maxUnchanged}次无变化)`;
                refreshBtn.style.backgroundColor = '#4ec9b0';
                setTimeout(() => {
                    refreshBtn.textContent = originalText;
                    refreshBtn.style.backgroundColor = '';
                }, 3000);
            }
        } else {
            // 数量有变化，重置计数
            unchangedCount = 0;
            lastImageCount = afterCount;
            console.log(`图片数量更新: ${afterCount}`);
        }
    }, 1000);
}

// 自动填充网址作为文件夹名
function autoFillFolderName() {
    chrome.devtools.inspectedWindow.eval('window.location.href', (url, error) => {
        if (!error && url) {
            // 移除协议部分 (https:// 或 http://)
            let cleanName = url.replace(/^https?:\/\//, '');
            // 移除末尾的斜杠
            cleanName = cleanName.replace(/\/$/, '');
            // 替换 Windows 不支持的字符: : / \ * ? " < > |
            cleanName = cleanName.replace(/[:/\\*?"<>|]/g, '_');
            // 限制长度，避免路径过长
            if (cleanName.length > 100) {
                cleanName = cleanName.substring(0, 100);
            }
            pathInput.value = cleanName;
        }
    });
}

// 使用网址命名文件夹按钮（手动刷新）
useUrlBtn.onclick = autoFillFolderName;

// 自动开始
autoFillFolderName(); // 页面加载时自动填充
scanResources();
