<template>
  <div class="home-container">
    <div class="content-box">
      <h1 class="title">智能演示</h1>
      
      <div class="upload-area" 
           @click="triggerUpload" 
           @dragover.prevent 
           @drop.prevent="handleDrop"
           v-loading="presentationStore.isLoading"
           :element-loading-text="presentationStore.loadingText">
        
        <el-icon class="upload-icon"><UploadFilled /></el-icon>
        <div class="upload-text">
          点击或拖拽上传演示文档
          <div class="sub-text">支持 .pptx / .pdf 格式</div>
        </div>
      </div>

      <input 
        type="file" 
        ref="fileInputRef" 
        accept=".pptx,.pdf" 
        style="display:none" 
        @change="handleFileChange" 
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { UploadFilled } from '@element-plus/icons-vue'
import { usePresentationStore } from '../stores/presentation'
import { ElMessage } from 'element-plus'

const router = useRouter()
const presentationStore = usePresentationStore()
const fileInputRef = ref<HTMLInputElement | null>(null)

const triggerUpload = () => {
  if (presentationStore.isLoading) return
  fileInputRef.value?.click()
}

const processFile = async (file: File) => {
  if (!file) return
  
  // 简单校验
  const isValid = /\.(pdf|pptx)$/i.test(file.name)
  if (!isValid) {
    ElMessage.warning('仅支持 PDF 或 PPTX 文件')
    return
  }

  try {
    await presentationStore.loadFile(file)
    ElMessage.success('文档处理完成')
    // 跳转到演示页
    router.push({ name: 'Presentation' })
  } catch (e) {
    ElMessage.error('文件处理失败，请重试')
  }
}

const handleFileChange = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) processFile(file)
  // 清空 input 允许重复上传同名文件
  if (fileInputRef.value) fileInputRef.value.value = ''
}

const handleDrop = (event: DragEvent) => {
  const file = event.dataTransfer?.files[0]
  if (file) processFile(file)
}
</script>

<style scoped lang="scss">
.home-container {
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}

.content-box {
  text-align: center;
  background: rgba(255, 255, 255, 0.9);
  padding: 60px 80px;
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
  backdrop-filter: blur(10px);
}

.title {
  font-size: 32px;
  color: #2c3e50;
  margin-bottom: 10px;
}

.subtitle {
  color: #606266;
  margin-bottom: 40px;
}

.upload-area {
  width: 400px;
  height: 240px;
  border: 2px dashed #dcdfe6;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  transition: all 0.3s;
  background: #fafafa;

  &:hover {
    border-color: #409eff;
    background: rgba(64, 158, 255, 0.05);
    .upload-icon { color: #409eff; }
  }

  .upload-icon {
    font-size: 48px;
    color: #909399;
    margin-bottom: 16px;
    transition: color 0.3s;
  }

  .upload-text {
    font-size: 16px;
    color: #606266;
    .sub-text {
      font-size: 12px;
      color: #909399;
      margin-top: 8px;
    }
  }
}
</style>