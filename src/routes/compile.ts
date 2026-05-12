import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { db } from '../db'
import { compileSceneClip, compileProject, type SceneData } from '../services/compiler'

const router = Router()
const COMPILED_DIR = path.join(process.cwd(), 'data', 'compiled')

// serve compiled files
router.use('/files', (req, res, next) => {
  const filePath = path.join(COMPILED_DIR, path.basename(req.path))
  if (fs.existsSync(filePath)) return res.sendFile(filePath)
  next()
})

// compile single scene clip (video + audio)
router.post('/clip/:sceneId', async (req, res) => {
  const scene = await db('scenes').where('id', req.params.sceneId).first()
  if (!scene) return res.status(404).json({ error: 'Scene not found' })

  const project = await db('projects').where('id', scene.project_id).first()
  await db('scenes').where('id', scene.id).update({ clip_status: 'generating' })
  res.json({ ok: true, status: 'generating' })

  try {
    const clipPath = await compileSceneClip(scene as SceneData, project?.ratio ?? '16:9')
    await db('scenes').where('id', scene.id).update({ compiled_clip_path: clipPath, clip_status: 'done' })
  } catch (err: any) {
    console.error(`Clip compile scene ${scene.id}:`, err.message)
    await db('scenes').where('id', scene.id).update({ clip_status: 'error' })
  }
})

// compile all clips for a project, then concatenate into final video
router.post('/project/:projectId', async (req, res) => {
  const project = await db('projects').where('id', req.params.projectId).first()
  if (!project) return res.status(404).json({ error: 'Project not found' })

  const scenes = await db('scenes').where('project_id', req.params.projectId).orderBy('index')
  const ready = scenes.filter((s) => s.video_path || s.image_path)

  if (!ready.length) return res.status(400).json({ error: 'No scenes with video or image' })

  const [compilation] = await db('compilations').insert({
    project_id: req.params.projectId,
    status: 'running',
    created_at: Date.now(),
  }).returning ? [undefined] : [undefined]

  const compilationId = await db('compilations')
    .where('project_id', req.params.projectId)
    .orderBy('created_at', 'desc')
    .first()
    .then(r => r.id)

  res.json({ ok: true, compilation_id: compilationId, queued: ready.length })

  const outputName = `final_${project.id}_${Date.now()}.mp4`

  try {
    const finalPath = await compileProject(
      ready as SceneData[],
      project.ratio ?? '16:9',
      outputName,
      async (msg) => {
        console.log(`[compile:${compilationId}] ${msg}`)
        await db('compilations').where('id', compilationId).update({ status: msg })
      },
    )
    await db('compilations').where('id', compilationId).update({
      output_path: finalPath,
      status: 'done',
    })
  } catch (err: any) {
    console.error('Compile error:', err.message)
    await db('compilations').where('id', compilationId).update({
      status: 'error',
      error: err.message,
    })
  }
})

// get compilation status
router.get('/status/:compilationId', async (req, res) => {
  const c = await db('compilations').where('id', req.params.compilationId).first()
  if (!c) return res.status(404).json({ error: 'Not found' })
  res.json(c)
})

// list compilations for project
router.get('/project/:projectId', async (req, res) => {
  const list = await db('compilations')
    .where('project_id', req.params.projectId)
    .orderBy('created_at', 'desc')
  res.json(list)
})

export default router
