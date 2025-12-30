<template>
    <div class="presentation-container" :class="{ 'is-fullscreen': isFullscreen }">

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
                    :class="{ active: currentPage === page }" @click="slideTo(page)">
                    <div class="thumb-number">{{ page }}</div>
                    <VuePdfEmbed v-if="store.pdfSource" :source="store.pdfSource" :page="page" :width="200" />
                </div>
            </div>

            <div class="stage-area" ref="stageContainerRef">
                <swiper
                    v-if="store.pdfSource"
                    :modules="modules"
                    :slides-per-view="1"
                    :space-between="20"
                    :virtual="true"
                    :keyboard="{ enabled: true }"
                    effect="fade"
                    @swiper="onSwiperInit"
                    @slideChange="onSlideChange"
                    class="my-swiper"
                >
                    <swiper-slide v-for="pageIndex in totalPages" :key="pageIndex" :virtualIndex="pageIndex">
                        <div class="slide-content">
                            <div class="layer-wrapper" :style="{ width: slideWidth + 'px', height: slideHeight + 'px' }">
                                
                                <VuePdfEmbed 
                                    :source="store.pdfSource" 
                                    :page="pageIndex" 
                                    class="pdf-layer"
                                    :width="slideWidth"
                                    :height="slideHeight"
                                />

                                <div class="konva-wrapper">
                                    <v-stage :config="stageConfig">
                                        <v-layer>
                                            <v-line v-for="(line, i) in (drawings[pageIndex] || [])" :key="i" :config="line" />
                                            <v-line v-if="isDrawingAction && currentPage === pageIndex" :config="currentLineConfig" />
                                            <v-circle v-if="isDrawingMode && currentPage === pageIndex" :config="pointerConfig" />
                                        </v-layer>
                                    </v-stage>
                                </div>
                            </div>

                        </div>
                    </swiper-slide>
                </swiper>

                <div class="fullscreen-ui" v-if="isFullscreen">
                    <div class="indicator">{{ currentPage }} / {{ totalPages }}</div>
                    <div class="exit-btn" @click="exitFullscreen">
                        <el-icon><Close /></el-icon> 退出
                    </div>
                    <div class="drawing-tip" v-if="isDrawingMode">
                        🖊️ 画板模式：捏合手指书写 | 张开手掌停止
                    </div>
                </div>
            </div>
        </div>

        <GestureController v-if="isFullscreen" 
            @swipe-left="nextPage" 
            @swipe-right="prevPage"
            @exit-fullscreen="exitFullscreen" 
            @toggle-drawing="handleToggleDrawing"
            @update-pointer="handlePointerUpdate" 
        />
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Monitor, Close, Back } from '@element-plus/icons-vue'
import { usePresentationStore } from '@/stores/presentation'
import GestureController from '@/components/GestureController.vue'
import { Swiper, SwiperSlide } from 'swiper/vue'
import { Navigation, Keyboard, Virtual, EffectFade } from 'swiper/modules'
import VuePdfEmbed from 'vue-pdf-embed'

// 引入样式
import 'swiper/css'
import 'swiper/css/effect-fade'
import 'swiper/css/virtual'

const modules = [Navigation, Keyboard, Virtual, EffectFade]
const router = useRouter()
const store = usePresentationStore()

// 状态
const isFullscreen = ref(false)
const currentPage = ref(1)
const totalPages = computed(() => store.pdfDoc?.numPages || 0)
const fileName = computed(() => store.fileName)
const swiperRef = ref<any>(null)
const stageContainerRef = ref<HTMLElement | null>(null)

// 尺寸计算状态
const slideWidth = ref(0)
const slideHeight = ref(0)
const pdfAspectRatio = ref(0) // PDF 页面的宽高比

// 绘图状态
const isDrawingMode = ref(false)
const isDrawingAction = ref(false)
const drawings = ref<Record<number, any[]>>({})
const currentLine = ref<number[]>([])
const pointerPos = ref({ x: 0, y: 0 })

onMounted(async () => {
    if (!store.pdfSource) {
        router.replace('/')
        return
    }
    await initPdfParams()
    window.addEventListener('resize', updateDimensions)
})

onUnmounted(() => {
    window.removeEventListener('resize', updateDimensions)
})

const goHome = () => {
    store.resetStore()
    router.push('/')
}

// --- 初始化 PDF 参数 (获取真实比例) ---
const initPdfParams = async () => {
    if (!store.pdfDoc) return
    try {
        const page = await store.pdfDoc.getPage(1)
        const viewport = page.getViewport({ scale: 1 })
        pdfAspectRatio.value = viewport.width / viewport.height
        updateDimensions()
    } catch (e) {
        console.error("无法获取页面尺寸", e)
    }
}

// --- 尺寸计算 (防止截断) ---
const updateDimensions = () => {
    if (!stageContainerRef.value || pdfAspectRatio.value === 0) return
    
    const { clientWidth, clientHeight } = stageContainerRef.value
    const containerRatio = clientWidth / clientHeight
    
    // 如果 PPT 比容器更“扁”（宽），则以容器宽度为基准
    if (pdfAspectRatio.value > containerRatio) {
        slideWidth.value = clientWidth
        slideHeight.value = clientWidth / pdfAspectRatio.value
    } else {
        // 如果 PPT 比容器更“方”（高），则以容器高度为基准
        slideHeight.value = clientHeight
        slideWidth.value = clientHeight * pdfAspectRatio.value
    }
}

// --- Swiper ---
const onSwiperInit = (swiper: any) => swiperRef.value = swiper
const onSlideChange = (swiper: any) => currentPage.value = swiper.realIndex + 1
const slideTo = (page: number) => swiperRef.value?.slideTo(page - 1)
const nextPage = () => swiperRef.value?.slideNext()
const prevPage = () => swiperRef.value?.slidePrev()

// --- 全屏 ---
const toggleFullscreen = () => {
    const elem = document.documentElement
    if (!document.fullscreenElement) {
        elem.requestFullscreen().then(() => {
            isFullscreen.value = true
            setTimeout(updateDimensions, 500)
        })
    } else {
        exitFullscreen()
    }
}

const exitFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    isFullscreen.value = false
    isDrawingMode.value = false
    setTimeout(updateDimensions, 300)
}

// --- Konva 配置 ---
const stageConfig = computed(() => ({
    width: slideWidth.value,
    height: slideHeight.value
}))

const pointerConfig = computed(() => ({
    x: pointerPos.value.x,
    y: pointerPos.value.y,
    radius: isDrawingAction.value ? 4 : 8,
    fill: '#ef4444',
    opacity: 0.8,
    shadowBlur: 5,
    shadowColor: '#ef4444'
}))

const currentLineConfig = computed(() => ({
    points: currentLine.value,
    stroke: '#ef4444',
    strokeWidth: 4,
    tension: 0.5,
    lineCap: 'round',
    lineJoin: 'round'
}))

// --- 手势与绘图 ---
const handleToggleDrawing = (active: boolean) => {
    isDrawingMode.value = active
    if (!active) {
        isDrawingAction.value = false
        currentLine.value = []
    }
}

const handlePointerUpdate = (data: { x: number, y: number, isDrawing: boolean }) => {
    if (!isDrawingMode.value) return

    const absX = data.x * slideWidth.value
    const absY = data.y * slideHeight.value

    pointerPos.value = { x: absX, y: absY }

    if (data.isDrawing) {
        if (!isDrawingAction.value) {
            isDrawingAction.value = true
            currentLine.value = [absX, absY]
        } else {
            currentLine.value.push(absX, absY)
        }
    } else {
        if (isDrawingAction.value) {
            const page = currentPage.value
            // 修复 TS 报错
            if (!drawings.value[page]) drawings.value[page] = []
            
            drawings.value[page]!.push({
                points: [...currentLine.value],
                stroke: '#ef4444',
                strokeWidth: 4,
                tension: 0.5,
                lineCap: 'round',
                lineJoin: 'round'
            })
            currentLine.value = []
            isDrawingAction.value = false
        }
    }
}
</script>

<style scoped lang="scss">
$primary-color: #409eff;
$sidebar-bg: #1e293b;
$main-bg: #f3f4f6;

.presentation-container {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: $main-bg;
    overflow: hidden;

    &.is-fullscreen {
        background-color: #000;
        .header, .sidebar { display: none; }
        .main-content { padding: 0; }
        .stage-area { padding: 0; background: #000; }
    }
}

.header {
    height: 60px;
    background: white;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 20px;
    border-bottom: 1px solid #eee;
    flex-shrink: 0;
    
    .file-name {
        font-weight: 600;
        margin-left: 10px;
        color: #333;
    }
}

.main-content {
    flex: 1;
    display: flex;
    height: calc(100vh - 60px);
}

.sidebar {
    width: 240px;
    background: $sidebar-bg;
    overflow-y: auto;
    padding: 20px;
    flex-shrink: 0;

    .thumbnail-wrapper {
        margin-bottom: 20px;
        cursor: pointer;
        border: 2px solid transparent;
        border-radius: 6px;
        overflow: hidden;
        background: white;
        position: relative;
        opacity: 0.7;
        transition: all 0.2s;

        &:hover { opacity: 1; }
        &.active {
            border-color: $primary-color;
            opacity: 1;
            box-shadow: 0 0 0 3px rgba($primary-color, 0.2);
        }

        .thumb-number {
            position: absolute;
            top: 4px;
            left: 4px;
            background: rgba(0,0,0,0.6);
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 10;
        }
    }
}

.stage-area {
    flex: 1;
    background: #eef0f3;
    position: relative;
    padding: 20px;
    overflow: hidden;
}

.my-swiper {
    width: 100%;
    height: 100%;
}

.slide-content {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex; /* 关键：让内容居中 */
    justify-content: center;
    align-items: center;
}

.layer-wrapper {
    position: relative;
    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    background: white;
}

.pdf-layer {
    display: block;
    pointer-events: none;
}

.konva-wrapper {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 10;
}

.fullscreen-ui {
    position: absolute;
    z-index: 100;
    width: 100%;
    height: 100%;
    pointer-events: none;

    .indicator, .exit-btn, .drawing-tip {
        position: absolute;
        background: rgba(0,0,0,0.6);
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        backdrop-filter: blur(4px);
        pointer-events: auto;
    }

    .indicator { bottom: 30px; left: 50%; transform: translateX(-50%); }
    .exit-btn { top: 30px; right: 30px; cursor: pointer; display: flex; align-items: center; gap: 5px;}
    .drawing-tip { top: 100px; left: 50%; transform: translateX(-50%); color: #fcd34d; }
}
</style>