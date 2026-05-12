<template>
  <div class="p-8 h-full overflow-y-auto">
    <div class="max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold mb-8">Settings</h1>

      <!-- Ollama -->
      <section class="card mb-4">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-semibold">Ollama (Text / Script)</h2>
          <span :class="ollamaOk ? 'badge-done' : 'badge-error'">{{ ollamaOk ? 'Connected' : 'Offline' }}</span>
        </div>
        <div class="space-y-3">
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Server URL</label>
            <input v-model="s.ollama_url" class="input" placeholder="http://localhost:11434" />
          </div>
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Model</label>
            <select v-model="s.ollama_model" class="input">
              <option v-for="m in ollamaModels" :key="m" :value="m">{{ m }}</option>
            </select>
            <button class="text-xs text-accent hover:underline mt-1" @click="loadOllamaModels">↻ Refresh models</button>
          </div>
        </div>
      </section>

      <!-- ComfyUI -->
      <section class="card mb-4">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-semibold">ComfyUI (Image / Video)</h2>
          <div class="flex items-center gap-2">
            <span v-if="comfyStatus?.gpu" class="text-xs text-gray-500">{{ comfyStatus.gpu }}</span>
            <span :class="comfyStatus?.ok ? 'badge-done' : 'badge-error'">
              {{ comfyStatus?.ok ? `v${comfyStatus.version}` : 'Offline' }}
            </span>
          </div>
        </div>
        <div class="space-y-3">
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Server URL</label>
            <input v-model="s.comfyui_url" class="input" placeholder="http://127.0.0.1:8000" />
          </div>
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Default Image Model</label>
            <select v-model="s.image_model" class="input">
              <option value="flux-schnell">Flux Schnell (fast, local checkpoint)</option>
              <option value="ernie-image">ERNIE Image</option>
              <option value="ernie-image-turbo">ERNIE Image Turbo</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Default Video Model</label>
            <select v-model="s.video_model" class="input">
              <option value="wan2.2-t2v">Wan2.2 T2V 14B (text→video)</option>
              <option value="wan2.2-i2v">Wan2.2 I2V 14B (image→video)</option>
              <option value="hunyuan-t2v">HunyuanVideo 1.5 T2V 720p</option>
              <option value="hunyuan-i2v">HunyuanVideo 1.5 I2V 720p</option>
              <option value="ltxv-t2v">LTXV 0.9.5 T2V</option>
              <option value="ltxv-i2v">LTXV 0.9.5 I2V</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Default Resolution</label>
            <select v-model="s.video_resolution" class="input">
              <option value="480p">480p (fast)</option>
              <option value="720p">720p (quality)</option>
            </select>
          </div>
          <div v-if="comfyModels.unets.length">
            <p class="text-xs text-gray-600 mb-1">Detected UNET models:</p>
            <div class="flex flex-wrap gap-1">
              <span v-for="m in comfyModels.unets" :key="m" class="badge badge-idle text-xs">{{ m }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- TTS -->
      <section class="card mb-4">
        <h2 class="font-semibold mb-4">Text-to-Speech (edge-tts)</h2>
        <div class="space-y-3">
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Default Voice</label>
            <select v-model="s.tts_voice" class="input">
              <option v-for="v in ttsVoices.filter(v => v.locale.startsWith('en'))" :key="v.name" :value="v.name">
                {{ v.name }} ({{ v.gender }})
              </option>
            </select>
            <button class="text-xs text-accent hover:underline mt-1" @click="loadTTSVoices">↻ Load voices</button>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-500 mb-1 block">Rate (e.g. +20%, -10%)</label>
              <input v-model="s.tts_rate" class="input" placeholder="+0%" />
            </div>
            <div>
              <label class="text-xs text-gray-500 mb-1 block">Volume (e.g. +10%)</label>
              <input v-model="s.tts_volume" class="input" placeholder="+0%" />
            </div>
          </div>
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Narration Generation Prompt</label>
            <textarea v-model="s.narration_system_prompt" class="input resize-none h-24 text-xs font-mono" />
          </div>
        </div>
      </section>

      <!-- Prompts -->
      <section class="card mb-4">
        <h2 class="font-semibold mb-4">AI Prompts</h2>
        <div class="space-y-3">
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Scene Breakdown System Prompt</label>
            <textarea v-model="s.scene_system_prompt" class="input resize-none h-32 text-xs font-mono" />
          </div>
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Script Enhancement System Prompt</label>
            <textarea v-model="s.enhance_system_prompt" class="input resize-none h-20 text-xs font-mono" />
          </div>
        </div>
      </section>

      <button class="btn-primary w-full" :disabled="saving" @click="save">
        {{ saving ? 'Saving…' : 'Save Settings' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const s = ref<Record<string, string>>({})
const saving = ref(false)
const ollamaModels = ref<string[]>([])
const ollamaOk = ref(false)
const comfyStatus = ref<any>(null)
const comfyModels = ref<{ checkpoints: string[]; unets: string[] }>({ checkpoints: [], unets: [] })
const ttsVoices = ref<{ name: string; locale: string; gender: string }[]>([])

async function load() {
  const r = await fetch('/api/settings')
  s.value = await r.json()
  await Promise.all([loadOllamaModels(), loadComfyStatus(), loadComfyModels(), loadTTSVoices()])
}

async function loadTTSVoices() {
  try {
    const r = await fetch('/api/audio/voices')
    ttsVoices.value = await r.json()
  } catch {}
}

async function loadOllamaModels() {
  try {
    const r = await fetch('/api/settings/ollama/models')
    ollamaModels.value = await r.json()
    ollamaOk.value = ollamaModels.value.length > 0
  } catch { ollamaOk.value = false }
}

async function loadComfyStatus() {
  try {
    const r = await fetch('/api/settings/comfyui/status')
    comfyStatus.value = await r.json()
  } catch { comfyStatus.value = { ok: false } }
}

async function loadComfyModels() {
  try {
    const r = await fetch('/api/settings/comfyui/models')
    comfyModels.value = await r.json()
  } catch {}
}

async function save() {
  saving.value = true
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s.value),
  })
  saving.value = false
}

onMounted(load)
</script>
