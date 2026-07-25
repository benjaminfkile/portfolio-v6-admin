/**
 * Shared code-language allowlist for the `code` block (§3.7). The list matches exactly the
 * languages the public site loads into its highlighter — an unrecognised language renders
 * as plain text rather than failing, so the admin only ever offers values the renderer can
 * honour. Kept free of JSX/MUI so both the code-block editor and its tests can import it.
 *
 * `text` is the sentinel for "no highlighting"; it is also the default for a fresh block.
 */
export interface CodeLanguage {
  value: string;
  label: string;
}

export const CODE_LANGUAGES: CodeLanguage[] = [
  { value: 'text', label: 'Plain text' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'tsx', label: 'TSX' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'jsx', label: 'JSX' },
  { value: 'python', label: 'Python' },
  { value: 'sql', label: 'SQL' },
  { value: 'css', label: 'CSS' },
  { value: 'html', label: 'HTML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
];

/** Just the allowlisted language identifiers, for membership checks. */
export const CODE_LANGUAGE_VALUES: string[] = CODE_LANGUAGES.map((l) => l.value);

/** Default language for a freshly added code block — plain text, always safe. */
export const DEFAULT_CODE_LANGUAGE = 'text';

/** True when `lang` is on the allowlist (§3.7). */
export function isAllowedLanguage(lang: string): boolean {
  return CODE_LANGUAGE_VALUES.includes(lang);
}
