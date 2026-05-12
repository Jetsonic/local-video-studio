import { Router } from 'express'
import { db, getSetting, setSetting } from '../db'
import { listOllamaModels } from '../services/ollama'
import { getComfyStatus, getAvailableModels } from '../services/comfyui'

const router = Router()

const KEYS = [
  'ollama_url', 'ollama_model', 'comfyui_url',
  'image_model', 'video_model', 'video_resolution', 'video_fps',
  'scene_system_prompt', 'enhance_system_prompt',
  'tts_voice', 'tts_rate', 'tts_volume', 'narration_system_prompt',
]

router.get('/', async (_req, res) => {
  const rows = await db('settings').whereIn('key', KEYS)
  const obj: Record<string, string> = {}
  for (const r of rows) obj[r.key] = r.value
  res.json(obj)
})

router.post('/', async (req, res) => {
  for (const [k, v] of Object.entries(req.body)) {
    if (KEYS.includes(k)) await setSetting(k, v as string)
  }
  res.json({ ok: true })
})

router.get('/ollama/models', async (_req, res) => {
  const models = await listOllamaModels()
  res.json(models)
})

router.get('/comfyui/status', async (_req, res) => {
  const status = await getComfyStatus()
  res.json(status)
})

router.get('/comfyui/models', async (_req, res) => {
  const models = await getAvailableModels()
  res.json(models)
})

export default router
