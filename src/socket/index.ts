import { Server as SocketServer } from 'socket.io'
import { Server as HttpServer } from 'http'
import { generateScript, enhanceScript, generateVisualPrompt, generateVideoPrompt } from '../services/ollama'
import { db } from '../db'

export function initSocket(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: { origin: '*' },
    path: '/socket.io',
  })

  io.on('connection', (socket) => {
    socket.on('script:generate', async ({ projectId, premise, style }) => {
      try {
        socket.emit('script:start')
        const content = await generateScript(premise, style, (chunk) => {
          socket.emit('script:chunk', chunk)
        })
        const existing = await db('scripts').where('project_id', projectId).first()
        if (existing) {
          await db('scripts').where('id', existing.id).update({ content, updated_at: Date.now() })
        } else {
          await db('scripts').insert({ project_id: projectId, content, updated_at: Date.now() })
        }
        socket.emit('script:done', { content })
      } catch (err: any) {
        socket.emit('script:error', err.message)
      }
    })

    socket.on('script:enhance', async ({ projectId, content }) => {
      try {
        socket.emit('script:start')
        const enhanced = await enhanceScript(content, (chunk) => {
          socket.emit('script:chunk', chunk)
        })
        const existing = await db('scripts').where('project_id', projectId).first()
        if (existing) {
          await db('scripts').where('id', existing.id).update({ content: enhanced, updated_at: Date.now() })
        } else {
          await db('scripts').insert({ project_id: projectId, content: enhanced, updated_at: Date.now() })
        }
        socket.emit('script:done', { content: enhanced })
      } catch (err: any) {
        socket.emit('script:error', err.message)
      }
    })

    socket.on('scene:visual-prompt', async ({ sceneId, description, style }) => {
      try {
        socket.emit('prompt:start', { sceneId })
        const prompt = await generateVisualPrompt(description, style, (chunk) => {
          socket.emit('prompt:chunk', { sceneId, chunk })
        })
        await db('scenes').where('id', sceneId).update({ visual_prompt: prompt })
        socket.emit('prompt:done', { sceneId, prompt })
      } catch (err: any) {
        socket.emit('prompt:error', { sceneId, error: err.message })
      }
    })

    socket.on('scene:video-prompt', async ({ sceneId, description, visualPrompt }) => {
      try {
        socket.emit('vprompt:start', { sceneId })
        const prompt = await generateVideoPrompt(description, visualPrompt, (chunk) => {
          socket.emit('vprompt:chunk', { sceneId, chunk })
        })
        await db('scenes').where('id', sceneId).update({ video_prompt: prompt })
        socket.emit('vprompt:done', { sceneId, prompt })
      } catch (err: any) {
        socket.emit('vprompt:error', { sceneId, error: err.message })
      }
    })

    socket.on('scene:poll', async ({ sceneId }) => {
      const scene = await db('scenes').where('id', sceneId).first()
      if (scene) socket.emit('scene:update', scene)
    })
  })

  return io
}
