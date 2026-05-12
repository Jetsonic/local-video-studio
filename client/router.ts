import { createRouter, createWebHistory } from 'vue-router'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./views/ProjectsView.vue') },
    { path: '/project/:id', component: () => import('./views/EditorView.vue') },
    { path: '/settings', component: () => import('./views/SettingsView.vue') },
  ],
})
