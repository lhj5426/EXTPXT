// popup.js - 负责展示列表和触发下载

document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('imageGrid');
    const downloadBtn = document.getElementById('downloadBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const statusMsg = document.getElementById('statusMsg');

    let allImages = []; // 存储所有扫描到的图片数据
    let selectedUrls = new Set(); // 存储用户选中的图片 URL

    // 1. 向当前页面发送“获取图片”请求
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;

        chrome.tabs.sendMessage(tabs[0].id, { action: "get_images" }, (response) => {
            if (chrome.runtime.lastError) {
                grid.innerHTML = '<div style="padding:20px; text-align:center">请刷新网页后重试</div>';
                return;
            }

            if (response && response.images) {
                allImages = response.images;
                renderGrid(allImages);
            } else {
                grid.innerHTML = '<div style="padding:20px; text-align:center">未找到图片</div>';
            }
        });
    });

    // 2. 渲染图片网格
    function renderGrid(images) {
        grid.innerHTML = '';

        if (images.length === 0) {
            grid.innerHTML = '<div style="padding:20px; text-align:center">空空如也</div>';
            return;
        }

        images.forEach((imgData) => {
            const card = document.createElement('div');
            card.className = 'img-card';
            // 默认不选中，或者可以默认选中大图
            // 这里我们默认不选中，让用户自己点，或者点全选

            // 点击切换选中状态
            card.onclick = () => toggleSelection(card, imgData.url);

            const img = document.createElement('img');
            img.className = 'img-thumb';
            img.src = imgData.url;

            const info = document.createElement('div');
            info.className = 'img-info';
            // 如果有尺寸就显示尺寸，没有就显示“未知”
            const sizeText = (imgData.width > 0) ? `${imgData.width} x ${imgData.height}` : '未知尺寸';
            info.textContent = sizeText;

            card.appendChild(img);
            card.appendChild(info);
            grid.appendChild(card);
        });

        statusMsg.textContent = `扫描到 ${images.length} 张图片`;
    }

    // 3. 切换选中状态
    function toggleSelection(cardElement, url) {
        if (selectedUrls.has(url)) {
            selectedUrls.delete(url);
            cardElement.classList.remove('selected');
        } else {
            selectedUrls.add(url);
            cardElement.classList.add('selected');
        }
        updateButtons();
    }

    // 4. 更新按钮文字
    function updateButtons() {
        downloadBtn.textContent = `下载选中 (${selectedUrls.size})`;
        if (selectedUrls.size > 0) {
            downloadBtn.classList.replace('btn-secondary', 'btn-primary');
        } else {
            // downloadBtn.classList.replace('btn-primary', 'btn-secondary');
        }
    }

    // 5. 全选/反选
    selectAllBtn.addEventListener('click', () => {
        const cards = document.querySelectorAll('.img-card');
        const isAllSelected = (selectedUrls.size === allImages.length);

        if (isAllSelected) {
            // 全不选
            selectedUrls.clear();
            cards.forEach(c => c.classList.remove('selected'));
        } else {
            // 全选
            allImages.forEach(img => selectedUrls.add(img.url));
            cards.forEach(c => c.classList.add('selected'));
        }
        updateButtons();
    });

    // 6. 下载按钮点击
    downloadBtn.addEventListener('click', () => {
        if (selectedUrls.size === 0) return;

        statusMsg.textContent = `正在下载 ${selectedUrls.size} 张图片...`;

        // 发送给 background.js 逐个下载
        selectedUrls.forEach(url => {
            chrome.runtime.sendMessage({
                action: "download_image",
                url: url
            });
        });
    });
});
