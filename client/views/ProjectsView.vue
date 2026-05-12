<template>
  <div class="p-8 h-full overflow-y-auto">
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-2xl font-bold text-white">Local Video Studio</h1>
          <p class="text-gray-500 text-sm mt-1">Ollama + ComfyUI</p>
        </div>
        <button class="btn-primary" @click="showCreate = true">+ New Project</button>
      </div>

      <!-- Create modal -->
      <div v-if="showCreate" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="showCreate = false">
        <div class="card w-full max-w-md">
          <h2 class="text-lg font-semibold mb-4">New Project</h2>
          <div class="space-y-3">
            <input v-model="newProject.name" class="input" placeholder="Project name" />
            <textarea v-model="newProject.description" class="input resize-none h-20" placeholder="Description (optional)" />
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-gray-500 mb-1 block">Aspect Ratio</label>
                <select v-model="newProject.ratio" class="input">
                  <option value="16:9">16:9 Landscape</option>
                  <option value="9:16">9:16 Portrait</option>
                  <option value="1:1">1:1 Square</option>
                </select>
              </div>
              <div>
                <label class="text-xs text-gray-500 mb-1 block">Style</label>
                <select v-model="newProject.style" class="input">
                  <option value="cinematic">Cinematic</option>
                  <option value="anime">Anime</option>
                  <option value="documentary">Documentary</option>
                  <option value="fantasy">Fantasy</option>
                  <option value="sci-fi">Sci-Fi</option>
                </select>
              </div>
            </div>
          </div>
          <div class="flex gap-2 mt-4 justify-end">
            <button class="btn-ghost" @click="showCreate = false">Cancel</button>
            <button class="btn-primary" :disabled="!newProject.name" @click="createProject">Create</button>
          </div>
        </div>
      </div>

      <!-- Projects grid -->
      <div v-if="loading" class="text-gray-500 text-center py-16">Loading…</div>
      <div v-else-if="projects.length === 0" class="text-center py-16">
        <div class="text-gray-600 text-5xl mb-4">🎬</div>
        <p class="text-gray-400">No projects yet. Create one to get started.</p>
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div v-for="p in projects" :key="p.id"
          class="card hover:border-accent/50 cursor-pointer transition-colors group"
          @click="$router.push(`/project/${p.id}`)">
          <div class="flex items-start justify-between">
            <div>
              <h3 class="font-semibold text-white group-hover:text-accent transition-colors">{{ p.name }}</h3>
              <p v-if="p.description" class="text-gray-500 text-sm mt-1 line-clamp-2">{{ p.description }}</p>
            </div>
            <button class="text-gray-600 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-all"
              @click.stop="deleteProject(p.id)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="flex items-center gap-3 mt-3 text-xs text-gray-600">
            <span>{{ p.ratio }}</span>
            <span>·</span>
            <span>{{ p.style }}</span>
            <span>·</span>
            <span>{{ p.scene_count }} scenes</span>
            <span v-if="p.has_script" class="ml-auto badge-done">has script</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const projects = ref<any[]>([])
const loading = ref(true)
const showCreate = ref(false)
const newProject = ref({ name: '', description: '', ratio: '16:9', style: 'cinematic' })

async function load() {
  loading.value = true
  const r = await fetch('/api/projects')
  projects.value = await r.json()
  loading.value = false
}

async function createProject() {
  const r = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newProject.value),
  })
  const { id } = await r.json()
  showCreate.value = false
  newProject.value = { name: '', description: '', ratio: '16:9', style: 'cinematic' }
  await load()
}

async function deleteProject(id: number) {
  if (!confirm('Delete this project?')) return
  await fetch(`/api/projects/${id}`, { method: 'DELETE' })
  await load()
}

onMounted(load)
</script>
