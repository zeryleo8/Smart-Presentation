<template>
  <div class="dashboard-wrapper">
    <section class="section-block">
      <h2 class="section-title">新建演示文稿</h2>
      <div class="file-grid">
        <div class="file-card create-new" @click="handleCreateNew">
          <div class="card-preview">
            <FileIcon type="blank" />
          </div>
          <div class="card-footer">
            <span class="name">空白演示文稿</span>
          </div>
        </div>

        <div class="file-card">
          <div class="card-preview">
            <FileIcon type="blank" />
            <div class="template-badge">Template</div>
          </div>
          <div class="card-footer">
            <span class="name">企业汇报模板</span>
          </div>
        </div>
      </div>
    </section>

    <section class="section-block">
      <h2 class="section-title">格式兼容性测试</h2>
      <div class="file-grid dense">
        <div class="file-card simple" v-for="(file, index) in fileTypes" :key="index">
          <div class="icon-wrapper">
            <FileIcon :type="file.type" :label="file.label" />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import FileIcon from '@/components/FileIcon.vue'

const router = useRouter()

const fileTypes = [
  { type: 'pptx', label: 'PPTX' },
  { type: 'pdf', label: 'PDF' },
  { type: 'potx', label: 'POTX' },
  { type: 'image', label: 'PNG' },
  { type: 'image', label: 'JPG' },
  { type: 'ppsx', label: 'PPSX' },
] as const

const handleCreateNew = () => {
  // 跳转到编辑器页面
  router.push('/editor')
}
</script>

<style scoped lang="scss">
@use '@/assets/styles/variables.scss' as *;

/* 核心修复：
   使用 wrapper 限制宽度并居中，而不是 flex 布局
*/
.dashboard-wrapper {
  width: 100%;
  max-width: 1100px;
  margin: 0 auto; /* 水平居中 */
  display: block; /* 确保是块级元素 */
}

.section-block {
  margin-bottom: 50px;
  width: 100%;
  display: block; /* 确保 section 也是块级，独占一行 */
}

/* 标题样式：确保位于 Grid 上方 */
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #999;
  margin-bottom: 20px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: block; /* 独占一行 */
  text-align: left; /* 文字左对齐 */
}

/* 网格布局 */
.file-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 25px;
  justify-content: flex-start; /* 左对齐 */
  
  &.dense {
    gap: 20px;
  }
}

/* 卡片样式 */
.file-card {
  width: 150px;
  height: 190px;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  
  .card-preview {
    flex: 1;
    background-color: white;
    border: 1px solid #e0e0e0;
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    transition: all 0.2s;
  }

  .card-footer {
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    .name { font-size: 13px; color: #333; }
  }

  &:hover {
    .card-preview {
      border-color: $primary-color;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      transform: translateY(-2px);
    }
    .name { color: $primary-color; }
  }
}

/* 纯图标卡片 */
.file-card.simple {
  width: auto;
  height: auto;
  border: none;
  background: transparent;
  
  .icon-wrapper {
    width: 70px;
    height: 90px;
    transition: transform 0.2s;
  }
  
  &:hover .icon-wrapper {
    transform: translateY(-5px);
  }
}

.template-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: #f0f0f0;
  color: #999;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
}
</style>