import { Router } from 'express'
import { db } from '../db'
import { breakIntoScenes } from '../services/ollama'

const router = Router()

router.get('/:projectId', async (req, res) => {
  const script = await db('scripts').where('project_id', req.params.projectId).first()
  res.json(script ?? null)
})

router.put('/:projectId', async (req, res) => {
  const { content } = req.body
  const existing = await db('scripts').where('project_id', req.params.projectId).first()
  if (existing) {
    await db('scripts').where('id', existing.id).update({ content, updated_at: Date.now() })
    res.json({ id: existing.id })
  } else {
    const [id] = await db('scripts').insert({
      project_id: req.params.projectId,
      content,
      updated_at: Date.now(),
    })
    res.json({ id })
  }
})

router.post('/:projectId/breakdown', async (req, res) => {
  try {
    const script = await db('scripts').where('project_id', req.params.projectId).first()
    if (!script?.content) return res.status(400).json({ error: 'No script found' })

    const scenes = await breakIntoScenes(script.content)

    await db('scenes').where('project_id', req.params.projectId).delete()

    const project = await db('projects').where('id', req.params.projectId).first()
    const defaultVideoModel = req.body.video_model ?? 'wan2.2-t2v'
    const defaultResolution = req.body.resolution ?? '480p'

    const inserted = await Promise.all(
      scenes.map(async (s) => {
        const [id] = await db('scenes').insert({
          project_id: req.params.projectId,
          script_id: script.id,
          index: s.index,
          description: s.description,
          visual_prompt: s.visual_prompt,
          video_prompt: s.video_prompt,
          duration: s.duration ?? 4,
          image_status: 'idle',
          video_status: 'idle',
          video_model: defaultVideoModel,
          resolution: defaultResolution,
        })
        return { id, ...s }
      }),
    )

    res.json(inserted)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
