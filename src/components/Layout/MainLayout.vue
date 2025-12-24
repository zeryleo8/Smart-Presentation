<template>
  <div class="app-container">
    <header class="top-header">
      <div class="logo-area">
        <span class="title-text">Smart Presentation</span>
      </div>
      <div class="file-name">演示文稿.pptx</div>
      <div class="actions">
        <el-icon><Printer /></el-icon>
        <el-icon><Download /></el-icon>
        <el-icon><Search /></el-icon>
      </div>
    </header>

    <div class="main-body">
      <aside class="sidebar">
        <ul class="menu-list">
          <li class="menu-item section-title">关闭菜单</li>
          <li class="menu-item active">下载为...</li>
          <li class="menu-item">打印</li>
          <li class="menu-item">新建</li>
          <li class="menu-item">演示信息</li>
          <li class="menu-item">高级设置</li>
          <li class="menu-item spacer">帮助</li>
          <li class="menu-item">打开文件所在位置</li>
        </ul>
      </aside>

      <main class="content-area">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Printer, Download, Search } from '@element-plus/icons-vue'
</script>

<style scoped lang="scss">
@use '@/assets/styles/variables.scss' as *;

.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh; /* 强制占满视口高度 */
  width: 100%;
  overflow: hidden;
}

.top-header {
  height: 48px;
  background-color: $primary-color;
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  flex-shrink: 0; /* 防止头部被压缩 */
  z-index: 10;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  
  .title-text { font-weight: 600; font-size: 16px; }
  .file-name { font-size: 14px; opacity: 0.9; }
  .actions {
    display: flex; gap: 15px;
    .el-icon { cursor: pointer; font-size: 18px; color: white; }
  }
}

.main-body {
  flex: 1; /* 占据剩余高度 */
  display: flex;
  flex-direction: row;
  overflow: hidden; /* 防止 main-body 自身滚动 */
}

.sidebar {
  width: 250px;
  background-color: #f4f4f4; // 侧边栏背景
  border-right: 1px solid #dcdfe6;
  flex-shrink: 0;
  overflow-y: auto;
  
  .menu-list { list-style: none; padding: 0; margin: 0; }
  .menu-item {
    padding: 12px 24px;
    font-size: 14px;
    color: #333;
    cursor: pointer;
    border-left: 4px solid transparent;
    transition: all 0.2s;
    
    &:hover { background-color: #e0e0e0; }
    &.active { background-color: #a0a0a0; color: white; border-left-color: $primary-color; }
    &.section-title { font-weight: bold; color: #666; cursor: default; &:hover{background:none;} }
  }
}

.content-area {
  flex: 1; /* 占据剩余宽度 */
  background-color: #f5f5f5; /* 核心：右侧背景色在这里设置 */
  overflow-y: auto; /* 只有这里允许纵向滚动 */
  overflow-x: hidden; /* 禁止横向滚动 */
  padding: 40px; /* 内容内边距 */
  position: relative;
}
</style>