import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { db, getSetting } from '../db'
import { generateTTS, listVoices } from '../services/tts'
import { ollamaChat } from '../services/ollama'

const router = Router()
const AUDIO_DIR = path.join(process.cwd(), 'data', 'audio')

// serve audio files
router.use('/files', (req, res, next) => {
  const filePath = path.join(AUDIO_DIR, path.basename(req.path))
  if (fs.existsSync(filePath)) return res.sendFile(filePath)
  next()
})

router.get('/voices', async (_req, res) => {
  const voices = await listVoices()
  res.json(voices)
})

// generate narration text + TTS for one scene
router.post('/scene/:id', async (req, res) => {
  const scene = await db('scenes').where('id', req.params.id).first()
  if (!scene) return res.status(404).json({ error: 'Scene not found' })

  await db('scenes').where('id', scene.id).update({ audio_status: 'generating' })
  res.json({ ok: true, status: 'generating' })

  try {
    const voice = req.body.voice ?? scene.tts_voice ?? (await getSetting('tts_voice')) ?? 'en-US-AriaNeural'

    // generate narration if not provided
    let narration: string = req.body.narration ?? scene.narration
    if (!narration) {
      const sysPrompt = await getSetting('narration_system_prompt')
      narration = await ollamaChat([
        { role: 'system', content: sysPrompt },
        {
          role: 'user',
          content: `Scene ${scene.index}: ${scene.description}\n\nWrite the narration:`,
        },
      ])
      narration = narration.trim()
      await db('scenes').where('id', scene.id).update({ narration })
    }

    const audioName = `audio_${scene.id}_${Date.now()}.mp3`
    const audioPath = await generateTTS(narration, audioName, voice)

    await db('scenes').where('id', scene.id).update({
      audio_path: audioPath,
      audio_status: 'done',
      tts_voice: voice,
    })
  } catch (err: any) {
    console.error(`Audio scene ${scene.id}:`, err.message)
    await db('scenes').where('id', scene.id).update({ audio_status: 'error' })
  }
})

// update narration text manually
router.patch('/scene/:id/narration', async (req, res) => {
  const { narration } = req.body
  await db('scenes').where('id', req.params.id).update({ narration })
  res.json({ ok: true })
})

// regenerate TTS from existing narration
router.post('/scene/:id/tts', async (req, res) => {
  const scene = await db('scenes').where('id', req.params.id).first()
  if (!scene?.narration) return res.status(400).json({ error: 'No narration text' })

  await db('scenes').where('id', scene.id).update({ audio_status: 'generating' })
  res.json({ ok: true, status: 'generating' })

  try {
    const voice = req.body.voice ?? scene.tts_voice ?? 'en-US-AriaNeural'
    const audioName = `audio_${scene.id}_${Date.now()}.mp3`
    const audioPath = await generateTTS(scene.narration, audioName, voice)
    await db('scenes').where('id', scene.id).update({
      audio_path: audioPath,
      audio_status: 'done',
      tts_voice: voice,
    })
  } catch (err: any) {
    await db('scenes').where('id', scene.id).update({ audio_status: 'error' })
  }
})

// batch: generate audio for all scenes in project
router.post('/batch/:projectId', async (req, res) => {
  const scenes = await db('scenes')
    .where('project_id', req.params.projectId)
    .where('audio_status', 'idle')
    .orderBy('index')

  res.json({ ok: true, queued: scenes.length })

  for (const scene of scenes) {
    await db('scenes').where('id', scene.id).update({ audio_status: 'generating' })
    try {
      const voice = scene.tts_voice ?? (await getSetting('tts_voice')) ?? 'en-US-AriaNeural'
      let narration = scene.narration
      if (!narration) {
        const sysPrompt = await getSetting('narration_system_prompt')
        narration = await ollamaChat([
          { role: 'system', content: sysPrompt },
          { role: 'user', content: `Scene ${scene.index}: ${scene.description}\n\nWrite the narration:` },
        ])
        narration = narration.trim()
        await db('scenes').where('id', scene.id).update({ narration })
      }
      const audioName = `audio_${scene.id}_${Date.now()}.mp3`
      const audioPath = await generateTTS(narration, audioName, voice)
      await db('scenes').where('id', scene.id).update({ audio_path: audioPath, audio_status: 'done' })
    } catch (err: any) {
      console.error(`Batch audio scene ${scene.id}:`, err.message)
      await db('scenes').where('id', scene.id).update({ audio_status: 'error' })
    }
  }
})

export default router
