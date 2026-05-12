<template>
  <div class="flex h-full overflow-hidden">
    <!-- Left: Script panel -->
    <div class="w-96 shrink-0 flex flex-col border-r border-border">
      <div class="p-4 border-b border-border flex items-center gap-2">
        <button class="btn-ghost text-sm px-2" @click="$router.push('/')">←</button>
        <h2 class="font-semibold text-white truncate flex-1">{{ project?.name ?? '…' }}</h2>
        <span class="text-xs text-gray-600">{{ project?.ratio }}</span>
      </div>

      <!-- Script tab -->
      <div class="flex text-sm border-b border-border">
        <button :class="tab === 'script' ? 'tab-active' : 'tab'" @click="tab = 'script'">Script</button>
        <button :class="tab === 'generate' ? 'tab-active' : 'tab'" @click="tab = 'generate'">Generate</button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        <!-- Script editor -->
        <template v-if="tab === 'script'">
          <textarea v-model="scriptContent" class="input resize-none flex-1 min-h-64 font-mono text-sm leading-relaxed"
            placeholder="Write your script here, or use the Generate tab to create one with AI…" />
          <div class="flex gap-2">
            <button class="btn-primary flex-1 text-sm" :disabled="saving" @click="saveScript">
              {{ saving ? 'Saving…' : 'Save Script' }}
            </button>
            <button v-if="scriptContent" class="btn-ghost text-sm" :disabled="streaming" @click="enhanceScript">
              ✨ Enhance
            </button>
          </div>
          <button v-if="scriptContent" class="btn-primary text-sm" :disabled="breakingDown" @click="breakdown">
            {{ breakingDown ? 'Breaking into scenes…' : '→ Break into Scenes' }}
          </button>
        </template>

        <!-- AI generate tab -->
        <template v-if="tab === 'generate'">
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Premise / Story Idea</label>
            <textarea v-model="premise" class="input resize-none h-32 text-sm"
              placeholder="A detective in a neon-lit city discovers a conspiracy…" />
          </div>
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Style</label>
            <select v-model="genStyle" class="input text-sm">
              <option value="cinematic">Cinematic</option>
              <option value="anime">Anime</option>
              <option value="documentary">Documentary</option>
              <option value="horror">Horror</option>
              <option value="comedy">Comedy</option>
            </select>
          </div>
          <button class="btn-primary text-sm" :disabled="streaming || !premise" @click="generateScript">
            {{ streaming ? 'Generating…' : '🤖 Generate Script with AI' }}
          </button>
          <div v-if="streamBuffer" class="bg-surface rounded-lg p-3 text-xs font-mono text-gray-400 max-h-48 overflow-y-auto whitespace-pre-wrap">
            {{ streamBuffer }}
          </div>
        </template>
      </div>

      <!-- Stream status -->
      <div v-if="streamStatus" class="px-4 py-2 border-t border-border text-xs text-accent animate-pulse">
        {{ streamStatus }}
      </div>
    </div>

    <!-- Right: Scene board -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <div class="p-4 border-b border-border flex items-center gap-3">
        <h3 class="font-semibold text-white">Scenes</h3>
        <span class="text-gray-600 text-sm">{{ scenes.length }} scenes</span>
        <div class="ml-auto flex gap-2 flex-wrap">
          <select v-model="batchImageModel" class="input text-xs py-1.5 w-32" title="Image model">
            <option value="flux-schnell">Flux Schnell</option>
            <option value="ernie-image">ERNIE Image</option>
            <option value="ernie-image-turbo">ERNIE Turbo</option>
          </select>
          <select v-model="batchModel" class="input text-xs py-1.5 w-36">
            <option value="wan2.2-t2v">Wan2.2 T2V</option>
            <option value="wan2.2-i2v">Wan2.2 I2V</option>
            <option value="hunyuan-t2v">Hunyuan T2V</option>
            <option value="hunyuan-i2v">Hunyuan I2V</option>
            <option value="ltxv-t2v">LTXV T2V</option>
            <option value="ltxv-i2v">LTXV I2V</option>
          </select>
          <button class="btn-ghost text-xs" :disabled="!scenes.length" @click="batchImage" title="Generate images for all scenes">🖼 Images</button>
          <button class="btn-ghost text-xs" :disabled="!scenes.length" @click="batchAudio" title="Generate narration + audio for all scenes">🎙 Audio</button>
          <button class="btn-ghost text-xs" :disabled="!scenes.length" @click="batchVideo" title="Generate videos for all scenes">🎬 Videos</button>
          <button class="btn-primary text-xs" :disabled="!scenes.length || compiling" @click="compileAll" title="Compile final video">
            {{ compiling ? '⏳ Compiling…' : '⚙ Compile' }}
          </button>
          <button class="btn-ghost text-xs" @click="loadScenes">↺</button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        <!-- Compiled video panel -->
        <div v-if="compilations.length" class="mb-4">
          <h4 class="text-xs text-gray-600 uppercase tracking-wider mb-2">Compiled Videos</h4>
          <div class="flex flex-col gap-2">
            <div v-for="c in compilations" :key="c.id" class="card py-2 px-3 flex items-center gap-3">
              <span :class="compileBadge(c.status)" class="shrink-0">{{ c.status }}</span>
              <span class="text-xs text-gray-500 flex-1 truncate">{{ c.status }}</span>
              <a v-if="c.output_path" :href="c.output_path" download
                class="btn-primary text-xs py-1">⬇ Download</a>
              <video v-if="c.output_path" :src="c.output_path" controls class="w-64 rounded" />
            </div>
          </div>
        </div>

        <div v-if="!scenes.length" class="text-center py-16 text-gray-600">
          <p>No scenes yet.</p>
          <p class="text-sm mt-1">Write a script and click "Break into Scenes".</p>
        </div>
        <div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <SceneCard
            v-for="s in scenes"
            :key="s.id"
            :scene="s"
            :project-ratio="project?.ratio ?? '16:9'"
            @updated="loadScenes"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { io } from 'socket.io-client'
import SceneCard from '../components/SceneCard.vue'

const route = useRoute()
const projectId = route.params.id as string

const project = ref<any>(null)
const scenes = ref<any[]>([])
const scriptContent = ref('')
const tab = ref<'script' | 'generate'>('script')
const saving = ref(false)
const streaming = ref(false)
const breakingDown = ref(false)
const streamBuffer = ref('')
const streamStatus = ref('')
const premise = ref('')
const genStyle = ref('cinematic')
const batchModel = ref('wan2.2-t2v')
const batchImageModel = ref('flux-schnell')
const compiling = ref(false)
const compilations = ref<any[]>([])

const socket = io({ path: '/socket.io' })

socket.on('script:start', () => {
  streamStatus.value = 'Generating…'
  streamBuffer.value = ''
})
socket.on('script:chunk', (chunk: string) => {
  streamBuffer.value += chunk
  scriptContent.value += chunk
})
socket.on('script:done', ({ content }: { content: string }) => {
  scriptContent.value = content
  streamStatus.value = ''
  streaming.value = false
  tab.value = 'script'
})
socket.on('script:error', (msg: string) => {
  streamStatus.value = `Error: ${msg}`
  streaming.value = false
})

async function loadProject() {
  const r = await fetch(`/api/projects/${projectId}`)
  project.value = await r.json()
}

async function loadScript() {
  const r = await fetch(`/api/scripts/${projectId}`)
  const data = await r.json()
  if (data?.content) scriptContent.value = data.content
}

async function loadScenes() {
  const r = await fetch(`/api/scenes/${projectId}`)
  scenes.value = await r.json()
}

async function saveScript() {
  saving.value = true
  await fetch(`/api/scripts/${projectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: scriptContent.value }),
  })
  saving.value = false
}

async function generateScript() {
  if (!premise.value) return
  streaming.value = true
  scriptContent.value = ''
  socket.emit('script:generate', { projectId, premise: premise.value, style: genStyle.value })
}

async function enhanceScript() {
  streaming.value = true
  const original = scriptContent.value
  scriptContent.value = ''
  streamBuffer.value = ''
  socket.emit('script:enhance', { projectId, content: original })
}

async function breakdown() {
  await saveScript()
  breakingDown.value = true
  try {
    const r = await fetch(`/api/scripts/${projectId}/breakdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_model: batchModel.value }),
    })
    if (!r.ok) throw new Error(await r.text())
    await loadScenes()
  } catch (e: any) {
    alert('Breakdown failed: ' + e.message)
  }
  breakingDown.value = false
}

async function batchImage() {
  await fetch(`/api/scenes/batch-image/${projectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_model: batchImageModel.value }),
  })
  pollScenes()
}

async function batchAudio() {
  await fetch(`/api/audio/batch/${projectId}`, { method: 'POST' })
  pollScenes()
}

async function batchVideo() {
  await fetch(`/api/scenes/batch-video/${projectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: batchModel.value }),
  })
  pollScenes()
}

async function compileAll() {
  compiling.value = true
  const r = await fetch(`/api/compile/project/${projectId}`, { method: 'POST' })
  const { compilation_id } = await r.json()
  pollCompilation(compilation_id)
}

async function loadCompilations() {
  const r = await fetch(`/api/compile/project/${projectId}`)
  compilations.value = await r.json()
}

function pollCompilation(id: number) {
  const t = setInterval(async () => {
    const r = await fetch(`/api/compile/status/${id}`)
    const c = await r.json()
    const idx = compilations.value.findIndex(x => x.id === id)
    if (idx >= 0) compilations.value[idx] = c
    else compilations.value.unshift(c)
    if (c.status === 'done' || c.status === 'error') {
      clearInterval(t)
      compiling.value = false
    }
  }, 3000)
}

function compileBadge(status: string) {
  if (status === 'done') return 'badge-done'
  if (status === 'error') return 'badge-error'
  if (status === 'idle') return 'badge-idle'
  return 'badge-generating'
}

let pollTimer: any = null
function pollScenes() {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    await loadScenes()
    const busy = scenes.value.some(s => s.image_status === 'generating' || s.video_status === 'generating')
    if (!busy) { clearInterval(pollTimer); pollTimer = null }
  }, 4000)
}

onMounted(async () => {
  const [,,,, settings] = await Promise.all([
    loadProject(), loadScript(), loadScenes(), loadCompilations(),
    fetch('/api/settings').then(r => r.json()),
  ])
  if (settings.image_model) batchImageModel.value = settings.image_model
  if (settings.video_model) batchModel.value = settings.video_model
})

onUnmounted(() => {
  socket.disconnect()
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.tab { @apply px-4 py-2 text-gray-500 hover:text-white transition-colors; }
.tab-active { @apply px-4 py-2 text-accent border-b-2 border-accent; }
</style>
