<template>
    <div class="file-icon-container" :class="type">
        <svg viewBox="0 0 64 80" class="icon-svg" xmlns="http://www.w3.org/2000/svg">
            <path d="M5,0 L44,0 L64,20 L64,80 L5,80 C2.2,80 0,77.8 0,75 L0,5 C0,2.2 2.2,0 5,0 Z" class="paper-bg" />
            <path d="M44,0 L44,20 L64,20" class="paper-corner" />

            <g class="symbol" transform="translate(16, 28)">
                <g v-if="type === 'pptx' || type === 'potx' || type === 'ppsx'">
                    <path d="M16,0 L16,14 L30,14 A16,16 0 0,0 16,0 Z" fill="white" />
                    <path d="M12,4 A16,16 0 1,0 28,20 L12,20 L12,4 Z" fill="white" />
                    <rect x="0" y="38" width="32" height="3" fill="white" opacity="0.8" />
                    <rect x="0" y="44" width="20" height="3" fill="white" opacity="0.8" />
                </g>

                <g v-else-if="type === 'pdf'">
                    <path d="M8,0 C12,5 20,5 24,0 C24,15 16,25 16,25 C16,25 8,15 8,0" fill="none" stroke="white"
                        stroke-width="3" />
                    <path d="M16,25 L16,40" stroke="white" stroke-width="3" />
                    <rect x="0" y="44" width="32" height="3" fill="white" opacity="0.8" />
                </g>

                <g v-else-if="type === 'blank'">
                    <rect x="4" y="4" width="24" height="3" fill="#ddd" />
                    <rect x="4" y="12" width="24" height="3" fill="#ddd" />
                    <rect x="4" y="20" width="16" height="3" fill="#ddd" />
                </g>

                <g v-else-if="type === 'image'">
                    <rect x="0" y="0" width="32" height="24" rx="2" fill="white" />
                    <circle cx="10" cy="8" r="3" fill="#ccc" />
                    <path d="M2,20 L10,12 L18,18 L24,10 L30,20" fill="none" stroke="#ccc" stroke-width="2" />
                </g>
            </g>

            <text v-if="label" x="32" y="70" text-anchor="middle" class="type-text">{{ label }}</text>
        </svg>
    </div>
</template>

<script setup lang="ts">
defineProps<{
    type: 'pptx' | 'pdf' | 'blank' | 'image' | 'potx' | 'ppsx'
    label?: string
}>()
</script>

<style scoped lang="scss">
.file-icon-container {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;

    .icon-svg {
        width: 64px;
        height: 80px;
        drop-shadow: 2px 4px 6px rgba(0, 0, 0, 0.15); // 轻拟物投影
    }

    .paper-corner {
        fill: rgba(0, 0, 0, 0.2); // 折角阴影色
    }

    .type-text {
        font-size: 10px;
        fill: white;
        font-weight: bold;
        font-family: Arial, sans-serif;
    }

    // --- 颜色定义 ---

    // PPT 橙色系
    &.pptx,
    &.potx,
    &.ppsx {
        .paper-bg {
            fill: #e67e22;
        }

        .paper-corner {
            fill: #d35400;
        }
    }

    // PDF 红色系
    &.pdf {
        .paper-bg {
            fill: #c0392b;
        }

        .paper-corner {
            fill: #a93226;
        }
    }

    // 图片 紫色系
    &.image {
        .paper-bg {
            fill: #9b59b6;
        }

        .paper-corner {
            fill: #8e44ad;
        }
    }

    // 空白文档 (灰色边框风格，模拟截图2)
    &.blank {
        .paper-bg {
            fill: #ffffff;
            stroke: #dcdfe6;
            stroke-width: 1;
        }

        .paper-corner {
            fill: #f0f0f0;
            stroke: #dcdfe6;
            stroke-width: 1;
        }

        .icon-svg {
            drop-shadow: none;
        }

        // 空白页不需要太重投影
    }
}
</style>