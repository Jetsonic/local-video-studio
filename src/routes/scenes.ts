import { Router } from 'express'
import { db } from '../db'
import { generateImage, generateVideo, type VideoModel, type ImageModel } from '../services/comfyui'

const router = Router()

router.get('/:projectId', async (req, res) => {
  const scenes = await db('scenes').where('project_id', req.params.projectId).orderBy('index')
  res.json(scenes)
})

router.patch('/:id', async (req, res) => {
  const allowed = ['description', 'visual_prompt', 'video_prompt', 'duration', 'video_model', 'resolution']
  const update: any = {}
  for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k]
  await db('scenes').where('id', req.params.id).update(update)
  res.json({ ok: true })
})

router.delete('/:id', async (req, res) => {
  await db('scenes').where('id', req.params.id).delete()
  res.json({ ok: true })
})

router.post('/:id/image', async (req, res) => {
  const scene = await db('scenes').where('id', req.params.id).first()
  if (!scene) return res.status(404).json({ error: 'Scene not found' })

  await db('scenes').where('id', scene.id).update({ image_status: 'generating' })

  const project = await db('projects').where('id', scene.project_id).first()
  const ratio = project?.ratio ?? '16:9'
  const resolution = scene.resolution ?? '480p'

  const imageModel = (req.body.image_model ?? 'flux-schnell') as ImageModel
  generateImage(scene.visual_prompt, ratio, resolution, `img_${scene.id}_${Date.now()}.png`, imageModel)
    .then(async (imagePath) => {
      await db('scenes').where('id', scene.id).update({ image_path: imagePath, image_status: 'done' })
    })
    .catch(async (err) => {
      console.error(`Scene ${scene.id} image error:`, err.message)
      await db('scenes').where('id', scene.id).update({ image_status: 'error' })
    })

  res.json({ ok: true, status: 'generating' })
})

router.post('/:id/video', async (req, res) => {
  const scene = await db('scenes').where('id', req.params.id).first()
  if (!scene) return res.status(404).json({ error: 'Scene not found' })

  await db('scenes').where('id', scene.id).update({ video_status: 'generating' })

  const project = await db('projects').where('id', scene.project_id).first()
  const ratio = project?.ratio ?? '16:9'
  const model = (req.body.model ?? scene.video_model ?? 'wan2.2-t2v') as VideoModel
  const resolution = req.body.resolution ?? scene.resolution ?? '480p'

  const isI2V = model.endsWith('-i2v')
  const imagePathForI2V = isI2V ? scene.image_path : undefined

  generateVideo(
    scene.video_prompt ?? scene.visual_prompt,
    model,
    ratio,
    resolution,
    scene.duration ?? 4,
    imagePathForI2V,
    `vid_${scene.id}_${Date.now()}.webp`,
  )
    .then(async (videoPath) => {
      await db('scenes').where('id', scene.id).update({
        video_path: videoPath,
        video_status: 'done',
        video_model: model,
        resolution,
      })
    })
    .catch(async (err) => {
      console.error(`Scene ${scene.id} video error:`, err.message)
      await db('scenes').where('id', scene.id).update({ video_status: 'error' })
    })

  res.json({ ok: true, status: 'generating' })
})

router.post('/batch-image/:projectId', async (req, res) => {
  const imageModel = (req.body.image_model ?? 'flux-schnell') as ImageModel
  const scenes = await db('scenes')
    .where('project_id', req.params.projectId)
    .where('image_status', 'idle')
    .orderBy('index')

  res.json({ ok: true, queued: scenes.length })

  for (const scene of scenes) {
    const project = await db('projects').where('id', scene.project_id).first()
    await db('scenes').where('id', scene.id).update({ image_status: 'generating' })
    try {
      const imagePath = await generateImage(
        scene.visual_prompt,
        project?.ratio ?? '16:9',
        scene.resolution ?? '480p',
        `img_${scene.id}_${Date.now()}.png`,
        imageModel,
      )
      await db('scenes').where('id', scene.id).update({ image_path: imagePath, image_status: 'done' })
    } catch (err: any) {
      console.error(`Batch image scene ${scene.id}:`, err.message)
      await db('scenes').where('id', scene.id).update({ image_status: 'error' })
    }
  }
})

router.post('/batch-video/:projectId', async (req, res) => {
  const model = (req.body.model ?? 'wan2.2-t2v') as VideoModel
  const scenes = await db('scenes')
    .where('project_id', req.params.projectId)
    .where('video_status', 'idle')
    .orderBy('index')

  res.json({ ok: true, queued: scenes.length })

  for (const scene of scenes) {
    const project = await db('projects').where('id', scene.project_id).first()
    const isI2V = model.endsWith('-i2v')
    await db('scenes').where('id', scene.id).update({ video_status: 'generating' })
    try {
      const videoPath = await generateVideo(
        scene.video_prompt ?? scene.visual_prompt,
        model,
        project?.ratio ?? '16:9',
        scene.resolution ?? '480p',
        scene.duration ?? 4,
        isI2V ? scene.image_path : undefined,
        `vid_${scene.id}_${Date.now()}.webp`,
      )
      await db('scenes').where('id', scene.id).update({
        video_path: videoPath,
        video_status: 'done',
        video_model: model,
      })
    } catch (err: any) {
      console.error(`Batch video scene ${scene.id}:`, err.message)
      await db('scenes').where('id', scene.id).update({ video_status: 'error' })
    }
  }
})

export default router
