import { defineStore } from 'pinia'
import { ref, markRaw } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'

// 设置 Worker
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export const usePresentationStore = defineStore('presentation', () => {
    // State
    const pdfDoc = ref<pdfjsLib.PDFDocumentProxy | null>(null)
    const pdfSource = ref<ArrayBuffer | null>(null) // 新增：存储源文件数据
    const fileName = ref('')
    const isLoading = ref(false)
    const loadingText = ref('正在处理...')

    // Config
    const GOTENBERG_URL = '/api-gotenberg/forms/libreoffice/convert'

    // Actions
    const setPdfDoc = (doc: pdfjsLib.PDFDocumentProxy) => {
        pdfDoc.value = markRaw(doc)
    }

    const resetStore = () => {
        if (pdfDoc.value) {
            pdfDoc.value.destroy()
        }
        pdfDoc.value = null
        pdfSource.value = null
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
            resetStore()

            let arrayBuffer: ArrayBuffer
            
            if (file.type === 'application/pdf') {
                loadingText.value = '正在解析 PDF...'
                arrayBuffer = await file.arrayBuffer()
            } else {
                loadingText.value = '正在将 PPTX 转换为高清 PDF...'
                arrayBuffer = await convertPPTX(file)
            }

            // 保存源数据供 vue-pdf-embed 使用
            pdfSource.value = arrayBuffer

            loadingText.value = '正在预加载文档结构...'
            // 仍然保留 pdfjsLib 解析以获取总页数等元数据
            const loadingTask = pdfjsLib.getDocument({ 
                data: arrayBuffer, 
                verbosity: 0 
            })
            
            const doc = await loadingTask.promise
            setPdfDoc(doc)
            
            return true
        } catch (error) {
            console.error('文件加载失败:', error)
            fileName.value = ''
            throw error
        } finally {
            isLoading.value = false
        }
    }

    return {
        pdfDoc,
        pdfSource,
        fileName,
        isLoading,
        loadingText,
        loadFile,
        resetStore
    }
})