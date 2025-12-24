<template>
    <div class="gesture-container">
        <div class="camera-wrapper" style="transform: scaleX(-1);">
            <video ref="videoRef" autoplay playsinline id="webcam"></video>
            <canvas ref="canvasRef" id="output_canvas"></canvas>
        </div>

        <div class="status-badge" :class="{ 'drawing-mode': isDrawingMode, active: !isDrawingMode }">
            <div class="indicator" :class="{ 'pinching': isPinching }"></div>
            {{ getStatusText() }}
        </div>

        <div class="gesture-hint">
            <template v-if="isDrawingMode">
                👌 捏合书写 | ✋ 张手静止退出
            </template>
            <template v-else>
                👋 挥手翻页 | ☝️ 食指静止开启画板
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { FilesetResolver, HandLandmarker, DrawingUtils } from '@mediapipe/tasks-vision'

const emit = defineEmits(['swipe-left', 'swipe-right', 'exit-fullscreen', 'toggle-drawing', 'update-pointer'])

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let handLandmarker: HandLandmarker | null = null
let animationFrameId: number
let lastVideoTime = -1

// --- 状态标志 ---
const isDrawingMode = ref(false)
const isPinching = ref(false)

// --- 挥手检测变量 ---
let lastWristX: number | null = null
let lastSwipeTime = 0
const SWIPE_THRESHOLD = 0.15
const COOLDOWN = 800

// --- 握拳检测变量 (退出全屏) ---
let fistHoldStartTime = 0
const FIST_HOLD_THRESHOLD = 600
let isFistDetected = false

// --- 食指静止检测变量 (开启画板) ---
let indexHoldStartTime = 0
let indexHoldStartPos: { x: number, y: number } | null = null
const INDEX_HOLD_DURATION = 1000 // 开启需静止2秒

// --- 张手静止检测变量 (退出画板 - 新增) ---
let palmHoldStartTime = 0
let palmHoldStartPos: { x: number, y: number } | null = null
const PALM_HOLD_DURATION = 1000 // 退出需静止1秒

// 通用静止容差
const MOVEMENT_TOLERANCE = 0.05

// --- 平滑滤波变量 ---
let smoothedX = 0
let smoothedY = 0
const SMOOTHING_FACTOR = 0.2

// 判断手指弯曲
const isFingerCurled = (landmarks: any[], tipIdx: number, jointIdx: number) => {
    return landmarks[tipIdx].y > landmarks[jointIdx].y
}

const getStatusText = () => {
    if (!isDrawingMode.value) return 'AI 视觉已激活'
    return isPinching.value ? '🖊️ 书写中...' : '🔦 激光笔模式'
}

// MediaPipe 初始化
const createHandLandmarker = async () => {
    try {
        const vision = await FilesetResolver.forVisionTasks("/wasm")
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate: "GPU" },
            runningMode: "VIDEO", numHands: 1
        })
        startCamera()
    } catch (e) { console.error("MediaPipe 模型加载失败:", e) }
}

const startCamera = async () => {
    if (!videoRef.value) return
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 320, height: 240, frameRate: { ideal: 30 } }
        })
        videoRef.value.srcObject = stream
        videoRef.value.addEventListener('loadeddata', predictWebcam)
    } catch (err) { console.error("无法打开摄像头:", err) }
}

const predictWebcam = async () => {
    if (!handLandmarker || !videoRef.value || !canvasRef.value) return

    if (videoRef.value.videoWidth > 0 && canvasRef.value.width !== videoRef.value.videoWidth) {
        canvasRef.value.width = videoRef.value.videoWidth
        canvasRef.value.height = videoRef.value.videoHeight
    }

    let startTimeMs = performance.now()
    if (lastVideoTime !== videoRef.value.currentTime) {
        lastVideoTime = videoRef.value.currentTime
        const results = handLandmarker.detectForVideo(videoRef.value, startTimeMs)

        const ctx = canvasRef.value.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)

        if (results.landmarks && results.landmarks.length > 0) {
            const landmarks = results.landmarks[0]
            const drawingUtils = new DrawingUtils(ctx)

            // 视觉反馈颜色
            let connectorColor = "#00FF00"
            if (isDrawingMode.value) connectorColor = "#00FFFF"
            if (isPinching.value) connectorColor = "#FF0000"

            drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, { color: connectorColor, lineWidth: 3 })
            drawingUtils.drawLandmarks(landmarks, { color: "#FF0000", lineWidth: 1 })

            detectGestures(landmarks)
        } else {
            resetStates()
        }
    }
    animationFrameId = window.requestAnimationFrame(predictWebcam)
}

const resetStates = () => {
    lastWristX = null
    fistHoldStartTime = 0
    isFistDetected = false
    indexHoldStartTime = 0
    indexHoldStartPos = null
    palmHoldStartTime = 0
    palmHoldStartPos = null
    isPinching.value = false
}

const detectGestures = (landmarks: any) => {
    const now = Date.now()
    const wrist = landmarks[0]
    const indexTip = landmarks[8]
    const thumbTip = landmarks[4]

    // 检测手指状态
    const fingersCurled = [
        isFingerCurled(landmarks, 8, 6),   // 食指
        isFingerCurled(landmarks, 12, 10), // 中指
        isFingerCurled(landmarks, 16, 14), // 无名指
        isFingerCurled(landmarks, 20, 18)  // 小指
    ]

    // 姿态判定
    const isFist = fingersCurled.every(c => c) // 握拳：4指全弯
    const isIndexOnly = !fingersCurled[0] && fingersCurled[1] && fingersCurled[2] && fingersCurled[3] // 仅食指
    const isPalmOpen = !fingersCurled[0] && !fingersCurled[1] && !fingersCurled[2] && !fingersCurled[3] // 张手：4指全直

    // =========================================
    // 逻辑 A: 画板模式 (Exit via Palm Open)
    // =========================================
    if (isDrawingMode.value) {

        // 1. 张开手掌静止退出 (替代握拳)
        if (isPalmOpen) {
            isPinching.value = false // 强制打断捏合

            if (palmHoldStartTime === 0) {
                palmHoldStartTime = now
                palmHoldStartPos = { x: wrist.x, y: wrist.y } // 记录手腕位置作为参考
            } else {
                // 计算抖动距离
                const dist = Math.hypot(wrist.x - palmHoldStartPos!.x, wrist.y - palmHoldStartPos!.y)

                if (dist > MOVEMENT_TOLERANCE) {
                    // 动了，重置
                    palmHoldStartTime = now
                    palmHoldStartPos = { x: wrist.x, y: wrist.y }
                } else if (now - palmHoldStartTime > PALM_HOLD_DURATION) {
                    // 静止满足时间，触发退出
                    console.log("✋ [触发] 退出画板")
                    isDrawingMode.value = false
                    emit('toggle-drawing', false)
                    palmHoldStartTime = 0
                }
            }
        } else {
            palmHoldStartTime = 0
            palmHoldStartPos = null

            // 2. 激光笔 & 书写逻辑 (非张手状态下)
            // 捏合检测
            const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y)
            const PINCH_THRESHOLD = 0.1
            const nowPinching = pinchDist < PINCH_THRESHOLD

            isPinching.value = nowPinching

            // 坐标平滑
            const targetX = 1 - indexTip.x
            const targetY = indexTip.y

            if (smoothedX === 0 && smoothedY === 0) {
                smoothedX = targetX
                smoothedY = targetY
            } else {
                smoothedX += (targetX - smoothedX) * SMOOTHING_FACTOR
                smoothedY += (targetY - smoothedY) * SMOOTHING_FACTOR
            }

            emit('update-pointer', {
                x: smoothedX,
                y: smoothedY,
                isDrawing: nowPinching
            })
        }
    }
    // =========================================
    // 逻辑 B: 普通模式 (Enter via Index, Exit via Fist)
    // =========================================
    else {
        // 重置画板相关的计时器
        palmHoldStartTime = 0

        // 1. 食指静止开启画板
        if (isIndexOnly) {
            if (indexHoldStartTime === 0) {
                indexHoldStartTime = now
                indexHoldStartPos = { x: indexTip.x, y: indexTip.y }
            } else {
                const dist = Math.hypot(indexTip.x - indexHoldStartPos!.x, indexTip.y - indexHoldStartPos!.y)
                if (dist > MOVEMENT_TOLERANCE) {
                    indexHoldStartTime = now
                    indexHoldStartPos = { x: indexTip.x, y: indexTip.y }
                } else if (now - indexHoldStartTime > INDEX_HOLD_DURATION) {
                    console.log("☝️ [触发] 开启画板")
                    isDrawingMode.value = true
                    // 初始化坐标，防止跳跃
                    smoothedX = 1 - indexTip.x
                    smoothedY = indexTip.y
                    emit('toggle-drawing', true)
                    indexHoldStartTime = 0
                }
            }
        } else {
            indexHoldStartTime = 0
            indexHoldStartPos = null
        }

        // 2. 挥手翻页 (非握拳)
        if (!isFist && !isIndexOnly && now - lastSwipeTime > COOLDOWN) {
            if (lastWristX !== null) {
                const delta = wrist.x - lastWristX
                if (Math.abs(delta) > SWIPE_THRESHOLD) {
                    if (delta < 0) emit('swipe-left')
                    else emit('swipe-right')
                    lastSwipeTime = now
                    lastWristX = null
                }
            }
            if (!lastWristX) lastWristX = wrist.x
            else lastWristX = lastWristX * 0.9 + wrist.x * 0.1
        }

        // 3. 握拳退出全屏
        if (isFist) {
            if (fistHoldStartTime === 0) fistHoldStartTime = now
            else if (now - fistHoldStartTime > FIST_HOLD_THRESHOLD) {
                if (!isFistDetected) {
                    console.log("✊ [触发] 退出全屏")
                    emit('exit-fullscreen')
                    isFistDetected = true
                }
            }
        } else {
            fistHoldStartTime = 0
            isFistDetected = false
        }
    }
}

onMounted(() => { createHandLandmarker() })

onBeforeUnmount(() => {
    cancelAnimationFrame(animationFrameId)
    if (videoRef.value && videoRef.value.srcObject) {
        const stream = videoRef.value.srcObject as MediaStream
        stream.getTracks().forEach(track => track.stop())
        videoRef.value.srcObject = null
    }
    handLandmarker = null
})
</script>

<style scoped>
.gesture-container {
    position: absolute;
    bottom: 20px;
    right: 20px;
    z-index: 9999;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
}

.camera-wrapper {
    position: relative;
    width: 160px;
    height: 120px;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    background: black;
    opacity: 0.8;
}

#webcam,
#output_canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.status-badge {
    margin-top: 8px;
    color: white;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: background-color 0.3s;
}

.status-badge.active {
    background: rgba(40, 167, 69, 0.8);
}

.status-badge.drawing-mode {
    background: rgba(255, 193, 7, 0.9);
    color: #333;
    font-weight: bold;
}

.gesture-hint {
    margin-top: 4px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.8);
    text-shadow: 1px 1px 2px black;
    text-align: center;
}

.indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: white;
    box-shadow: 0 0 5px white;
    transition: background-color 0.2s;
}

.indicator.pinching {
    background-color: #FF0000;
    box-shadow: 0 0 8px #FF0000;
}
</style>