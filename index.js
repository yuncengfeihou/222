import { extension_settings, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";
import { Popup } from "../../../popup.js";

// 插件名称（必须与文件夹名称一致）
const extensionName = "prompt-exporter";
// 设置对象引用
const extensionSettings = extension_settings[extensionName] = extension_settings[extensionName] || {};
// 默认设置
const defaultSettings = {
    enabled: true,
    autoDownload: false,
    logToConsole: false
};

// 记录当前捕获的prompt结构
let currentPromptStruct = null;
// 记录插件状态
let pluginState = {
    isCapturing: false,
    lastCaptureTime: null,
    captureCount: 0,
    errors: []
};

/**
 * 加载插件设置
 */
function loadSettings() {
    // 确保存在设置对象
    if (Object.keys(extensionSettings).length === 0) {
        Object.assign(extensionSettings, defaultSettings);
        saveSettingsDebounced();
    }
    
    // 更新UI以匹配设置
    $('#prompt_exporter_enabled').prop('checked', extensionSettings.enabled);
    $('#prompt_exporter_auto_download').prop('checked', extensionSettings.autoDownload);
    $('#prompt_exporter_log_console').prop('checked', extensionSettings.logToConsole);
    
    // 记录设置加载
    console.log(`[${extensionName}] 设置已加载:`, extensionSettings);
}

/**
 * 输出日志（根据设置决定是否显示）
 */
function logDebug(...args) {
    if (extensionSettings.logToConsole) {
        console.log(`[${extensionName}]`, ...args);
    }
}

/**
 * 记录错误
 */
function logError(error, context) {
    const errorInfo = {
        time: new Date().toISOString(),
        message: error.message || String(error),
        stack: error.stack,
        context: context
    };
    
    pluginState.errors.push(errorInfo);
    
    // 限制错误历史记录数量
    if (pluginState.errors.length > 10) {
        pluginState.errors.shift();
    }
    
    console.error(`[${extensionName}] 错误:`, errorInfo);
    return errorInfo;
}

/**
 * 将数据保存为文件并提供下载
 */
function saveToFile(data, filename) {
    try {
        // 创建Blob对象
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // 创建下载链接
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `prompt_struct_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        
        // 清理
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
        logDebug('文件已保存:', filename);
        toastr.success(`提示词结构已导出为 ${filename}`, '导出成功');
        return true;
    } catch (error) {
        const errorInfo = logError(error, 'saveToFile');
        toastr.error(`保存文件失败: ${errorInfo.message}`, '导出错误');
        return false;
    }
}

/**
 * 捕获提示词结构并处理
 */
function capturePromptStruct(data) {
    try {
        if (!extensionSettings.enabled) {
            return false;
        }
        
        pluginState.isCapturing = true;
        pluginState.lastCaptureTime = new Date();
        pluginState.captureCount++;
        
        // 提取完整的提示结构数据
        const promptStruct = data.eventData?.chat?.prompt_struct || null;
        
        if (!promptStruct) {
            logDebug('未找到提示词结构数据');
            pluginState.isCapturing = false;
            return false;
        }
        
        // 存储当前捕获的提示结构
        currentPromptStruct = promptStruct;
        
        logDebug('成功捕获提示词结构:', promptStruct);
        
        // 如果设置了自动下载，则立即导出文件
        if (extensionSettings.autoDownload) {
            const filename = `prompt_struct_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            saveToFile(promptStruct, filename);
        }
        
        // 更新状态UI
        updateStatusUI();
        
        pluginState.isCapturing = false;
        return true;
    } catch (error) {
        pluginState.isCapturing = false;
        const errorInfo = logError(error, 'capturePromptStruct');
        toastr.error(`捕获提示词结构失败: ${errorInfo.message}`, '捕获错误');
        return false;
    }
}

/**
 * 更新状态UI显示
 */
function updateStatusUI() {
    const statusElement = $('#prompt_exporter_status');
    
    if (!statusElement.length) {
        return;
    }
    
    const lastCapture = pluginState.lastCaptureTime ? 
        new Date(pluginState.lastCaptureTime).toLocaleTimeString() : 
        '从未';
    
    statusElement.html(`
        <div>状态：${extensionSettings.enabled ? '<span class="success">已启用</span>' : '<span class="failure">已禁用</span>'}</div>
        <div>捕获次数：${pluginState.captureCount}</div>
        <div>最近捕获：${lastCapture}</div>
        <div>错误数：${pluginState.errors.length}</div>
    `);
}

/**
 * 显示当前捕获的提示词结构
 */
function viewCurrentPromptStruct() {
    try {
        if (!currentPromptStruct) {
            toastr.info('当前没有捕获的提示词结构数据');
            return;
        }
        
        // 创建一个格式化的JSON文本展示
        const formattedJson = JSON.stringify(currentPromptStruct, null, 2);
        const content = `
            <div style="max-height: 70vh; overflow-y: auto; white-space: pre; font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 5px;">${
                formattedJson.replace(/</g, '&lt;').replace(/>/g, '&gt;')
            }</div>
        `;
        
        // 使用弹窗显示
        const popup = new Popup({
            title: '提示词结构查看器',
            content: content,
            wide: true,
            large: true,
            buttons: [
                {
                    text: '导出为文件',
                    class: 'menu_button',
                    click: () => {
                        const filename = `prompt_struct_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
                        saveToFile(currentPromptStruct, filename);
                    }
                },
                {
                    text: '关闭',
                    class: 'menu_button',
                    click: () => {
                        popup.hide();
                    }
                }
            ]
        });
        
        popup.show();
    } catch (error) {
        const errorInfo = logError(error, 'viewCurrentPromptStruct');
        toastr.error(`查看提示词结构失败: ${errorInfo.message}`, '查看错误');
    }
}

/**
 * 显示错误历史记录
 */
function viewErrorHistory() {
    try {
        if (pluginState.errors.length === 0) {
            toastr.info('没有错误记录');
            return;
        }
        
        // 创建错误历史记录展示
        let content = '<div style="max-height: 70vh; overflow-y: auto; font-family: monospace;">';
        
        pluginState.errors.forEach((error, index) => {
            content += `
                <div style="margin-bottom: 15px; border-bottom: 1px solid #ccc; padding-bottom: 10px;">
                    <div><strong>时间:</strong> ${error.time}</div>
                    <div><strong>错误:</strong> ${error.message}</div>
                    ${error.context ? `<div><strong>上下文:</strong> ${error.context}</div>` : ''}
                    ${error.stack ? `<div><strong>堆栈:</strong> <pre style="margin: 5px 0; white-space: pre-wrap;">${error.stack}</pre></div>` : ''}
                </div>
            `;
        });
        
        content += '</div>';
        
        // 使用弹窗显示
        const popup = new Popup({
            title: '错误历史记录',
            content: content,
            wide: true,
            buttons: [
                {
                    text: '清除错误历史',
                    class: 'menu_button',
                    click: () => {
                        pluginState.errors = [];
                        updateStatusUI();
                        popup.hide();
                        toastr.success('错误历史已清除');
                    }
                },
                {
                    text: '关闭',
                    class: 'menu_button',
                    click: () => {
                        popup.hide();
                    }
                }
            ]
        });
        
        popup.show();
    } catch (error) {
        logError(error, 'viewErrorHistory');
        toastr.error(`查看错误历史失败: ${error.message}`, '查看错误');
    }
}

/**
 * 初始化事件监听器
 */
function initEventListeners() {
    try {
        // 监听聊天提示生成事件
        eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, (eventData) => {
            logDebug('检测到CHAT_COMPLETION_PROMPT_READY事件');
            capturePromptStruct({ eventData });
        });
        
        // 监听UI元素
        $(document).on('click', '#prompt_exporter_enabled', function() {
            extensionSettings.enabled = !!$(this).prop('checked');
            saveSettingsDebounced();
            updateStatusUI();
        });
        
        $(document).on('click', '#prompt_exporter_auto_download', function() {
            extensionSettings.autoDownload = !!$(this).prop('checked');
            saveSettingsDebounced();
        });
        
        $(document).on('click', '#prompt_exporter_log_console', function() {
            extensionSettings.logToConsole = !!$(this).prop('checked');
            saveSettingsDebounced();
        });
        
        $(document).on('click', '#prompt_exporter_view_button', function() {
            viewCurrentPromptStruct();
        });
        
        $(document).on('click', '#prompt_exporter_export_button', function() {
            if (currentPromptStruct) {
                const filename = `prompt_struct_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
                saveToFile(currentPromptStruct, filename);
            } else {
                toastr.info('当前没有捕获的提示词结构数据');
            }
        });
        
        $(document).on('click', '#prompt_exporter_errors_button', function() {
            viewErrorHistory();
        });
        
        logDebug('事件监听器已初始化');
    } catch (error) {
        logError(error, 'initEventListeners');
    }
}

// 主入口函数
jQuery(async () => {
    try {
        console.log(`${extensionName} 插件正在初始化...`);
        
        // 设置HTML
        const settingsHtml = `
            <div class="prompt-exporter-settings">
                <div class="inline-drawer">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b>Prompt结构导出</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content">
                        <div class="prompt-exporter-block flex-container">
                            <label class="checkbox_label flex-container">
                                <input id="prompt_exporter_enabled" type="checkbox" />
                                <span>启用捕获</span>
                            </label>
                            <label class="checkbox_label flex-container">
                                <input id="prompt_exporter_auto_download" type="checkbox" />
                                <span>自动下载捕获的提示词结构</span>
                            </label>
                            <label class="checkbox_label flex-container">
                                <input id="prompt_exporter_log_console" type="checkbox" />
                                <span>在控制台显示调试日志</span>
                            </label>
                        </div>
                        
                        <div class="prompt-exporter-block flex-container">
                            <div id="prompt_exporter_status" class="prompt-exporter-status">
                                <div>状态：加载中...</div>
                            </div>
                        </div>
                        
                        <div class="prompt-exporter-buttons">
                            <input id="prompt_exporter_view_button" class="menu_button" type="button" value="查看当前结构" />
                            <input id="prompt_exporter_export_button" class="menu_button" type="button" value="导出为文件" />
                            <input id="prompt_exporter_errors_button" class="menu_button" type="button" value="查看错误历史" />
                        </div>
                        
                        <hr class="sysHR" />
                    </div>
                </div>
            </div>
        `;
        
        // 添加设置到设置面板
        $("#extensions_settings").append(settingsHtml);
        
        // 加载设置
        loadSettings();
        
        // 初始化事件监听器
        initEventListeners();
        
        // 更新初始状态UI
        updateStatusUI();
        
        console.log(`${extensionName} 插件初始化完成！`);
    } catch (error) {
        console.error(`${extensionName} 插件初始化失败:`, error);
    }
});
