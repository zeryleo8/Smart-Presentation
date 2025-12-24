<template>
    <div class="gesture-container">
        <div class="camera-wrapper" style="transform: scaleX(-1);">
            <video ref="videoRef" autoplay playsinline id="webcam"></video>
            <canvas ref="canvasRef" id="output_canvas"></canvas>
        </div>

        <div class="status-badge active">
            <div class="indicator"></div>
            AI 视觉已激活
        </div>

        <div class="gesture-hint">
            👋 挥手翻页 | ✊ 握拳退出全屏
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { FilesetResolver, HandLandmarker, DrawingUtils } from '@mediapipe/tasks-vision'

// 定义事件：翻页 和 退出全屏
const emit = defineEmits(['swipe-left', 'swipe-right', 'exit-fullscreen'])

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let handLandmarker: HandLandmarker | null = null
let animationFrameId: number
let lastVideoTime = -1

// --- 挥手检测变量 ---
let lastWristX: number | null = null
let lastSwipeTime = 0
const SWIPE_THRESHOLD = 0.15
const COOLDOWN = 800

// --- 握拳检测变量 ---
let fistHoldStartTime = 0
const FIST_HOLD_THRESHOLD = 600 // 需要保持握拳 600ms 才会触发退出
let isFistDetected = false

// 判断手指弯曲 (屏幕坐标系Y向下，指尖Y > 关节Y 表示弯曲)
const isFingerCurled = (landmarks: any[], tipIdx: number, jointIdx: number) => {
    return landmarks[tipIdx].y > landmarks[jointIdx].y
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

// 开启摄像头
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

// 逐帧预测
const predictWebcam = async () => {
    if (!handLandmarker || !videoRef.value || !canvasRef.value) return

    // 调整画布尺寸匹配视频流
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

            // 绘制手部骨架
            const drawingUtils = new DrawingUtils(ctx)
            drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, { color: "#00FF00", lineWidth: 3 })
            drawingUtils.drawLandmarks(landmarks, { color: "#FF0000", lineWidth: 1 })

            // 执行手势检测逻辑
            detectGestures(landmarks)
        } else {
            // 没有检测到手时，重置状态
            lastWristX = null
            fistHoldStartTime = 0
            isFistDetected = false
        }
    }
    animationFrameId = window.requestAnimationFrame(predictWebcam)
}

const detectGestures = (landmarks: any) => {
    const now = Date.now()
    const wrist = landmarks[0]

    // =========================================
    // 逻辑 1: 挥手检测 (翻页) - 握拳时禁用
    // =========================================
    if (!isFistDetected && now - lastSwipeTime > COOLDOWN) {
        if (lastWristX !== null) {
            const delta = wrist.x - lastWristX
            if (Math.abs(delta) > SWIPE_THRESHOLD) {
                if (delta < 0) {
                    emit('swipe-left') // Next Page
                } else {
                    emit('swipe-right') // Prev Page
                }
                lastSwipeTime = now
                lastWristX = null
            }
        }
        if (!lastWristX) lastWristX = wrist.x
        else lastWristX = lastWristX * 0.9 + wrist.x * 0.1 // 简单的平滑滤波
    }

    // =========================================
    // 逻辑 2: 握拳检测 (退出全屏)
    // =========================================

    // 检测四指是否弯曲 (忽略大拇指)
    const fingersCurled = [
        isFingerCurled(landmarks, 8, 6),   // 食指
        isFingerCurled(landmarks, 12, 10), // 中指
        isFingerCurled(landmarks, 16, 14), // 无名指
        isFingerCurled(landmarks, 20, 18)  // 小指
    ]
    const curledCount = fingersCurled.filter(c => c).length

    // 判定为拳头：至少4根手指弯曲
    if (curledCount === 4) {
        if (fistHoldStartTime === 0) {
            fistHoldStartTime = now // 开始计时
        } else if (now - fistHoldStartTime > FIST_HOLD_THRESHOLD) {
            // 保持拳头超过设定时间，触发退出
            if (!isFistDetected) {
                console.log("✊ [触发] 握拳退出全屏")
                emit('exit-fullscreen')
                isFistDetected = true // 锁定状态，防止重复触发
            }
        }
    } else {
        // 手指张开，立即重置计时器
        fistHoldStartTime = 0
        isFistDetected = false
    }
}

// 组件挂载：启动
onMounted(() => {
    createHandLandmarker()
})

// 组件卸载：清理 (关键步骤)
onBeforeUnmount(() => {
    // 1. 停止动画帧循环
    cancelAnimationFrame(animationFrameId)

    // 2. 彻底关闭摄像头硬件流 (熄灭指示灯)
    if (videoRef.value && videoRef.value.srcObject) {
        const stream = videoRef.value.srcObject as MediaStream
        stream.getTracks().forEach(track => {
            track.stop()
        })
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
    /* 确保不遮挡PPT内容点击 */
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
    background: rgba(40, 167, 69, 0.8);
    color: white;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
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
}
</style>