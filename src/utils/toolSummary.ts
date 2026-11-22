import { compactPath } from '@/utils/toolKind'

const SUMMARY_FIELDS = [
  'command',
  'file_path',
  'path',
  'pattern',
  'url',
  'query',
  'description',
  'prompt'
] as const
const SUMMARY_CHARS = 120

/** The one input field that says what a tool call does, shortened to a line. */
export const summarizeToolInput = (input: Record<string, unknown>): string => {
  const value = SUMMARY_FIELDS.map((field) => input[field]).find((v) => typeof v === 'string')
  // A file path keeps its end, where the file name is, before the line gets cut.
  const line = typeof value === 'string' ? compactPath(value.split('\n')[0] ?? '') : ''
  return line.length > SUMMARY_CHARS ? `${line.slice(0, SUMMARY_CHARS)}…` : line
}
