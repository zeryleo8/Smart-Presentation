import { createRouter, createWebHistory } from 'vue-router'
import Presentation from '../views/Presentation.vue'

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            name: 'Home',
            component: Presentation
        }
    ]
})

export default router