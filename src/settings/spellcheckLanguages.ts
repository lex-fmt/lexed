export interface SpellcheckLanguageOption {
  value: string
  label: string
}

export const SPELLCHECK_LANGUAGES: SpellcheckLanguageOption[] = [
  { value: 'en_US', label: 'English (US)' },
  { value: 'en_GB', label: 'English (UK)' },
  { value: 'es_ES', label: 'Spanish' },
  { value: 'fr_FR', label: 'French' },
  { value: 'de_DE', label: 'German' },
  { value: 'pt_BR', label: 'Portuguese (BR)' },
  { value: 'it_IT', label: 'Italian' },
  { value: 'ru_RU', label: 'Russian' },
  { value: 'nl_NL', label: 'Dutch' },
  { value: 'pl_PL', label: 'Polish' },
]
