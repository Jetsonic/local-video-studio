import Knex from 'knex'
import path from 'path'
import fs from 'fs'

const dataDir = path.join(process.cwd(), 'data')
fs.mkdirSync(dataDir, { recursive: true })
fs.mkdirSync(path.join(dataDir, 'media'), { recursive: true })
fs.mkdirSync(path.join(dataDir, 'audio'), { recursive: true })
fs.mkdirSync(path.join(dataDir, 'compiled'), { recursive: true })

export const db = Knex({
  client: 'better-sqlite3',
  connection: { filename: path.join(dataDir, 'studio.sqlite') },
  useNullAsDefault: true,
})

export async function initDB() {
  await db.schema.createTableIfNotExists('settings', (t) => {
    t.string('key').primary()
    t.text('value')
  })

  await db.schema.createTableIfNotExists('projects', (t) => {
    t.increments('id').primary()
    t.string('name').notNullable()
    t.text('description')
    t.string('ratio').defaultTo('16:9')
    t.string('style').defaultTo('cinematic')
    t.integer('created_at').notNullable()
  })

  await db.schema.createTableIfNotExists('scripts', (t) => {
    t.increments('id').primary()
    t.integer('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE')
    t.text('content')
    t.integer('updated_at')
  })

  await db.schema.createTableIfNotExists('scenes', (t) => {
    t.increments('id').primary()
    t.integer('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE')
    t.integer('script_id').references('id').inTable('scripts').onDelete('SET NULL')
    t.integer('index').notNullable()
    t.text('description')
    t.text('visual_prompt')
    t.text('video_prompt')
    t.text('narration')
    t.string('image_path')
    t.string('video_path')
    t.string('audio_path')
    t.string('compiled_clip_path')
    t.integer('duration').defaultTo(4)
    t.string('image_status').defaultTo('idle')
    t.string('video_status').defaultTo('idle')
    t.string('audio_status').defaultTo('idle')
    t.string('clip_status').defaultTo('idle')
    t.string('video_model').defaultTo('wan2.2-t2v')
    t.string('resolution').defaultTo('480p')
    t.string('tts_voice').defaultTo('en-US-AriaNeural')
  })

  await db.schema.createTableIfNotExists('compilations', (t) => {
    t.increments('id').primary()
    t.integer('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE')
    t.string('output_path')
    t.string('status').defaultTo('idle')
    t.text('error')
    t.integer('created_at')
  })

  // migrate existing scenes table to add new columns if upgrading
  const cols = await db('scenes').columnInfo()
  if (!cols.narration) await db.schema.table('scenes', t => { t.text('narration') })
  if (!cols.audio_path) await db.schema.table('scenes', t => { t.string('audio_path') })
  if (!cols.compiled_clip_path) await db.schema.table('scenes', t => { t.string('compiled_clip_path') })
  if (!cols.audio_status) await db.schema.table('scenes', t => { t.string('audio_status').defaultTo('idle') })
  if (!cols.clip_status) await db.schema.table('scenes', t => { t.string('clip_status').defaultTo('idle') })
  if (!cols.tts_voice) await db.schema.table('scenes', t => { t.string('tts_voice').defaultTo('en-US-AriaNeural') })

  const defaults: Record<string, string> = {
    ollama_url: 'http://localhost:11434',
    ollama_model: 'qwen3.5:latest',
    comfyui_url: 'http://127.0.0.1:8000',
    image_model: 'flux-schnell',
    video_model: 'wan2.2-t2v',
    video_resolution: '480p',
    video_fps: '16',
    tts_voice: 'en-US-AriaNeural',
    tts_rate: '+0%',
    tts_volume: '+0%',
    narration_system_prompt: `You are a narrator for a short film. Given a scene description, write natural narration text that will be spoken aloud. Keep it concise (2-4 sentences), vivid, and match the scene mood. Return only the narration text, no quotes, no labels.`,
    scene_system_prompt: `You are a professional screenwriter and storyboard director.
Break the given script into individual scenes. Each scene should be a self-contained visual moment.
Respond ONLY with a JSON array, no markdown, no explanation:
[
  {
    "index": 1,
    "description": "Brief scene description for script context",
    "visual_prompt": "Detailed visual prompt for image generation: camera angle, lighting, subject, environment, art style, quality tags",
    "video_prompt": "Cinematic video prompt describing motion, atmosphere, action",
    "duration": 4
  }
]`,
    enhance_system_prompt: `You are a professional screenwriter. Enhance the given script to be more vivid, cinematic, and engaging. Keep the same story but improve pacing, descriptions, and dialogue. Return only the enhanced script text.`,
  }

  for (const [key, value] of Object.entries(defaults)) {
    const existing = await db('settings').where('key', key).first()
    if (!existing) await db('settings').insert({ key, value })
  }
}

export async function getSetting(key: string): Promise<string> {
  const row = await db('settings').where('key', key).first()
  return row?.value ?? ''
}

export async function setSetting(key: string, value: string) {
  const existing = await db('settings').where('key', key).first()
  if (existing) await db('settings').where('key', key).update({ value })
  else await db('settings').insert({ key, value })
}
