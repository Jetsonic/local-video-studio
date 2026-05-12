import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import fs from 'fs'

const DATA_DIR = path.join(process.cwd(), 'data')
const COMPILED_DIR = path.join(DATA_DIR, 'compiled')
const MEDIA_DIR = path.join(DATA_DIR, 'media')
const AUDIO_DIR = path.join(DATA_DIR, 'audio')

// resolve /media/x.mp4 → absolute path
function resolvePath(p: string): string {
  if (!p) throw new Error('Empty path')
  if (path.isAbsolute(p)) return p
  if (p.startsWith('/media/')) return path.join(MEDIA_DIR, p.replace(/^\/media\//, ''))
  if (p.startsWith('/audio/')) return path.join(AUDIO_DIR, p.replace(/^\/audio\//, ''))
  if (p.startsWith('/compiled/')) return path.join(COMPILED_DIR, p.replace(/^\/compiled\//, ''))
  return path.join(DATA_DIR, p)
}

function ffmpegBin(): string {
  return (
    process.env.FFMPEG_BIN ??
    'D:/Girish/Python/conda_windows/envs/ai-video/Library/bin/ffmpeg'
  )
}

ffmpeg.setFfmpegPath(ffmpegBin())

function run(cmd: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    cmd.on('error', (err) => reject(err)).on('end', () => resolve()).run()
  })
}

export interface SceneData {
  id: number
  index: number
  video_path?: string
  image_path?: string
  audio_path?: string
  duration: number
  compiled_clip_path?: string
}

// ── Step 1: merge video/image + audio into a single clip per scene ──────────

export async function compileSceneClip(scene: SceneData, ratio: string = '16:9'): Promise<string> {
  const outName = `clip_${scene.id}.mp4`
  const outPath = path.join(COMPILED_DIR, outName)

  const [rW, rH] = ratio.split(':').map(Number)
  const width = rW >= rH ? 1280 : 720
  const height = rW >= rH ? 720 : 1280

  const hasVideo = !!scene.video_path
  const hasAudio = !!scene.audio_path
  const duration = scene.duration || 4

  const videoSrc = hasVideo
    ? resolvePath(scene.video_path!)
    : scene.image_path
    ? resolvePath(scene.image_path)
    : null

  if (!videoSrc) throw new Error(`Scene ${scene.index} has no video or image`)

  const cmd = ffmpeg()
  const filters: string[] = []

  if (hasVideo) {
    cmd.input(videoSrc)
    // loop video if shorter than duration
    filters.push(`[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[vout]`)
  } else {
    // image as still: loop for duration seconds
    cmd.input(videoSrc).inputOptions(['-loop', '1', '-framerate', '24'])
    filters.push(`[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[vout]`)
  }

  if (hasAudio) {
    const audioSrc = resolvePath(scene.audio_path!)
    cmd.input(audioSrc)
    const audioIdx = 1
    // mix audio, pad if shorter than video, trim if longer
    filters.push(`[${audioIdx}:a]apad,atrim=0:${duration}[aout]`)
    cmd
      .complexFilter([...filters].join(';'), ['vout', 'aout'])
      .outputOptions(['-map', '[vout]', '-map', '[aout]'])
      .audioCodec('aac')
      .audioBitrate('192k')
  } else {
    // silent audio track
    cmd.input('anullsrc=r=44100:cl=stereo').inputOptions(['-f', 'lavfi'])
    filters.push('[1:a]atrim=0:' + duration + '[aout]')
    cmd
      .complexFilter([...filters].join(';'), ['vout', 'aout'])
      .outputOptions(['-map', '[vout]', '-map', '[aout]'])
      .audioCodec('aac')
      .audioBitrate('128k')
  }

  cmd
    .videoCodec('libx264')
    .videoBitrate('4000k')
    .outputOptions(['-t', String(duration), '-pix_fmt', 'yuv420p', '-movflags', '+faststart'])
    .output(outPath)

  await run(cmd)
  return `/compiled/${outName}`
}

// ── Step 2: concatenate all clips into final video ──────────────────────────

export async function concatenateClips(
  clips: string[],
  outputName: string,
  crossfadeDuration: number = 0.5,
): Promise<string> {
  if (clips.length === 0) throw new Error('No clips to concatenate')

  const outPath = path.join(COMPILED_DIR, outputName)
  const listFile = path.join(COMPILED_DIR, `_concat_${Date.now()}.txt`)

  if (clips.length === 1) {
    fs.copyFileSync(resolvePath(clips[0]), outPath)
    return `/compiled/${outputName}`
  }

  // write concat list file
  const lines = clips.map((c) => `file '${resolvePath(c).replace(/\\/g, '/')}'`).join('\n')
  fs.writeFileSync(listFile, lines)

  try {
    const cmd = ffmpeg()
      .input(listFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy', '-movflags', '+faststart'])
      .output(outPath)

    await run(cmd)
  } finally {
    fs.unlinkSync(listFile)
  }

  return `/compiled/${outputName}`
}

// ── Probe: get video duration ───────────────────────────────────────────────

export function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(resolvePath(filePath), (err, meta) => {
      if (err) return resolve(0)
      resolve(meta.format.duration ?? 0)
    })
  })
}

// ── Full pipeline: scenes → final video ────────────────────────────────────

export async function compileProject(
  scenes: SceneData[],
  ratio: string,
  outputName: string,
  onProgress?: (msg: string) => void,
): Promise<string> {
  const ordered = [...scenes].sort((a, b) => a.index - b.index)
  const clipPaths: string[] = []

  for (const scene of ordered) {
    onProgress?.(`Compiling scene ${scene.index}/${ordered.length}…`)
    const clipPath = await compileSceneClip(scene, ratio)
    clipPaths.push(clipPath)
  }

  onProgress?.('Concatenating all clips…')
  const finalPath = await concatenateClips(clipPaths, outputName)
  onProgress?.('Done.')
  return finalPath
}
