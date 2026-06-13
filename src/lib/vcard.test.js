import { describe, it, expect } from 'vitest'
import { personToVcard, peopleToVcf, parseVcf } from './vcard'

describe('vcard round-trip', () => {
  it('exports then re-imports a person with all fields intact', () => {
    const person = {
      id: 'abc-123',
      name: 'Maria de la Cruz',
      organization_id: 'o1',
      role: 'Lab Director',
      email: 'maria@pace.example',
      phone: '+1 520-555-0142',
      birthday: '1985-03-09',
      address: '123 Main St, Tucson, AZ 85701, USA',
      tags: ['PACE customer', 'UA'],
      notes: 'Met at the materials conference.',
    }
    const orgsById = new Map([['o1', { id: 'o1', name: 'PACE Technologies' }]])
    const [rec] = parseVcf(personToVcard(person, orgsById))
    expect(rec.name).toBe('Maria de la Cruz')
    expect(rec.organization).toBe('PACE Technologies') // export resolves id→name, import reads it back as a string
    expect(rec.role).toBe('Lab Director')
    expect(rec.email).toBe('maria@pace.example')
    expect(rec.phone).toBe('+1 520-555-0142')
    expect(rec.birthday).toBe('1985-03-09')
    expect(rec.address).toBe('123 Main St, Tucson, AZ 85701, USA')
    expect(rec.tags).toEqual(['PACE customer', 'UA'])
    expect(rec.notes).toBe('Met at the materials conference.')
  })

  it('parses a multi-card file and drops nameless cards', () => {
    const vcf = peopleToVcf([
      { id: '1', name: 'Ann Park' },
      { id: '2', name: 'Bob Park', email: 'bob@x.example' },
    ])
    const recs = parseVcf(
      vcf + 'BEGIN:VCARD\r\nVERSION:3.0\r\nEMAIL:noname@x.example\r\nEND:VCARD\r\n',
    )
    expect(recs.map((r) => r.name)).toEqual(['Ann Park', 'Bob Park'])
  })

  it('handles escaped commas/semicolons and CATEGORIES correctly', () => {
    const vcf = personToVcard(
      {
        id: 'x',
        name: 'Smith, John',
        organization_id: 'o9',
        tags: ['a, with comma', 'plain'],
        notes: 'line1\nline2',
      },
      new Map([['o9', { id: 'o9', name: 'Acme; Inc' }]]),
    )
    const [rec] = parseVcf(vcf)
    expect(rec.name).toBe('Smith, John')
    expect(rec.organization).toBe('Acme; Inc')
    expect(rec.tags).toEqual(['a, with comma', 'plain'])
    expect(rec.notes).toBe('line1\nline2')
  })

  it('parses a real-world iPhone-style card (structured N/ADR, folded, no FN)', () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Nguyen;Thi;;;',
      'ORG:Globex Corporation;Research Division',
      'TEL;type=CELL;type=VOICE;type=pref:+1 (415) 555-9988',
      'item1.ADR;type=HOME;type=pref:;;500 Long Street Name That Will Cause This Conte',
      ' nt Line To Fold;Phoenix;AZ;85004;USA',
      'BDAY:19901231',
      'END:VCARD',
    ].join('\r\n')
    const [rec] = parseVcf(vcf)
    expect(rec.name).toBe('Thi Nguyen')
    expect(rec.organization).toBe('Globex Corporation')
    expect(rec.phone).toBe('+1 (415) 555-9988')
    expect(rec.birthday).toBe('1990-12-31')
    expect(rec.address).toBe(
      '500 Long Street Name That Will Cause This Content Line To Fold, Phoenix, AZ 85004, USA',
    )
  })

  it('drops a year-less birthday rather than guessing', () => {
    const vcf = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:No Year\r\nBDAY:--03-09\r\nEND:VCARD'
    const [rec] = parseVcf(vcf)
    expect(rec.birthday).toBeUndefined()
  })
})
