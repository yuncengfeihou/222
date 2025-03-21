import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";
import { Popup } from '../../../popup.js';
import { toastr } from '../../../utils.js';

const extensionName = "prompt-structure-exporter";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: true,
    logToConsole: false,
    captureEveryMessage: false,
    captureCount: 0
};

let promptStructData = null;
let isCapturing = false;

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    
    // 更新UI状态
    $('#prompt_exporter_enabled').prop('checked', extension_settings[extensionName].enabled);
    $('#prompt_exporter_log_console').prop('checked', extension_settings[extensionName].logToConsole);
    $('#prompt_exporter_capture_every').prop('checked', extension_settings[extensionName].captureEveryMessage);
    $('#prompt_exporter_capture_count').text(extension_settings[extensionName].captureCount);
}

function downloadPromptStructAsJson() {
    try {
        if (!promptStructData) {
            toastr.warning("没有可用的提示词结构数据可供下载！", "提示词结构导出");
            return;
        }

        // 格式化JSON数据以便阅读，缩进2个空格
        const jsonString = JSON.stringify(promptStructData, null, 2);
        
        // 创建一个Blob对象
        const blob = new Blob([jsonString], { type: "application/json" });
        
        // 创建下载链接
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const a = document.createElement("a");
        a.href = url;
        a.download = `prompt_struct_${timestamp}.json`;
        
        // 模拟点击下载
        document.body.appendChild(a);
        a.click();
        
        // 清理
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
        toastr.success("提示词结构已成功导出为JSON文件", "提示词结构导出");
        extension_settings[extensionName].captureCount++;
        $('#prompt_exporter_capture_count').text(extension_settings[extensionName].captureCount);
        saveSettingsDebounced();
    } catch (error) {
        console.error("[提示词结构导出] 下载JSON时出错:", error);
        toastr.error(`下载失败: ${error.message}`, "提示词结构导出");
    }
}

function logPromptStructToConsole() {
    if (!extension_settings[extensionName].logToConsole) return;
    
    console.group("[提示词结构导出] 捕获的提示词结构");
    console.dir(promptStructData);
    console.groupEnd();
}

function handleToggleEnabled() {
    extension_settings[extensionName].enabled = $('#prompt_exporter_enabled').prop('checked');
    saveSettingsDebounced();
    
    const status = extension_settings[extensionName].enabled ? "启用" : "禁用";
    toastr.info(`提示词结构导出已${status}`, "提示词结构导出");
}

function handleToggleLogConsole() {
    extension_settings[extensionName].logToConsole = $('#prompt_exporter_log_console').prop('checked');
    saveSettingsDebounced();
    
    const status = extension_settings[extensionName].logToConsole ? "启用" : "禁用";
    toastr.info(`控制台日志已${status}`, "提示词结构导出");
}

function handleToggleCaptureEvery() {
    extension_settings[extensionName].captureEveryMessage = $('#prompt_exporter_capture_every').prop('checked');
    saveSettingsDebounced();
    
    const status = extension_settings[extensionName].captureEveryMessage ? "启用" : "禁用";
    toastr.info(`自动捕获每条消息已${status}`, "提示词结构导出");
}

function handleClearCounter() {
    extension_settings[extensionName].captureCount = 0;
    $('#prompt_exporter_capture_count').text('0');
    saveSettingsDebounced();
    toastr.info("捕获计数已重置", "提示词结构导出");
}

// 监听聊天完成提示准备好的事件
function setupEventListeners() {
    try {
        // 监听 CHAT_COMPLETION_PROMPT_READY 事件，此事件在提示词结构准备好时触发
        eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, (promptData) => {
            if (!extension_settings[extensionName].enabled) return;
            
            try {
                console.log("[提示词结构导出] 捕获到CHAT_COMPLETION_PROMPT_READY事件");
                promptStructData = promptData;
                
                logPromptStructToConsole();
                
                if (extension_settings[extensionName].captureEveryMessage) {
                    downloadPromptStructAsJson();
                } else {
                    toastr.info("已捕获新的提示词结构，可以点击导出按钮下载", "提示词结构导出");
                }
            } catch (error) {
                console.error("[提示词结构导出] 处理提示词结构时出错:", error);
                toastr.error(`处理提示词结构时出错: ${error.message}`, "提示词结构导出");
            }
        });
        
        // 监听消息发送事件，以便在SillyTavern没有CHAT_COMPLETION_PROMPT_READY事件的情况下尝试捕获
        eventSource.on(event_types.MESSAGE_SENT, () => {
            console.log("[提示词结构导出] 捕获到MESSAGE_SENT事件");
            if (!extension_settings[extensionName].enabled) return;
            if (promptStructData) return; // 如果已经有数据，可能CHAT_COMPLETION_PROMPT_READY已经处理了
            
            // 这是一个备用方案，尝试从当前上下文获取prompt_struct
            try {
                // 这里可能需要根据SillyTavern的具体实现修改
                const context = getContext();
                if (context && context.chat && context.chat.messages) {
                    console.log("[提示词结构导出] 尝试从上下文获取提示词结构");
                    // 这里只是一个示例，实际实现可能需要调整
                    promptStructData = {
                        captureMethod: "backup_from_context",
                        timestamp: new Date().toISOString(),
                        context: context
                    };
                    
                    logPromptStructToConsole();
                    
                    if (extension_settings[extensionName].captureEveryMessage) {
                        downloadPromptStructAsJson();
                    } else {
                        toastr.info("已从上下文捕获提示词结构（备用方法），可以点击导出按钮下载", "提示词结构导出");
                    }
                }
            } catch (error) {
                console.error("[提示词结构导出] 备用捕获方法失败:", error);
                toastr.warning("无法捕获提示词结构，请检查控制台日志", "提示词结构导出");
            }
        });
        
        console.log("[提示词结构导出] 事件监听器设置成功");
    } catch (error) {
        console.error("[提示词结构导出] 设置事件监听器时出错:", error);
        toastr.error(`设置事件监听器失败: ${error.message}`, "提示词结构导出");
    }
}

jQuery(async () => {
    try {
        const settingsHtml = `<div id="prompt_structure_exporter_settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>提示词结构导出</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="flex-container">
                        <label class="checkbox_label flex-container">
                            <input id="prompt_exporter_enabled" type="checkbox" />
                            <span>启用提示词结构导出</span>
                        </label>
                    </div>
                    
                    <div class="flex-container">
                        <label class="checkbox_label flex-container">
                            <input id="prompt_exporter_log_console" type="checkbox" />
                            <span>导出到控制台日志</span>
                        </label>
                    </div>
                    
                    <div class="flex-container">
                        <label class="checkbox_label flex-container">
                            <input id="prompt_exporter_capture_every" type="checkbox" />
                            <span>自动捕获每条消息</span>
                        </label>
                    </div>
                    
                    <div class="flex-container">
                        <div>已捕获次数: <span id="prompt_exporter_capture_count">0</span></div>
                        <div class="menu_button" id="prompt_exporter_clear_counter">重置计数</div>
                    </div>
                    
                    <div class="flex-container">
                        <div class="menu_button" id="prompt_exporter_download">导出当前提示词结构</div>
                    </div>
                    
                    <hr class="sysHR" />
                </div>
            </div>
        </div>`;

        $("#extensions_settings").append(settingsHtml);
        
        // 绑定事件处理
        $("#prompt_exporter_enabled").on("change", handleToggleEnabled);
        $("#prompt_exporter_log_console").on("change", handleToggleLogConsole);
        $("#prompt_exporter_capture_every").on("change", handleToggleCaptureEvery);
        $("#prompt_exporter_clear_counter").on("click", handleClearCounter);
        $("#prompt_exporter_download").on("click", downloadPromptStructAsJson);
        
        // 加载设置
        await loadSettings();
        
        // 设置事件监听器
        setupEventListeners();
        
        console.log("[提示词结构导出] 插件初始化完成");
    } catch (error) {
        console.error("[提示词结构导出] 插件初始化出错:", error);
        toastr.error(`插件初始化失败: ${error.message}`, "提示词结构导出");
    }
});
