import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import morgan from 'morgan'
import path from 'path'
import fs from 'fs'
import { initDB } from './db'
import { initSocket } from './socket'
import projectRoutes from './routes/projects'
import scriptRoutes from './routes/scripts'
import sceneRoutes from './routes/scenes'
import settingsRoutes from './routes/settings'
import audioRoutes from './routes/audio'
import compileRoutes from './routes/compile'

const PORT = parseInt(process.env.PORT ?? '3100')
const app = express()
const httpServer = createServer(app)

app.use(cors())
app.use(morgan('dev'))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

const mediaDir = path.join(process.cwd(), 'data', 'media')
const audioDir = path.join(process.cwd(), 'data', 'audio')
const compiledDir = path.join(process.cwd(), 'data', 'compiled')
fs.mkdirSync(mediaDir, { recursive: true })
fs.mkdirSync(audioDir, { recursive: true })
fs.mkdirSync(compiledDir, { recursive: true })
app.use('/media', express.static(mediaDir))
app.use('/audio', express.static(audioDir))
app.use('/compiled', express.static(compiledDir))

const publicDir = path.join(process.cwd(), 'public')
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'))
  })
}

app.use('/api/projects', projectRoutes)
app.use('/api/scripts', scriptRoutes)
app.use('/api/scenes', sceneRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/audio', audioRoutes)
app.use('/api/compile', compileRoutes)

app.get('/api/health', (_req, res) => res.json({ ok: true, version: '1.0.0' }))

initSocket(httpServer)

async function start() {
  await initDB()
  httpServer.listen(PORT, '0.0.0.0', () => {
    const { networkInterfaces } = require('os')
    const nets = networkInterfaces()
    const localIPs = Object.values(nets).flat().filter((n: any) => n.family === 'IPv4' && !n.internal).map((n: any) => n.address)
    console.log(`Local Video Studio → http://localhost:${PORT}`)
    localIPs.forEach((ip: string) => console.log(`Network           → http://${ip}:${PORT}`))
  })
}

start().catch(console.error)
