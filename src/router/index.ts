import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Presentation from '../views/Presentation.vue'

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            name: 'Home',
            component: Home
        },
        {
            path: '/presentation',
            name: 'Presentation',
            component: Presentation
        }
    ]
})

export default router