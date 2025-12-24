<template>
    <div class="presentation-container" ref="containerRef" :class="{ 'is-fullscreen': isFullscreen }">

        <div class="header" v-show="!isFullscreen">
            <div class="left">
                <el-button type="primary" size="small" @click="triggerUpload">📂 打开文档</el-button>
                <span class="file-name" v-if="fileName">{{ fileName }}</span>
            </div>
            <div class="right">
                <el-button type="success" size="small" @click="toggleFullscreen" :icon="Monitor">
                    开始全屏演示 (自动开启手势)
                </el-button>
            </div>
            <input type="file" ref="fileInputRef" accept=".pptx,.pdf" style="display:none" @change="handleFileChange" />
        </div>

        <div class="main-content" v-loading="loading" element-loading-text="正在处理高清渲染...">

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
import * as pdfjsLib from 'pdfjs-dist'
import { Monitor, Close } from '@element-plus/icons-vue'
import GestureController from '@/components/GestureController.vue'

import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

// --- 状态变量 ---
const loading = ref(false)
const isFullscreen = ref(false)
const isDrawingMode = ref(false)
const fileName = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const mainCanvasRef = ref<HTMLCanvasElement | null>(null)
const drawingCanvasRef = ref<HTMLCanvasElement | null>(null)

// 激光笔状态
const isDrawingAction = ref(false)
const pointerX = ref(0)
const pointerY = ref(0)
let lastDrawPos: { x: number, y: number } | null = null

// PDF 数据
let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null
const currentPage = ref(1)
const totalPages = ref(0)
const thumbRefs = ref<Record<number, HTMLCanvasElement>>({})
let currentRenderTask: any = null

const GOTENBERG_URL = '/api-gotenberg/forms/libreoffice/convert'

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
    drawingCanvasRef.value.width = mainCanvasRef.value.width
    drawingCanvasRef.value.height = mainCanvasRef.value.height

    const ctx = drawingCanvasRef.value.getContext('2d')
    if (ctx) {
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.lineWidth = 5 // 稍微加粗一点
        ctx.strokeStyle = '#ef4444' // 使用 Element Plus 的 Danger Red，更显眼
        ctx.shadowBlur = 2; // 增加一点点光晕
        ctx.shadowColor = '#ef4444';
    }
}

const handlePointerUpdate = (data: { x: number, y: number, isDrawing: boolean }) => {
    if (!isDrawingMode.value || !stageRef.value || !drawingCanvasRef.value) return

    const stageRect = stageRef.value.getBoundingClientRect()
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
        const globalX = stageRect.left + targetX
        const globalY = stageRect.top + targetY
        const canvasX = globalX - canvasRect.left
        const canvasY = globalY - canvasRect.top

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

// --- 文件处理 & PDF 渲染 (保持原有逻辑) ---
const renderPageToCanvas = async (pageNumber: number, canvas: HTMLCanvasElement, fitToContainer: HTMLElement | null = null) => {
    if (!pdfDoc) return
    const page = await pdfDoc.getPage(pageNumber)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const viewportRaw = page.getViewport({ scale: 1 })
    let scale = 1

    if (fitToContainer) {
        const containerW = fitToContainer.clientWidth - 40
        const containerH = fitToContainer.clientHeight - 40
        const scaleW = containerW / viewportRaw.width
        const scaleH = containerH / viewportRaw.height
        scale = Math.min(scaleW, scaleH)
    } else {
        scale = 200 / viewportRaw.width
    }

    const finalViewport = page.getViewport({ scale: scale })
    canvas.width = Math.floor(finalViewport.width * dpr)
    canvas.height = Math.floor(finalViewport.height * dpr)
    canvas.style.width = `${Math.floor(finalViewport.width)}px`
    canvas.style.height = `${Math.floor(finalViewport.height)}px`

    const renderContext = {
        canvasContext: ctx,
        viewport: finalViewport,
        transform: [dpr, 0, 0, dpr, 0, 0],
        canvas: ctx.canvas
    }

    if (fitToContainer && currentRenderTask) currentRenderTask.cancel()
    const task = page.render(renderContext as any)
    if (fitToContainer) currentRenderTask = task
    await task.promise

    if (isDrawingMode.value) initDrawingCanvas()
}

const triggerUpload = () => fileInputRef.value?.click()

const handleFileChange = async (event: Event) => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    fileName.value = file.name
    loading.value = true
    try {
        let arrayBuffer: ArrayBuffer
        if (file.type === 'application/pdf') {
            arrayBuffer = await file.arrayBuffer()
        } else {
            arrayBuffer = await convertPPTX(file)
        }
        await loadPdf(arrayBuffer)
    } catch (e) {
        console.error(e)
        alert("文件加载失败")
    } finally {
        loading.value = false
    }
}

const convertPPTX = async (file: File) => {
    const formData = new FormData()
    formData.append('files', file)
    const res = await fetch(GOTENBERG_URL, { method: 'POST', body: formData })
    if (!res.ok) throw new Error('转换失败')
    return await res.arrayBuffer()
}

const loadPdf = async (data: ArrayBuffer) => {
    if (pdfDoc) pdfDoc.destroy()
    const loadingTask = pdfjsLib.getDocument({ data: data, verbosity: 0 })
    pdfDoc = await loadingTask.promise
    totalPages.value = pdfDoc.numPages
    currentPage.value = 1
    await renderMain()
    setTimeout(renderThumbnails, 100)
}

const renderMain = async () => {
    if (!mainCanvasRef.value || !stageRef.value) return
    await renderPageToCanvas(currentPage.value, mainCanvasRef.value, stageRef.value)
}

const setThumbRef = (el: HTMLCanvasElement, page: number) => {
    if (el) thumbRefs.value[page] = el
}

const renderThumbnails = async () => {
    for (let i = 1; i <= totalPages.value; i++) {
        const canvas = thumbRefs.value[i]
        if (canvas) renderPageToCanvas(i, canvas)
    }
}

const jumpToPage = (p: number) => {
    if (p === currentPage.value) return
    currentPage.value = p
    renderMain()
}
const nextPage = () => { if (currentPage.value < totalPages.value) jumpToPage(currentPage.value + 1) }
const prevPage = () => { if (currentPage.value > 1) jumpToPage(currentPage.value - 1) }

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
    if (!isFullscreen.value) handleToggleDrawing(false)
    setTimeout(() => renderMain(), 200)
}

const onWindowResize = () => {
    if (currentRenderTask) return
    renderMain()
}

onMounted(() => {
    document.addEventListener('fullscreenchange', onFullscreenChange)
    window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => {
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    window.removeEventListener('resize', onWindowResize)
})

const slideStyle = reactive({
    boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
    borderRadius: '4px',
    position: 'relative' as const
})
</script>

/* src/views/Presentation.vue 中的样式替换建议 */
<style scoped lang="scss">
// 变量定义
$primary-color: #409eff;
$sidebar-bg: #1e293b; // 更现代的深蓝灰
$main-bg: #f3f4f6;
$glass-bg: rgba(255, 255, 255, 0.15);
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
    height: 64px; // 增加高度
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

    .file-name {
        margin-left: 12px;
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
    overflow-y: overlay; // 滚动条覆盖模式
    padding: 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    border-right: 1px solid rgba(255, 255, 255, 0.05);
    flex-shrink: 0;

    // 隐藏默认滚动条但保留功能
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

            // 添加页码角标
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
    background-image: radial-gradient(#dfe3e8 1px, transparent 1px); // 点阵背景
    background-size: 20px 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
    padding: 20px;
}

// 统一悬浮控件风格
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

    &:hover {
        transform: translateX(-50%) scale(1.05);
    }
}

.drawing-tip {
    @extend %floating-pill;
    top: 100px; // 下移一点避免遮挡
    left: 50%;
    transform: translateX(-50%);
    background: rgba(234, 179, 8, 0.9); // 黄色警告色
    color: #0f172a;
    font-weight: 600;
    border: none;
    animation: fadeInDown 0.5s ease;
}

@keyframes fadeInDown {
    from {
        opacity: 0;
        transform: translate(-50%, -20px);
    }

    to {
        opacity: 1;
        transform: translate(-50%, 0);
    }
}

.laser-pointer {
    position: absolute;
    width: 20px;
    height: 20px;
    background: rgba(239, 68, 68, 0.6); // 红色
    border: 2px solid #fff;
    border-radius: 50%;
    pointer-events: none;
    transform: translate(-50%, -50%);
    z-index: 9999;
    box-shadow: 0 0 15px rgba(239, 68, 68, 0.8), inset 0 0 5px rgba(255, 255, 255, 0.5);
    transition: width 0.1s cubic-bezier(0.4, 0, 0.2, 1),
        height 0.1s cubic-bezier(0.4, 0, 0.2, 1),
        opacity 0.2s;

    &.drawing {
        width: 8px;
        height: 8px;
        background: #ef4444;
        border-color: #fef08a; // 黄色边框
        box-shadow: 0 0 10px #ef4444;
    }
}

.slide-wrapper {
    line-height: 0;
    position: relative;
    border-radius: 8px;
    // 增加 PPT 投影感
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