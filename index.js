import { extension_settings, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import { eventSource, event_types } from "../../../../script.js";
import { download } from "../../../utils.js";
import { callPopup, isMobile } from "../../../../script.js";

// 插件名称，需要与文件夹名一致
const extensionName = "prompt-structure-exporter";

// 插件设置初始化
const defaultSettings = {
    enabled: true,
    autoExport: false,
    exportLocation: "",
    lastExportTimestamp: 0,
};

// 初始化插件设置
function loadSettings() {
    console.log(`${extensionName}: 正在加载设置`);
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
        console.log(`${extensionName}: 使用默认设置初始化`);
    }
    
    // 更新UI状态
    $('#prompt_exporter_enabled').prop('checked', extension_settings[extensionName].enabled);
    $('#prompt_auto_export').prop('checked', extension_settings[extensionName].autoExport);
    $('#prompt_export_location').val(extension_settings[extensionName].exportLocation);
    updateLastExportTime();
}

function updateLastExportTime() {
    const timestamp = extension_settings[extensionName].lastExportTimestamp;
    if (timestamp) {
        const date = new Date(timestamp);
        $('#last_export_time').text(date.toLocaleString());
    } else {
        $('#last_export_time').text('尚未导出');
    }
}

// 导出提示词结构
async function exportPromptStructure(promptStruct, fromAutoExport = false) {
    try {
        if (!promptStruct) {
            console.error(`${extensionName}: 提示词结构为空，无法导出`);
            toastr.error('提示词结构为空，无法导出', '导出失败');
            return false;
        }

        console.log(`${extensionName}: 准备导出提示词结构`, promptStruct);
        
        // 创建JSON字符串
        const jsonString = JSON.stringify(promptStruct, null, 2);
        
        // 生成文件名 (使用角色ID和时间戳)
        const timestamp = Date.now();
        extension_settings[extensionName].lastExportTimestamp = timestamp;
        saveSettingsDebounced();
        updateLastExportTime();
        
        const charName = promptStruct.Charname || 'unknown';
        const fileName = `prompt_structure_${charName}_${timestamp}.json`;
        
        // 下载文件
        download(jsonString, fileName, 'application/json');
        
        if (!fromAutoExport) {
            toastr.success('提示词结构已成功导出', '导出成功');
        }
        
        console.log(`${extensionName}: 提示词结构导出成功 - ${fileName}`);
        return true;
    } catch (error) {
        console.error(`${extensionName}: 导出提示词结构时出错`, error);
        if (!fromAutoExport) {
            toastr.error(`导出失败: ${error.message}`, '导出错误');
        }
        return false;
    }
}

// 用于存储捕获到的最新提示词结构
let lastCapturedPromptStruct = null;

// 监听提示词准备完成事件
function setupEventListeners() {
    console.log(`${extensionName}: 设置事件监听器`);
    
    // 监听提示词准备完成事件
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, (data) => {
        try {
            if (!extension_settings[extensionName].enabled) {
                console.log(`${extensionName}: 插件已禁用，不捕获提示词结构`);
                return;
            }
            
            console.log(`${extensionName}: 捕获到CHAT_COMPLETION_PROMPT_READY事件`, data);
            
            if (data && data.prompt_struct) {
                lastCapturedPromptStruct = structuredClone(data.prompt_struct);
                console.log(`${extensionName}: 成功捕获提示词结构`);
                
                // 如果启用了自动导出
                if (extension_settings[extensionName].autoExport) {
                    console.log(`${extensionName}: 自动导出已启用，正在导出提示词结构`);
                    exportPromptStructure(lastCapturedPromptStruct, true);
                }
            } else {
                console.warn(`${extensionName}: 无法捕获提示词结构，数据格式不符合预期`);
            }
        } catch (error) {
            console.error(`${extensionName}: 处理CHAT_COMPLETION_PROMPT_READY事件时出错`, error);
        }
    });
}

// 手动导出提示词结构的按钮点击事件
function onExportButtonClick() {
    if (!lastCapturedPromptStruct) {
        console.warn(`${extensionName}: 尚未捕获提示词结构，无法导出`);
        toastr.warning('尚未捕获提示词结构。请先发送一条消息，然后再尝试导出。', '无可导出数据');
        return;
    }
    
    console.log(`${extensionName}: 手动导出提示词结构`);
    exportPromptStructure(lastCapturedPromptStruct);
}

// 切换插件启用状态
function onEnabledChange(event) {
    const enabled = $(event.target).prop('checked');
    extension_settings[extensionName].enabled = enabled;
    console.log(`${extensionName}: 插件${enabled ? '启用' : '禁用'}`);
    saveSettingsDebounced();
}

// 切换自动导出
function onAutoExportChange(event) {
    const autoExport = $(event.target).prop('checked');
    extension_settings[extensionName].autoExport = autoExport;
    console.log(`${extensionName}: 自动导出${autoExport ? '启用' : '禁用'}`);
    saveSettingsDebounced();
}

// 更改导出位置
function onExportLocationChange(event) {
    const location = $(event.target).val();
    extension_settings[extensionName].exportLocation = location;
    console.log(`${extensionName}: 导出位置更改为 "${location}"`);
    saveSettingsDebounced();
}

// 查看结构按钮点击事件
async function onViewStructureClick() {
    if (!lastCapturedPromptStruct) {
        console.warn(`${extensionName}: 尚未捕获提示词结构，无法查看`);
        toastr.warning('尚未捕获提示词结构。请先发送一条消息，然后再尝试查看。', '无可查看数据');
        return;
    }
    
    try {
        console.log(`${extensionName}: 准备在弹窗中显示提示词结构`);
        
        // 格式化JSON以便于查看
        const prettyJson = JSON.stringify(lastCapturedPromptStruct, null, 2);
        
        // 创建包含代码块的HTML
        const htmlContent = `
            <div style="max-height: 70vh; overflow-y: auto;">
                <pre style="white-space: pre-wrap; word-wrap: break-word; text-align: left; max-width: 100%;">${prettyJson}</pre>
            </div>
        `;
        
        // 显示弹窗
        await callPopup(htmlContent, 'text', '', { wide: true, large: true });
        
    } catch (error) {
        console.error(`${extensionName}: 查看提示词结构时出错`, error);
        toastr.error(`查看失败: ${error.message}`, '查看错误');
    }
}

// 插件初始化
jQuery(async () => {
    console.log(`${extensionName}: 插件初始化`);
    
    // 创建设置UI
    const settingsHtml = `<div class="prompt-exporter-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>提示词结构导出工具</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="flex-container alignitems-center">
                    <label class="checkbox_label toggle-description" for="prompt_exporter_enabled">
                        <input type="checkbox" id="prompt_exporter_enabled" name="prompt_exporter_enabled">
                        <span>启用捕获</span>
                    </label>
                    <label class="checkbox_label toggle-description" for="prompt_auto_export">
                        <input type="checkbox" id="prompt_auto_export" name="prompt_auto_export">
                        <span>自动导出</span>
                    </label>
                </div>
                
                <div class="flex-container mt-4">
                    <input id="prompt_export_button" class="menu_button" type="button" value="导出提示词结构" />
                    <input id="prompt_view_button" class="menu_button" type="button" value="查看提示词结构" />
                </div>
                
                <div class="flex-container mt-4">
                    <div>最后导出时间: <span id="last_export_time">尚未导出</span></div>
                </div>
                
                <hr class="sysHR">
                
                <div class="flex-container flexFlowColumn alignitems-center">
                    <div class="flex-container flexNoGap flexFlowColumn" style="text-align: left; margin-top: 10px;">
                        <div class="justifyLeft w-100p">
                            <h4>使用说明:</h4>
                            <p>1. 启用捕获功能。</p>
                            <p>2. 发送一条消息以捕获提示词结构。</p>
                            <p>3. 使用"导出提示词结构"按钮导出为JSON文件，或者启用"自动导出"在每次发送消息后自动导出。</p>
                            <p>4. 使用"查看提示词结构"按钮可以直接在界面中查看结构内容。</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    // 添加设置到扩展设置面板
    $('#extensions_settings').append(settingsHtml);
    
    // 绑定事件处理函数
    $('#prompt_exporter_enabled').on('change', onEnabledChange);
    $('#prompt_auto_export').on('change', onAutoExportChange);
    $('#prompt_export_location').on('input', onExportLocationChange);
    $('#prompt_export_button').on('click', onExportButtonClick);
    $('#prompt_view_button').on('click', onViewStructureClick);
    
    // 加载设置并设置事件监听器
    loadSettings();
    setupEventListeners();
    
    console.log(`${extensionName}: 插件初始化完成`);
});
