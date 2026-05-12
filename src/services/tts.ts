import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import { getSetting } from '../db'

const execFileAsync = promisify(execFile)

const AUDIO_DIR = path.join(process.cwd(), 'data', 'audio')

// find python executable
function getPython(): string {
  const candidates = [
    process.env.PYTHON_BIN,
    'D:/Girish/Python/conda_windows/envs/ai-video/python',
    'python',
    'python3',
  ]
  for (const c of candidates) {
    if (c && fs.existsSync(c.replace(/\//g, path.sep))) return c
  }
  return 'python'
}

const EDGE_TTS_SCRIPT = `
import asyncio, sys, edge_tts

async def main():
    text = sys.argv[1]
    voice = sys.argv[2]
    rate = sys.argv[3]
    volume = sys.argv[4]
    output = sys.argv[5]
    communicate = edge_tts.Communicate(text, voice, rate=rate, volume=volume)
    await communicate.save(output)

asyncio.run(main())
`

export async function generateTTS(
  text: string,
  outputName: string,
  voice?: string,
): Promise<string> {
  const v = voice ?? (await getSetting('tts_voice')) ?? 'en-US-AriaNeural'
  const rate = (await getSetting('tts_rate')) ?? '+0%'
  const volume = (await getSetting('tts_volume')) ?? '+0%'

  const outputPath = path.join(AUDIO_DIR, outputName)
  const scriptPath = path.join(AUDIO_DIR, '_tts_runner.py')
  fs.writeFileSync(scriptPath, EDGE_TTS_SCRIPT)

  const python = getPython()
  await execFileAsync(python, [scriptPath, text, v, rate, volume, outputPath], {
    timeout: 30000,
  })

  if (!fs.existsSync(outputPath)) throw new Error('TTS output file not created')
  return `/audio/${outputName}`
}

export async function listVoices(): Promise<{ name: string; locale: string; gender: string }[]> {
  const script = `
import asyncio, edge_tts, json, sys
async def main():
    voices = await edge_tts.list_voices()
    print(json.dumps([{"name": v["ShortName"], "locale": v["Locale"], "gender": v["Gender"]} for v in voices]))
asyncio.run(main())
`
  const scriptPath = path.join(AUDIO_DIR, '_list_voices.py')
  fs.writeFileSync(scriptPath, script)
  const python = getPython()
  try {
    const { stdout } = await execFileAsync(python, [scriptPath], { timeout: 15000 })
    return JSON.parse(stdout.trim())
  } catch {
    return []
  }
}

export async function getAudioDuration(audioPath: string): Promise<number> {
  try {
    const absPath = path.join(process.cwd(), 'data', audioPath.replace(/^\/audio\//, 'audio/'))
    const ffprobe = process.env.FFPROBE_BIN ?? 'ffprobe'
    const { stdout } = await execFileAsync(ffprobe, [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', absPath,
    ], { timeout: 10000 })
    return parseFloat(stdout.trim()) || 0
  } catch {
    return 0
  }
}
