import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '../components/Layout/MainLayout.vue'
import Dashboard from '../views/Dashboard.vue'
import Editor from '../views/Editor.vue'
import Presentation from '../views/Presentation.vue'

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            name: 'Home',
            component: Presentation
        },
        {
            path: '/editor',
            component: Editor
        }
    ]
})

export default router