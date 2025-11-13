// Loads and parses markdown-based choice metadata
// Uses Vite raw import to read file contents at build time
// Format:
// ## id: <id>
// Title: <title>
// Description: <description>
// Tags: comma,separated
// Linked: comma,separated (optional)

// Vite raw import for markdown file contents
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import raw from '../../content/choices.md?raw'

export type ChoiceMeta = {
  id: string
  title: string
  description: string
  tags: string[]
  linkedGroups: string[]
}

export function parseChoicesMarkdown(): ChoiceMeta[] {
  const text: string = (raw as unknown as string) ?? ''
  const sections = text.split(/^##\s+id:\s*/m).slice(1)
  const metas: ChoiceMeta[] = []
  for (const sec of sections) {
    const lines = sec.split(/\r?\n/)
    const idLine = lines[0]?.trim() ?? ''
    let id = idLine
    let title = ''
    let description = ''
    let tags: string[] = []
    let linkedGroups: string[] = []
    for (const line of lines.slice(1)) {
      const l = line.trim()
      if (l.toLowerCase().startsWith('title:')) {
        title = l.substring(6).trim()
      } else if (l.toLowerCase().startsWith('description:')) {
        description = l.substring(12).trim()
      } else if (l.toLowerCase().startsWith('tags:')) {
        tags = l.substring(5).split(',').map(s => s.trim()).filter(Boolean)
      } else if (l.toLowerCase().startsWith('linked:')) {
        linkedGroups = l.substring(7).split(',').map(s => s.trim()).filter(Boolean)
      }
    }
    if (id) metas.push({ id, title, description, tags, linkedGroups })
  }
  return metas
}

export const choiceMetaById: Map<string, ChoiceMeta> = new Map(
  parseChoicesMarkdown().map(m => [m.id, m])
)
