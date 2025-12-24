<template>
    <div class="editor-page">
        <div class="editor-header">
            <div class="left">
                <el-icon class="back-icon" @click="goBack">
                    <ArrowLeft />
                </el-icon>
                <span class="file-name">演示文稿.pptx</span>
            </div>
            <div class="right">
                <el-switch v-model="gestureEnabled" active-text="手势控制" />
            </div>
        </div>

        <div id="onlyoffice-placeholder" class="editor-body"></div>

        <GestureController v-if="gestureEnabled" @swipe-left="handleNextSlide" @swipe-right="handlePrevSlide" />
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import GestureController from '@/components/Gesture/GestureController.vue'

const router = useRouter()
const gestureEnabled = ref(false)

// OnlyOffice 服务地址
const DOCUMENT_SERVER_URL = 'http://localhost:8000'

// --- 初始化 OnlyOffice ---
const initEditor = () => {
    // @ts-ignore
    if (!window.DocsAPI) {
        console.error('❌ OnlyOffice API 脚本未加载');
        return;
    }

    const placeholderId = "onlyoffice-placeholder";

    // 1. 定义回调事件
    const onAppReady = () => {
        console.log("✅ [Event] onAppReady: 编辑器加载完成！");
    };

    const onError = (event: any) => {
        console.error("❌ [Event] onError:", event);
    }

    // 2. 基础配置
    const config = {
        "document": {
            "fileType": "pptx",
            "key": "test_" + Date.now(), // 随机 key 避免缓存
            "title": "本地测试演示.pptx",
            // ⚠️ 请务必确认此 IP 是你当前的局域网 IP
            "url": "http://192.168.0.43:5173/test.pptx",
            "permissions": { "download": true, "edit": true, "print": true }
        },
        "documentType": "slide",
        "editorConfig": {
            "mode": "edit",
            "lang": "zh-CN",
            // 自动登录，跳过弹窗
            "user": { "id": "dev-001", "name": "Developer" },
            "events": {
                "onAppReady": onAppReady,
                "onError": onError
            }
        },
        "height": "100%",
        "width": "100%"
    };

    console.log("🚀 开始初始化 OnlyOffice...");

    // 3. 创建实例并挂载到全局
    // @ts-ignore
    const docEditor = new DocsAPI.DocEditor(placeholderId, config);

    // 简单粗暴地挂载，方便调试
    // @ts-ignore
    window.myDocEditor = docEditor;
    console.log("📦 实例已创建，挂载到 window.myDocEditor");
};

// --- 动态加载 API 脚本 ---
const loadScript = () => {
    // @ts-ignore
    if (window.DocsAPI) {
        initEditor();
        return;
    }
    const script = document.createElement('script')
    script.src = `${DOCUMENT_SERVER_URL}/web-apps/apps/api/documents/api.js`
    script.async = true
    script.onload = () => {
        initEditor()
    }
    document.body.appendChild(script)
}

// --- 手势回调逻辑 ---
const handleNextSlide = () => {
    console.log("👉 尝试模拟键盘右键");
    const iframe = document.querySelector('iframe');
    if (iframe && iframe.contentWindow) {
        // 向 iframe 内部派发键盘事件
        iframe.contentWindow.postMessage(JSON.stringify({
            type: 'onExternalPluginMessage',
            subType: '按键模拟', // 这是一个猜测的内部通道，通常很难打通
            data: { keyCode: 39 } 
        }), '*');
        
        // 或者直接派发（跨域会被拦截）
        try {
            const event = new KeyboardEvent('keydown', {
                key: 'ArrowRight',
                code: 'ArrowRight',
                keyCode: 39,
                bubbles: true
            });
            iframe.contentDocument?.dispatchEvent(event);
        } catch(e) {
            console.error("跨域限制，无法直接控制放映层", e);
        }
    }
}

const handlePrevSlide = () => {
    // @ts-ignore
    const editor = window.myDocEditor;

    if (!editor || typeof editor.serviceCommand !== 'function') {
        console.error("❌ 无法翻页：未找到 serviceCommand 方法");
        return;
    }

    console.log("👈 [ServiceCommand] 上一页");
    editor.serviceCommand("prev");
}

// 执行 OnlyOffice 命令
const executeCommand = (action: 'next' | 'prev') => {
    // @ts-ignore
    const editor = window.myDocEditor;

    // 这是一个最纯粹的检查：如果 editor 没准备好，这里就会报错或者无效
    // 这正是我们需要观察的
    if (!editor || typeof editor.callCommand !== 'function') {
        console.error("❌ 错误：编辑器实例未就绪 (callCommand 不存在)");
        // @ts-ignore
        console.log("当前 window.myDocEditor:", window.myDocEditor);
        return;
    }

    console.log(`⚡️ 发送命令: ${action}`);
    editor.callCommand(function () {
        // @ts-ignore
        var oPresentation = Api.GetPresentation();
        var current = oPresentation.GetCurrentSlide().GetIndex();
        var count = oPresentation.GetSlidesCount();

        // 注意：OnlyOffice 内部运行环境无法读取外部变量 action
        // 所以我们需要根据外部逻辑这里只能写死，或者写两份代码
        // 这里为了测试，我们简单写一个逻辑：如果有 Slide 就算成功
        // @ts-ignore
        Api.GetPresentation().GetSlides().Item(0).Select(); // 测试代码：总是跳回第一页，证明连通性
    });

    // 真正的逻辑应该像之前那样写，但为了测试连通性，上面那行足够了
}

onMounted(() => {
    loadScript()
})

onBeforeUnmount(() => {
    // @ts-ignore
    if (window.myDocEditor && window.myDocEditor.destroyEditor) {
        // @ts-ignore
        window.myDocEditor.destroyEditor()
    }
})

const goBack = () => {
    router.push('/')
}
</script>

<style scoped lang="scss">
@use '@/assets/styles/variables.scss' as *;

.editor-page {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #f5f5f5;
    position: fixed;
    top: 0;
    left: 0;
    z-index: 100;
}

.editor-header {
    height: 48px;
    background-color: $primary-color;
    color: white;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;

    .left {
        display: flex;
        align-items: center;
        gap: 15px;
    }

    .back-icon {
        cursor: pointer;
        font-size: 20px;
    }

    .file-name {
        font-weight: 600;
    }
}

.editor-body {
    flex: 1;
    width: 100%;
    height: 100%;
}
</style>