<template>
    <div class="presentation-container" ref="containerRef" :class="{ 'is-fullscreen': isFullscreen }">

        <div class="header" v-show="!isFullscreen">
            <div class="left">
                <el-button @click="goHome" :icon="Back" circle class="back-btn" title="返回首页" />
                <span class="file-name" v-if="fileName">{{ fileName }}</span>
            </div>
            <div class="right">
                <el-button type="success" size="small" @click="toggleFullscreen" :icon="Monitor">
                    开始全屏演示 (自动开启手势)
                </el-button>
            </div>
        </div>

        <div class="main-content">

            <div class="sidebar" v-show="!isFullscreen">
                <div v-for="page in totalPages" :key="page" class="thumbnail-wrapper"
                    :class="{ active: currentPage === page }" @click="jumpToPage(page)">
                    <div class="thumb-box">
                        <canvas :ref="el => setThumbRef(el as HTMLCanvasElement, page)" class="thumb-canvas"></canvas>
                    </div>
                </div>
            </div>

            <div class="stage" ref="stageRef">
                <div class="fullscreen-exit-btn" v-if="isFullscreen" @click="exitFullscreen">
                    <el-icon>
                        <Close />
                    </el-icon> 退出演示 (关闭摄像头)
                </div>

                <div class="fullscreen-page-indicator" v-if="isFullscreen">
                    {{ currentPage }} / {{ totalPages }}
                </div>

                <div class="drawing-tip" v-if="isDrawingMode">
                    🔦 激光笔已激活：捏合手指书写，张开手掌静止退出
                </div>

                <div v-if="isDrawingMode" class="laser-pointer" :class="{ 'drawing': isDrawingAction }"
                    :style="{ left: pointerX + 'px', top: pointerY + 'px' }">
                </div>

                <div class="slide-wrapper" :style="slideStyle">
                    <canvas ref="mainCanvasRef"></canvas>
                    <canvas ref="drawingCanvasRef" class="drawing-canvas" v-show="isDrawingMode"></canvas>
                </div>
            </div>
        </div>

        <GestureController v-if="isFullscreen" @swipe-left="nextPage" @swipe-right="prevPage"
            @exit-fullscreen="exitFullscreen" @toggle-drawing="handleToggleDrawing"
            @update-pointer="handlePointerUpdate" />
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { Monitor, Close, Back } from '@element-plus/icons-vue'
import GestureController from '@/components/GestureController.vue'
import { usePresentationStore } from '@/stores/presentation'

const router = useRouter()
const store = usePresentationStore()

// --- 状态变量 ---
const isFullscreen = ref(false)
const isDrawingMode = ref(false)
const fileName = ref(store.fileName)

// DOM 引用
const containerRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const mainCanvasRef = ref<HTMLCanvasElement | null>(null)
const drawingCanvasRef = ref<HTMLCanvasElement | null>(null)
const thumbRefs = ref<Record<number, HTMLCanvasElement>>({})

// PDF 状态
const currentPage = ref(1)
const totalPages = ref(0)
let currentRenderTask: any = null

// 激光笔状态
const isDrawingAction = ref(false)
const pointerX = ref(0)
const pointerY = ref(0)
let lastDrawPos: { x: number, y: number } | null = null

// --- 生命周期 ---
onMounted(async () => {
    // 核心检查：如果 Store 中没有 PDF 对象（例如用户刷新了页面），回退到首页
    if (!store.pdfDoc) {
        router.replace('/')
        return
    }

    totalPages.value = store.pdfDoc.numPages
    currentPage.value = 1

    await renderMain()
    // 延迟渲染缩略图，优先保证主屏加载
    setTimeout(renderThumbnails, 100)

    document.addEventListener('fullscreenchange', onFullscreenChange)
    window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => {
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    window.removeEventListener('resize', onWindowResize)
    // 离开页面时清理 Store，或者根据需求保留
    // store.resetStore() 
})

// --- 导航逻辑 ---
const goHome = () => {
    store.resetStore()
    router.push('/')
}

const jumpToPage = (p: number) => {
    if (p === currentPage.value) return
    currentPage.value = p
    renderMain()
}

const nextPage = () => {
    if (currentPage.value < totalPages.value) jumpToPage(currentPage.value + 1)
}

const prevPage = () => {
    if (currentPage.value > 1) jumpToPage(currentPage.value - 1)
}

// --- PDF 渲染逻辑 ---
const renderPageToCanvas = async (pageNumber: number, canvas: HTMLCanvasElement, fitToContainer: HTMLElement | null = null) => {
    if (!store.pdfDoc) return
    const page = await store.pdfDoc.getPage(pageNumber)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const viewportRaw = page.getViewport({ scale: 1 })
    let scale = 1

    if (fitToContainer) {
        // 适配容器大小，留出一点边距
        const containerW = fitToContainer.clientWidth - 40
        const containerH = fitToContainer.clientHeight - 40
        const scaleW = containerW / viewportRaw.width
        const scaleH = containerH / viewportRaw.height
        scale = Math.min(scaleW, scaleH)
    } else {
        // 缩略图固定宽度比例
        scale = 200 / viewportRaw.width
    }

    const finalViewport = page.getViewport({ scale: scale })
    
    // 设置 Canvas 尺寸（高清屏适配）
    canvas.width = Math.floor(finalViewport.width * dpr)
    canvas.height = Math.floor(finalViewport.height * dpr)
    canvas.style.width = `${Math.floor(finalViewport.width)}px`
    canvas.style.height = `${Math.floor(finalViewport.height)}px`

    const renderContext = {
        canvasContext: ctx,
        viewport: finalViewport,
        transform: [dpr, 0, 0, dpr, 0, 0], // CSS 缩放矩阵
        canvas: ctx.canvas
    }

    // 如果是主屏渲染，取消上一次未完成的任务
    if (fitToContainer && currentRenderTask) {
        currentRenderTask.cancel()
    }

    const task = page.render(renderContext as any)
    
    if (fitToContainer) {
        currentRenderTask = task
    }

    try {
        await task.promise
    } catch (e: any) {
        if (e.name !== 'RenderingCancelledException') {
            console.error(e)
        }
    }

    // 如果处于画板模式，重置画板层尺寸
    if (fitToContainer && isDrawingMode.value) {
        initDrawingCanvas()
    }
}

const renderMain = async () => {
    if (!mainCanvasRef.value || !stageRef.value) return
    await renderPageToCanvas(currentPage.value, mainCanvasRef.value, stageRef.value)
}

const renderThumbnails = async () => {
    for (let i = 1; i <= totalPages.value; i++) {
        const canvas = thumbRefs.value[i]
        if (canvas) renderPageToCanvas(i, canvas)
    }
}

const setThumbRef = (el: HTMLCanvasElement, page: number) => {
    if (el) thumbRefs.value[page] = el
}

// --- 全屏逻辑 ---
const toggleFullscreen = () => {
    if (!containerRef.value) return
    if (!document.fullscreenElement) {
        containerRef.value.requestFullscreen().catch(err => console.error(err))
    } else {
        document.exitFullscreen()
    }
}

const exitFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
}

const onFullscreenChange = () => {
    isFullscreen.value = !!document.fullscreenElement
    // 退出全屏时关闭画板
    if (!isFullscreen.value) handleToggleDrawing(false)
    // 重新计算布局渲染
    setTimeout(() => renderMain(), 200)
}

const onWindowResize = () => {
    if (currentRenderTask) return
    renderMain()
}

// --- 画板与激光笔逻辑 ---
const handleToggleDrawing = (active: boolean) => {
    isDrawingMode.value = active
    if (active) {
        initDrawingCanvas()
    } else {
        const ctx = drawingCanvasRef.value?.getContext('2d')
        ctx?.clearRect(0, 0, drawingCanvasRef.value!.width, drawingCanvasRef.value!.height)
        lastDrawPos = null
    }
}

const initDrawingCanvas = () => {
    if (!drawingCanvasRef.value || !mainCanvasRef.value) return
    // 保持画板与主 Canvas 像素一致
    drawingCanvasRef.value.width = mainCanvasRef.value.width
    drawingCanvasRef.value.height = mainCanvasRef.value.height
    
    const ctx = drawingCanvasRef.value.getContext('2d')
    if (ctx) {
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.lineWidth = 5
        ctx.strokeStyle = '#ef4444' // 红色笔迹
        ctx.shadowBlur = 2
        ctx.shadowColor = '#ef4444'
    }
}

const handlePointerUpdate = (data: { x: number, y: number, isDrawing: boolean }) => {
    if (!isDrawingMode.value || !stageRef.value || !drawingCanvasRef.value) return

    const stageRect = stageRef.value.getBoundingClientRect()
    // 计算相对于 Stage 的坐标
    const targetX = data.x * stageRect.width
    const targetY = data.y * stageRect.height

    pointerX.value = targetX
    pointerY.value = targetY
    isDrawingAction.value = data.isDrawing

    const canvas = drawingCanvasRef.value
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (data.isDrawing) {
        const canvasRect = canvas.getBoundingClientRect()
        // 转换全局坐标到 Canvas 内部坐标
        const globalX = stageRect.left + targetX
        const globalY = stageRect.top + targetY
        const canvasX = globalX - canvasRect.left
        const canvasY = globalY - canvasRect.top

        // 绘制线条
        if (lastDrawPos) {
            ctx.beginPath()
            ctx.moveTo(lastDrawPos.x, lastDrawPos.y)
            ctx.lineTo(canvasX, canvasY)
            ctx.stroke()
        }
        lastDrawPos = { x: canvasX, y: canvasY }
    } else {
        lastDrawPos = null
    }
}

const slideStyle = reactive({
    boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
    borderRadius: '4px',
    position: 'relative' as const
})
</script>

<style scoped lang="scss">
// 变量定义
$primary-color: #409eff;
$sidebar-bg: #1e293b;
$main-bg: #f3f4f6;
$glass-border: 1px solid rgba(255, 255, 255, 0.2);

.presentation-container {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: $main-bg;
    transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);

    &.is-fullscreen {
        background-color: #000;
        .stage {
            padding: 0;
            background: #000;
        }
    }
}

.header {
    height: 64px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 24px;
    flex-shrink: 0;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
    z-index: 10;

    .left {
        display: flex;
        align-items: center;
        
        .back-btn {
            margin-right: 12px;
            &:hover {
                background-color: #ecf5ff;
                color: $primary-color;
            }
        }
    }

    .file-name {
        font-weight: 600;
        color: #334155;
        font-size: 14px;
    }
}

.main-content {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;
}

.sidebar {
    width: 260px;
    background: $sidebar-bg;
    overflow-y: overlay;
    padding: 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    border-right: 1px solid rgba(255, 255, 255, 0.05);
    flex-shrink: 0;

    &::-webkit-scrollbar {
        width: 6px;
    }
    &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
    }

    .thumbnail-wrapper {
        cursor: pointer;
        transition: all 0.3s ease;
        position: relative;
        padding: 4px;
        border-radius: 8px;

        &:hover {
            background: rgba(255, 255, 255, 0.05);
            transform: translateY(-2px);
        }

        &.active {
            background: rgba($primary-color, 0.15);
            
            .thumb-box {
                border-color: $primary-color;
                box-shadow: 0 0 0 3px rgba($primary-color, 0.3);
            }

            &::after {
                content: '';
                position: absolute;
                left: -16px;
                top: 50%;
                transform: translateY(-50%);
                width: 4px;
                height: 24px;
                background: $primary-color;
                border-radius: 0 4px 4px 0;
            }
        }

        .thumb-box {
            border: 2px solid transparent;
            background: white;
            border-radius: 6px;
            overflow: hidden;
            line-height: 0;
            transition: border-color 0.3s, box-shadow 0.3s;
        }

        .thumb-canvas {
            width: 100%;
            height: auto;
            display: block;
        }
    }
}

.stage {
    flex: 1;
    background: #eef0f3;
    background-image: radial-gradient(#dfe3e8 1px, transparent 1px);
    background-size: 20px 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
    padding: 20px;
}

// 悬浮控件通用样式
%floating-pill {
    position: absolute;
    background: rgba(30, 41, 59, 0.7);
    backdrop-filter: blur(8px);
    color: white;
    border-radius: 50px;
    padding: 8px 20px;
    font-size: 14px;
    z-index: 1000;
    border: $glass-border;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    transition: all 0.3s;
    user-select: none;

    &:hover {
        background: rgba(30, 41, 59, 0.9);
        transform: scale(1.05);
    }
}

.fullscreen-exit-btn {
    @extend %floating-pill;
    top: 30px;
    right: 30px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
}

.fullscreen-page-indicator {
    @extend %floating-pill;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    font-variant-numeric: tabular-nums;
    letter-spacing: 1px;
}

.drawing-tip {
    @extend %floating-pill;
    top: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(234, 179, 8, 0.9);
    color: #0f172a;
    font-weight: 600;
    border: none;
    animation: fadeInDown 0.5s ease;
}

@keyframes fadeInDown {
    from { opacity: 0; transform: translate(-50%, -20px); }
    to { opacity: 1; transform: translate(-50%, 0); }
}

.laser-pointer {
    position: absolute;
    width: 20px;
    height: 20px;
    background: rgba(239, 68, 68, 0.6);
    border: 2px solid #fff;
    border-radius: 50%;
    pointer-events: none;
    transform: translate(-50%, -50%);
    z-index: 9999;
    box-shadow: 0 0 15px rgba(239, 68, 68, 0.8), inset 0 0 5px rgba(255, 255, 255, 0.5);
    transition: width 0.1s, height 0.1s, opacity 0.2s;

    &.drawing {
        width: 8px;
        height: 8px;
        background: #ef4444;
        border-color: #fef08a;
        box-shadow: 0 0 10px #ef4444;
    }
}

.slide-wrapper {
    line-height: 0;
    position: relative;
    border-radius: 8px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3) !important;
    transition: transform 0.2s;
}

.drawing-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 10;
    pointer-events: none;
}
</style>