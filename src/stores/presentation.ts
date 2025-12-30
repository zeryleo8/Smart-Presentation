// src/stores/presentation.ts
import { defineStore } from 'pinia'
import { ref, markRaw } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'

// 设置 Worker (只需设置一次)
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export const usePresentationStore = defineStore('presentation', () => {
    // State
    const pdfDoc = ref<pdfjsLib.PDFDocumentProxy | null>(null)
    const fileName = ref('')
    const isLoading = ref(false)
    const loadingText = ref('正在处理...')

    // Config
    const GOTENBERG_URL = '/api-gotenberg/forms/libreoffice/convert'

    // Actions
    const setPdfDoc = (doc: pdfjsLib.PDFDocumentProxy) => {
        // 关键点：使用 markRaw 标记 pdfDoc，避免 Vue 对其进行深度响应式转换，
        // 否则在操作大文件时会导致严重的性能卡顿或内存溢出。
        pdfDoc.value = markRaw(doc)
    }

    const resetStore = () => {
        if (pdfDoc.value) {
            pdfDoc.value.destroy()
        }
        pdfDoc.value = null
        fileName.value = ''
    }

    const convertPPTX = async (file: File): Promise<ArrayBuffer> => {
        const formData = new FormData()
        formData.append('files', file)
        const res = await fetch(GOTENBERG_URL, { method: 'POST', body: formData })
        if (!res.ok) throw new Error('PPTX 转换服务响应错误')
        return await res.arrayBuffer()
    }

    const loadFile = async (file: File) => {
        try {
            isLoading.value = true
            fileName.value = file.name
            resetStore() // 清理旧数据

            let arrayBuffer: ArrayBuffer
            
            if (file.type === 'application/pdf') {
                loadingText.value = '正在解析 PDF...'
                arrayBuffer = await file.arrayBuffer()
            } else {
                loadingText.value = '正在将 PPTX 转换为高清 PDF...'
                arrayBuffer = await convertPPTX(file)
            }

            loadingText.value = '正在渲染文档...'
            const loadingTask = pdfjsLib.getDocument({ 
                data: arrayBuffer, 
                verbosity: 0 
            })
            
            const doc = await loadingTask.promise
            setPdfDoc(doc)
            
            return true // 成功
        } catch (error) {
            console.error('文件加载失败:', error)
            fileName.value = '' // 重置文件名
            throw error
        } finally {
            isLoading.value = false
        }
    }

    return {
        pdfDoc,
        fileName,
        isLoading,
        loadingText,
        loadFile,
        resetStore
    }
})