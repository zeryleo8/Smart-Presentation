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

                <div class="slide-wrapper" :style="slideStyle">
                    <canvas ref="mainCanvasRef"></canvas>
                </div>
            </div>
        </div>

        <GestureController v-if="isFullscreen" @swipe-left="nextPage" @swipe-right="prevPage"
            @exit-fullscreen="exitFullscreen" />
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import { Monitor, Close } from '@element-plus/icons-vue'
import GestureController from '@/components/Gesture/GestureController.vue'

// 配置 PDF Worker
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

// --- 状态变量 ---
const loading = ref(false)
const isFullscreen = ref(false)
const fileName = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const mainCanvasRef = ref<HTMLCanvasElement | null>(null)

// PDF 数据
let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null
const currentPage = ref(1)
const totalPages = ref(0)
const thumbRefs = ref<Record<number, HTMLCanvasElement>>({})
let currentRenderTask: any = null

const GOTENBERG_URL = '/api-gotenberg/forms/libreoffice/convert'

// --- PDF 渲染逻辑 (保持不变) ---
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
}

// --- 文件处理逻辑 (保持不变) ---
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
    const loadingTask = pdfjsLib.getDocument({
        data: data,
        verbosity: 0
    })
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

// --- 交互逻辑 ---
const jumpToPage = (p: number) => {
    if (p === currentPage.value) return
    currentPage.value = p
    renderMain()
}
const nextPage = () => { if (currentPage.value < totalPages.value) jumpToPage(currentPage.value + 1) }
const prevPage = () => { if (currentPage.value > 1) jumpToPage(currentPage.value - 1) }

// --- 全屏管理 ---
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

// 监听原生全屏变化（处理 ESC 键）
const onFullscreenChange = () => {
    isFullscreen.value = !!document.fullscreenElement
    setTimeout(() => renderMain(), 200) // 重绘以适应尺寸
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
    borderRadius: '4px'
})
</script>

<style scoped lang="scss">
.presentation-container {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: #f0f2f5;
    transition: background-color 0.3s;

    &.is-fullscreen {
        background-color: #000;

        .stage {
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
        }
    }
}

.header {
    height: 50px;
    background: white;
    border-bottom: 1px solid #ddd;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 20px;
    flex-shrink: 0;
}

.main-content {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;
}

.sidebar {
    width: 240px;
    background: #2d3035;
    overflow-y: auto;
    padding: 15px;
    display: flex;
    flex-direction: column;
    gap: 15px;
    border-right: 1px solid #444;
    flex-shrink: 0;

    .thumbnail-wrapper {
        cursor: pointer;
        text-align: center;
        opacity: 0.7;
        transition: all 0.2s;

        &:hover {
            opacity: 1;
        }

        &.active {
            opacity: 1;

            .thumb-box {
                border-color: #409eff;
                box-shadow: 0 0 10px rgba(64, 158, 255, 0.5);
            }
        }

        .thumb-box {
            border: 2px solid transparent;
            background: white;
            border-radius: 4px;
            overflow: hidden;
            line-height: 0;
        }

        .thumb-canvas {
            width: 100%;
            height: auto;
        }
    }
}

.stage {
    flex: 1;
    background: #eef0f3;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
}

.fullscreen-exit-btn {
    position: absolute;
    top: 20px;
    right: 20px;
    background: rgba(255, 255, 255, 0.2);
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    cursor: pointer;
    z-index: 1000;
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    gap: 5px;
    transition: background 0.2s;

    &:hover {
        background: rgba(255, 255, 255, 0.4);
    }
}

.fullscreen-page-indicator {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.5);
    color: white;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 14px;
    z-index: 1000;
}

.slide-wrapper {
    line-height: 0;
}
</style>