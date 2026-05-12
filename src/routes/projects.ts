import { Router } from 'express'
import { db } from '../db'

const router = Router()

router.get('/', async (_req, res) => {
  const projects = await db('projects').orderBy('created_at', 'desc')
  const withScenes = await Promise.all(
    projects.map(async (p) => {
      const sceneCount = await db('scenes').where('project_id', p.id).count('id as count').first()
      const script = await db('scripts').where('project_id', p.id).first()
      return { ...p, scene_count: sceneCount?.count ?? 0, has_script: !!script?.content }
    }),
  )
  res.json(withScenes)
})

router.get('/:id', async (req, res) => {
  const project = await db('projects').where('id', req.params.id).first()
  if (!project) return res.status(404).json({ error: 'Not found' })
  res.json(project)
})

router.post('/', async (req, res) => {
  const { name, description, ratio, style } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  const [id] = await db('projects').insert({
    name,
    description: description ?? '',
    ratio: ratio ?? '16:9',
    style: style ?? 'cinematic',
    created_at: Date.now(),
  })
  res.json({ id })
})

router.patch('/:id', async (req, res) => {
  const { name, description, ratio, style } = req.body
  await db('projects').where('id', req.params.id).update({ name, description, ratio, style })
  res.json({ ok: true })
})

router.delete('/:id', async (req, res) => {
  await db('projects').where('id', req.params.id).delete()
  res.json({ ok: true })
})

export default router
