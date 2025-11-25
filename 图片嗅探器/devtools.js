// devtools.js - 创建 DevTools 面板

chrome.devtools.panels.create(
    "图片嗅探", // 面板标题
    "Plugin16.png",    // 图标
    "panel.html",  // 面板的具体页面
    function (panel) {
        console.log("图片嗅探面板已创建！");
    }
);
