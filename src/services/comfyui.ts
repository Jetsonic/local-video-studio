import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { getSetting } from '../db'

const MEDIA_DIR = path.join(process.cwd(), 'data', 'media')

async function base(): Promise<string> {
  return ((await getSetting('comfyui_url')) || 'http://127.0.0.1:8000').replace(/\/$/, '')
}

async function queuePrompt(workflow: object): Promise<string> {
  const url = await base()
  const resp = await axios.post(`${url}/prompt`, { prompt: workflow })
  return resp.data.prompt_id as string
}

async function pollHistory(promptId: string, timeoutMs = 600000): Promise<any> {
  const url = await base()
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await sleep(2500)
    const resp = await axios.get(`${url}/history/${promptId}`)
    const entry = resp.data[promptId]
    if (!entry) continue
    if (entry.status?.status_str === 'error') {
      const msg =
        entry.status?.messages?.find((m: any) => m[0] === 'execution_error')?.[1]
          ?.exception_message ?? 'ComfyUI execution error'
      throw new Error(msg)
    }
    if (entry.outputs && Object.keys(entry.outputs).length > 0) return entry.outputs
  }
  throw new Error('ComfyUI timed out')
}

async function downloadOutput(url: string, filename: string): Promise<string> {
  const resp = await axios.get(url, { responseType: 'arraybuffer' })
  const filepath = path.join(MEDIA_DIR, filename)
  fs.writeFileSync(filepath, Buffer.from(resp.data))
  return `/media/${filename}`
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function rnd() {
  return Math.floor(Math.random() * 1e9)
}

// ── Resolution helpers ──────────────────────────────────────────────────────

const RES: Record<string, { w: number; h: number }> = {
  '480p-16:9': { w: 848, h: 480 },
  '480p-9:16': { w: 480, h: 848 },
  '480p-1:1': { w: 512, h: 512 },
  '720p-16:9': { w: 1280, h: 720 },
  '720p-9:16': { w: 720, h: 1280 },
  '1080p-16:9': { w: 1920, h: 1080 },
}

function dims(resolution: string, ratio: string) {
  return RES[`${resolution}-${ratio}`] ?? RES['480p-16:9']
}

// ── Upload image to ComfyUI ─────────────────────────────────────────────────

export async function uploadImage(imagePath: string): Promise<string> {
  const url = await base()
  const buf = fs.readFileSync(imagePath)
  const filename = path.basename(imagePath)
  const FormData = (await import('form-data')).default
  const form = new FormData()
  form.append('image', buf, { filename, contentType: 'image/png' })
  form.append('overwrite', 'true')
  const resp = await axios.post(`${url}/upload/image`, form, {
    headers: form.getHeaders(),
  })
  return resp.data.name as string
}

// ── Image generation ────────────────────────────────────────────────────────

export type ImageModel = 'flux-schnell' | 'ernie-image' | 'ernie-image-turbo'

export async function generateImage(
  prompt: string,
  ratio: string = '16:9',
  resolution: string = '480p',
  outputName?: string,
  imageModel: ImageModel = 'flux-schnell',
): Promise<string> {
  const { w, h } = dims(resolution, ratio)
  const workflow = imageModel === 'ernie-image'
    ? buildErnieWorkflow(prompt, w, h, 'ernie-image.safetensors')
    : imageModel === 'ernie-image-turbo'
    ? buildErnieWorkflow(prompt, w, h, 'ernie-image-turbo.safetensors')
    : buildFluxWorkflow(prompt, w, h)
  const promptId = await queuePrompt(workflow)
  const outputs = await pollHistory(promptId)

  const url = await base()
  for (const nodeOut of Object.values(outputs) as any[]) {
    if (nodeOut.images?.length) {
      const f = nodeOut.images[0]
      const fileUrl = `${url}/view?filename=${f.filename}&subfolder=${f.subfolder ?? ''}&type=${f.type ?? 'output'}`
      const name = outputName ?? `img_${Date.now()}.png`
      return downloadOutput(fileUrl, name)
    }
  }
  throw new Error('No image output from ComfyUI')
}

// ── Video generation ────────────────────────────────────────────────────────

export type VideoModel = 'wan2.2-t2v' | 'wan2.2-i2v' | 'hunyuan-t2v' | 'hunyuan-i2v' | 'ltxv-t2v' | 'ltxv-i2v'

export async function generateVideo(
  prompt: string,
  model: VideoModel,
  ratio: string = '16:9',
  resolution: string = '480p',
  durationSecs: number = 4,
  imagePathForI2V?: string,
  outputName?: string,
): Promise<string> {
  const { w, h } = dims(resolution, ratio)
  const fps = 16
  const frames = Math.max(9, Math.round(durationSecs * fps))

  let imageName: string | undefined
  if (imagePathForI2V && model.endsWith('-i2v')) {
    const absPath = path.join(process.cwd(), 'data', imagePathForI2V.replace(/^\/media\//, 'media/'))
    imageName = await uploadImage(absPath)
  }

  let workflow: object
  if (model === 'wan2.2-t2v') workflow = buildWan22T2V(prompt, w, h, frames)
  else if (model === 'wan2.2-i2v') workflow = buildWan22I2V(prompt, imageName!, w, h, frames)
  else if (model === 'hunyuan-t2v') workflow = buildHunyuanT2V(prompt, w, h, frames)
  else if (model === 'hunyuan-i2v') workflow = buildHunyuanI2V(prompt, imageName!, w, h, frames)
  else if (model === 'ltxv-t2v') workflow = buildLTXVT2V(prompt, w, h, frames)
  else if (model === 'ltxv-i2v') workflow = buildLTXVI2V(prompt, imageName!, w, h, frames)
  else throw new Error(`Unknown video model: ${model}`)

  const promptId = await queuePrompt(workflow)
  const outputs = await pollHistory(promptId, 900000)

  const url = await base()
  for (const nodeOut of Object.values(outputs) as any[]) {
    const files = nodeOut.gifs ?? nodeOut.videos ?? nodeOut.images ?? []
    if (files.length) {
      const f = files[0]
      const fileUrl = `${url}/view?filename=${f.filename}&subfolder=${f.subfolder ?? ''}&type=${f.type ?? 'output'}`
      const name = outputName ?? `vid_${Date.now()}.webp`
      return downloadOutput(fileUrl, name)
    }
  }
  throw new Error('No video output from ComfyUI')
}

// ── Status check ────────────────────────────────────────────────────────────

export async function getComfyStatus(): Promise<{ ok: boolean; version?: string; gpu?: string }> {
  try {
    const url = await base()
    const resp = await axios.get(`${url}/system_stats`, { timeout: 3000 })
    const dev = resp.data.devices?.[0]
    return {
      ok: true,
      version: resp.data.system?.comfyui_version,
      gpu: dev ? `${dev.name} (${Math.round(dev.vram_free / 1e9)}GB free)` : undefined,
    }
  } catch {
    return { ok: false }
  }
}

export async function getAvailableModels(): Promise<{ checkpoints: string[]; unets: string[] }> {
  try {
    const url = await base()
    const [ckptResp, unetResp] = await Promise.all([
      axios.get(`${url}/object_info/CheckpointLoaderSimple`),
      axios.get(`${url}/object_info/UNETLoader`),
    ])
    return {
      checkpoints: ckptResp.data.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [],
      unets: unetResp.data.UNETLoader?.input?.required?.unet_name?.[0] ?? [],
    }
  } catch {
    return { checkpoints: [], unets: [] }
  }
}

// ── Workflow builders ───────────────────────────────────────────────────────

function buildFluxWorkflow(prompt: string, w: number, h: number): object {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-schnell-fp8.safetensors' } },
    '2': { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 1], text: prompt } },
    '3': { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 1], text: '' } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: w, height: h, batch_size: 1 } },
    '5': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0], seed: rnd(), steps: 4, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0 } },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'lvs_img' } },
  }
}

function buildErnieWorkflow(prompt: string, w: number, h: number, unetName: string): object {
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: unetName, weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'ernie-image-prompt-enhancer.safetensors', type: 'qwen_image' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'flux2-vae.safetensors' } },
    '4': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: prompt } },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: '' } },
    '6': { class_type: 'EmptyLatentImage', inputs: { width: w, height: h, batch_size: 1 } },
    '7': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0], seed: rnd(), steps: 20, cfg: 3.5, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0 } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    '9': { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'lvs_ernie_img' } },
  }
}

function buildWan22T2V(prompt: string, w: number, h: number, frames: number): object {
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors', weight_dtype: 'fp8_e4m3fn' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'umt5xxl_fp8_e4m3fn.safetensors', type: 'wan' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'wan_2.1_vae.safetensors' } },
    '4': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: prompt } },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: 'worst quality, low quality, blurry, watermark' } },
    '6': { class_type: 'EmptyHunyuanLatentVideo', inputs: { width: w, height: h, length: frames, batch_size: 1 } },
    '7': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0], seed: rnd(), steps: 20, cfg: 6, sampler_name: 'euler', scheduler: 'linear_quadratic', denoise: 1.0 } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    '9': { class_type: 'SaveAnimatedWEBP', inputs: { images: ['8', 0], filename_prefix: 'lvs_wan_t2v', fps: 16, lossless: false, quality: 85, method: 'default' } },
  }
}

function buildWan22I2V(prompt: string, imageName: string, w: number, h: number, frames: number): object {
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors', weight_dtype: 'fp8_e4m3fn' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'umt5xxl_fp8_e4m3fn.safetensors', type: 'wan' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'wan_2.1_vae.safetensors' } },
    '4': { class_type: 'LoadImage', inputs: { image: imageName } },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: prompt } },
    '6': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: 'worst quality, low quality, blurry, watermark' } },
    '7': { class_type: 'WanImageToVideo', inputs: { model: ['1', 0], clip: ['2', 0], vae: ['3', 0], image: ['4', 0], positive: ['5', 0], negative: ['6', 0], width: w, height: h, length: frames, batch_size: 1, seed: rnd(), steps: 20, cfg: 6, sampler_name: 'euler', scheduler: 'linear_quadratic', denoise: 1.0, force_offload: true } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    '9': { class_type: 'SaveAnimatedWEBP', inputs: { images: ['8', 0], filename_prefix: 'lvs_wan_i2v', fps: 16, lossless: false, quality: 85, method: 'default' } },
  }
}

function buildHunyuanT2V(prompt: string, w: number, h: number, frames: number): object {
  // HunyuanVideo15ImageToVideo wraps conditioning + creates latent; required before KSampler
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'hunyuanvideo1.5_720p_t2v_fp16.safetensors', weight_dtype: 'default' } },
    '2': { class_type: 'DualCLIPLoader', inputs: { clip_name1: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', clip_name2: 'byt5_small_glyphxl_fp16.safetensors', type: 'hunyuan_video_15' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'hunyuanvideo15_vae_fp16.safetensors' } },
    '4': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: prompt } },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: '' } },
    '6': { class_type: 'HunyuanVideo15ImageToVideo', inputs: { positive: ['4', 0], negative: ['5', 0], vae: ['3', 0], width: w, height: h, length: frames, batch_size: 1 } },
    '7': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['6', 0], negative: ['6', 1], latent_image: ['6', 2], seed: rnd(), steps: 20, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0 } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    '9': { class_type: 'SaveAnimatedWEBP', inputs: { images: ['8', 0], filename_prefix: 'lvs_hun_t2v', fps: 16, lossless: false, quality: 85, method: 'default' } },
  }
}

function buildHunyuanI2V(prompt: string, imageName: string, w: number, h: number, frames: number): object {
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'hunyuanvideo1.5_720p_i2v_fp16.safetensors', weight_dtype: 'default' } },
    '2': { class_type: 'DualCLIPLoader', inputs: { clip_name1: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', clip_name2: 'byt5_small_glyphxl_fp16.safetensors', type: 'hunyuan_video_15' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'hunyuanvideo15_vae_fp16.safetensors' } },
    '4': { class_type: 'LoadImage', inputs: { image: imageName } },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: prompt } },
    '6': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: '' } },
    '7': { class_type: 'HunyuanVideo15ImageToVideo', inputs: { positive: ['5', 0], negative: ['6', 0], vae: ['3', 0], width: w, height: h, length: frames, batch_size: 1, start_image: ['4', 0] } },
    '8': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['7', 0], negative: ['7', 1], latent_image: ['7', 2], seed: rnd(), steps: 20, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0 } },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['3', 0] } },
    '10': { class_type: 'SaveAnimatedWEBP', inputs: { images: ['9', 0], filename_prefix: 'lvs_hun_i2v', fps: 16, lossless: false, quality: 85, method: 'default' } },
  }
}

function buildLTXVT2V(prompt: string, w: number, h: number, frames: number): object {
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'ltx-video-2b-v0.9.5.safetensors', weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 't5xxl_fp8_e4m3fn.safetensors', type: 'ltxv' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'ltxv-spatial-vae-diffusers.safetensors' } },
    '4': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: prompt } },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: 'worst quality, low quality, blurry, jitter, watermark' } },
    '6': { class_type: 'EmptyLTXVLatentVideo', inputs: { width: w, height: h, length: frames, batch_size: 1 } },
    '7': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0], seed: rnd(), steps: 25, cfg: 3, sampler_name: 'euler', scheduler: 'ltxv_linear_quadratic', denoise: 1.0 } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    '9': { class_type: 'SaveAnimatedWEBP', inputs: { images: ['8', 0], filename_prefix: 'lvs_ltxv_t2v', fps: 24, lossless: false, quality: 85, method: 'default' } },
  }
}

function buildLTXVI2V(prompt: string, imageName: string, w: number, h: number, frames: number): object {
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'ltx-video-2b-v0.9.5.safetensors', weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 't5xxl_fp8_e4m3fn.safetensors', type: 'ltxv' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'ltxv-spatial-vae-diffusers.safetensors' } },
    '4': { class_type: 'LoadImage', inputs: { image: imageName } },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: prompt } },
    '6': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: 'worst quality, low quality, blurry, jitter, watermark' } },
    '7': { class_type: 'LTXVImgToVideo', inputs: { model: ['1', 0], clip: ['2', 0], vae: ['3', 0], image: ['4', 0], positive: ['5', 0], negative: ['6', 0], width: w, height: h, length: frames, batch_size: 1, seed: rnd(), steps: 25, cfg: 3, sampler_name: 'euler', scheduler: 'ltxv_linear_quadratic', denoise: 1.0 } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    '9': { class_type: 'SaveAnimatedWEBP', inputs: { images: ['8', 0], filename_prefix: 'lvs_ltxv_i2v', fps: 24, lossless: false, quality: 85, method: 'default' } },
  }
}
