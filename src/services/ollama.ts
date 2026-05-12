import OpenAI from 'openai'
import { getSetting } from '../db'

async function getClient() {
  const baseURL = (await getSetting('ollama_url')) + '/v1'
  return new OpenAI({ baseURL, apiKey: 'ollama' })
}

export async function ollamaChat(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  model?: string,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const client = await getClient()
  const mdl = model ?? (await getSetting('ollama_model'))

  if (onChunk) {
    const stream = await client.chat.completions.create({
      model: mdl,
      messages,
      stream: true,
      temperature: 0.7,
    })
    let full = ''
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? ''
      if (delta) {
        full += delta
        onChunk(delta)
      }
    }
    return full
  }

  const resp = await client.chat.completions.create({
    model: mdl,
    messages,
    temperature: 0.7,
  })
  return resp.choices[0]?.message?.content ?? ''
}

export async function listOllamaModels(): Promise<string[]> {
  const client = await getClient()
  try {
    const list = await client.models.list()
    return list.data.map((m) => m.id)
  } catch {
    return []
  }
}

export async function generateScript(
  premise: string,
  style: string,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const systemPrompt = await getSetting('enhance_system_prompt')
  return ollamaChat(
    [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Write a ${style} short film script based on this premise:\n\n${premise}\n\nWrite a complete script with scene descriptions and dialogue. Be cinematic and vivid.`,
      },
    ],
    undefined,
    onChunk,
  )
}

export async function enhanceScript(
  script: string,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const systemPrompt = await getSetting('enhance_system_prompt')
  return ollamaChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Enhance this script:\n\n${script}` },
    ],
    undefined,
    onChunk,
  )
}

export async function breakIntoScenes(script: string): Promise<SceneBreakdown[]> {
  const systemPrompt = await getSetting('scene_system_prompt')
  const model = await getSetting('ollama_model')

  const resp = await ollamaChat(
    [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Break this script into scenes:\n\n${script}\n\nReturn only valid JSON array.`,
      },
    ],
    model,
  )

  const cleaned = resp.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start === -1 || end === -1) throw new Error('No JSON array in response')
  return JSON.parse(cleaned.slice(start, end + 1))
}

export async function generateVisualPrompt(
  sceneDesc: string,
  style: string,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  return ollamaChat(
    [
      {
        role: 'system',
        content:
          'You are an expert image prompt engineer. Convert scene descriptions into detailed visual prompts optimized for diffusion models. Include: subject, environment, lighting, camera angle, art style, quality tags. Be specific and descriptive. Return only the prompt, no explanation.',
      },
      {
        role: 'user',
        content: `Scene: ${sceneDesc}\nStyle: ${style}\n\nGenerate a detailed image prompt:`,
      },
    ],
    undefined,
    onChunk,
  )
}

export async function generateVideoPrompt(
  sceneDesc: string,
  visualPrompt: string,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  return ollamaChat(
    [
      {
        role: 'system',
        content:
          'You are a video prompt engineer. Create motion-focused prompts for AI video generation. Describe camera movement, subject motion, atmosphere, lighting changes. Keep it under 150 words. Return only the prompt.',
      },
      {
        role: 'user',
        content: `Scene: ${sceneDesc}\nVisual context: ${visualPrompt}\n\nGenerate a video motion prompt:`,
      },
    ],
    undefined,
    onChunk,
  )
}

export interface SceneBreakdown {
  index: number
  description: string
  visual_prompt: string
  video_prompt: string
  duration: number
}
