import { describe, it, expect } from 'vitest'
import { caseVariants } from '../case-variants'

describe('caseVariants', () => {
  it('fans out lowercase to lowercase + Title-case', () => {
    expect(caseVariants('potato')).toEqual(['potato', 'Potato'])
  })

  it('fans out Title-case to lowercase + Title-case', () => {
    expect(caseVariants('Potato')).toEqual(['potato', 'Potato'])
  })

  it('keeps ALL CAPS acronyms verbatim', () => {
    expect(caseVariants('NASA')).toEqual(['NASA'])
  })

  it('keeps camelCase / brand casing verbatim', () => {
    expect(caseVariants('iPhone')).toEqual(['iPhone'])
    expect(caseVariants('GitHub')).toEqual(['GitHub'])
    expect(caseVariants('macOS')).toEqual(['macOS'])
  })

  it('preserves apostrophes in both variants', () => {
    expect(caseVariants("potato's")).toEqual(["potato's", "Potato's"])
  })
})
