import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  forecastStages,
  overallStatus,
  predecessorViolation,
  scheduleTasks,
  stageAppearance,
  stageDurationDays,
  stagesToActivate,
  statusPercent,
  type PredecessorScope,
} from '../src/domain.ts'

describe('cor da bolinha', () => {
  it('fica cinza enquanto a etapa não foi ativada', () => {
    assert.deepEqual(
      stageAppearance({ activated: false, operatorIds: ['a'], completedOperatorIds: ['a'] }),
      { color: 'gray', unassigned: false },
    )
  })

  it('fica cinza com aviso quando está ativada e sem operador', () => {
    assert.deepEqual(
      stageAppearance({ activated: true, operatorIds: [], completedOperatorIds: [] }),
      { color: 'gray', unassigned: true },
    )
  })

  it('fica azul com operadores e nenhuma conclusão', () => {
    assert.deepEqual(
      stageAppearance({ activated: true, operatorIds: ['a', 'b'], completedOperatorIds: [] }),
      { color: 'blue', unassigned: false },
    )
  })

  it('fica amarela quando só parte dos operadores concluiu', () => {
    assert.deepEqual(
      stageAppearance({ activated: true, operatorIds: ['a', 'b'], completedOperatorIds: ['a'] }),
      { color: 'yellow', unassigned: false },
    )
  })

  it('fica verde quando todos os alocados concluíram', () => {
    assert.deepEqual(
      stageAppearance({ activated: true, operatorIds: ['a'], completedOperatorIds: ['a'] }),
      { color: 'green', unassigned: false },
    )
  })

  it('ignora conclusão de quem não está mais alocado', () => {
    assert.deepEqual(
      stageAppearance({ activated: true, operatorIds: ['a'], completedOperatorIds: ['a', 'saiu'] }),
      { color: 'green', unassigned: false },
    )
  })
})

describe('previsão das etapas', () => {
  it('ancora a etapa ativada na data de ativação e encadeia a seguinte pelo fim previsto', () => {
    const forecasts = forecastStages('2026-11-06', [
      { id: 'a', position: 1, durationDays: 5, activatedAt: '2026-11-06' },
      { id: 'b', position: 2, durationDays: 2, activatedAt: null },
      { id: 'c', position: 3, durationDays: 1, activatedAt: '2026-11-20' },
    ])
    assert.deepEqual(forecasts, [
      { id: 'a', forecastStart: '2026-11-06', forecastEnd: '2026-11-12' },
      { id: 'b', forecastStart: '2026-11-12', forecastEnd: '2026-11-13' },
      { id: 'c', forecastStart: '2026-11-20', forecastEnd: '2026-11-20' },
    ])
  })
})

describe('duração e status da lista', () => {
  it('mede o intervalo das tarefas e usa zero quando não há data', () => {
    assert.equal(stageDurationDays([]), 0)
    assert.equal(stageDurationDays([{ startDate: '', endDate: '' }]), 0)
    assert.equal(stageDurationDays([
      { startDate: '2026-11-02', endDate: '2026-11-06' },
      { startDate: '2026-11-02', endDate: '2026-11-06' },
    ]), 5)
    assert.equal(stageDurationDays([
      { startDate: '2026-11-06', endDate: '2026-11-09' },
      { startDate: '2026-11-09', endDate: '2026-11-11' },
    ]), 4)
  })

  it('informa percentual e o rótulo geral', () => {
    assert.equal(statusPercent(0, 0), 0)
    assert.equal(statusPercent(3, 10), 30)
    assert.equal(overallStatus([]), 'Em andamento')
    assert.equal(overallStatus(['green', 'blue']), 'Em andamento')
    assert.equal(overallStatus(['green']), 'Concluído')
  })
})

describe('ativação da esteira', () => {
  it('ativa só a etapa imediatamente seguinte a uma etapa verde', () => {
    assert.deepEqual(
      stagesToActivate([
        { id: 'a', position: 1, activatedAt: '2026-11-06', color: 'green' },
        { id: 'b', position: 2, activatedAt: null, color: 'gray' },
        { id: 'c', position: 3, activatedAt: null, color: 'gray' },
      ]),
      ['b'],
    )
  })

  it('não reativa etapa que já foi ativada e segue para a próxima verde', () => {
    assert.deepEqual(
      stagesToActivate([
        { id: 'a', position: 1, activatedAt: '2026-11-06', color: 'green' },
        { id: 'b', position: 2, activatedAt: '2026-11-07', color: 'green' },
        { id: 'c', position: 3, activatedAt: null, color: 'gray' },
      ]),
      ['c'],
    )
  })
})

describe('cronograma da etapa', () => {
  const anchor = '2026-11-06'

  it('recalcula o fim e empurra a cadeia quando a duração muda', () => {
    const first = scheduleTasks(anchor, [
      { id: 'a', durationDays: 2, predecessorId: null, manualStart: null },
      { id: 'b', durationDays: 3, predecessorId: 'a', manualStart: '2027-01-01' },
      { id: 'c', durationDays: 1, predecessorId: 'b', manualStart: null },
    ])
    assert.deepEqual(first.get('a'), { startDate: '2026-11-06', endDate: '2026-11-09' })
    assert.deepEqual(first.get('b'), { startDate: '2026-11-10', endDate: '2026-11-12' })
    assert.deepEqual(first.get('c'), { startDate: '2026-11-13', endDate: '2026-11-13' })

    const shortened = scheduleTasks(anchor, [
      { id: 'a', durationDays: 4, predecessorId: null, manualStart: null },
      { id: 'b', durationDays: 3, predecessorId: 'a', manualStart: '2027-01-01' },
      { id: 'c', durationDays: 1, predecessorId: 'b', manualStart: null },
    ])
    assert.deepEqual(shortened.get('a'), { startDate: '2026-11-06', endDate: '2026-11-11' })
    assert.deepEqual(shortened.get('b'), { startDate: '2026-11-12', endDate: '2026-11-16' })
    assert.deepEqual(shortened.get('c'), { startDate: '2026-11-17', endDate: '2026-11-17' })
  })

  it('move a cadeia quando o início sem predecessora muda', () => {
    const moved = scheduleTasks(anchor, [
      { id: 'a', durationDays: 2, predecessorId: null, manualStart: '2026-11-10' },
      { id: 'b', durationDays: 1, predecessorId: 'a', manualStart: null },
    ])
    assert.deepEqual(moved.get('a'), { startDate: '2026-11-10', endDate: '2026-11-11' })
    assert.deepEqual(moved.get('b'), { startDate: '2026-11-12', endDate: '2026-11-12' })
  })

  it('aceita a etapa anterior e recusa posterior, duas etapas atrás, outro projeto e ciclo', () => {
    const scope: PredecessorScope = {
      sameStageIds: new Set(['a', 'b', 'c']),
      previousStageIds: new Set(['p']),
      laterStageIds: new Set(['n']),
      earlierStageIds: new Set(['old']),
    }
    const links = new Map<string, string | null>([
      ['a', null],
      ['b', 'a'],
      ['c', 'b'],
      ['p', null],
      ['n', null],
      ['old', null],
    ])
    assert.equal(predecessorViolation('a', 'a', scope, links), 'A tarefa não pode ser predecessora de si mesma.')
    assert.equal(
      predecessorViolation('a', 'n', scope, links),
      'A predecessora não pode ser de uma etapa posterior.',
    )
    assert.equal(
      predecessorViolation('a', 'old', scope, links),
      'A predecessora não pode ser de uma etapa anterior à imediatamente anterior.',
    )
    assert.equal(
      predecessorViolation('a', 'fora', scope, links),
      'A predecessora precisa ser uma tarefa deste projeto.',
    )
    assert.equal(predecessorViolation('a', 'c', scope, links), 'Essa predecessora fecharia um ciclo.')
    const crossing = new Map(links)
    crossing.set('p', 'b')
    assert.equal(predecessorViolation('a', 'p', scope, crossing), 'Essa predecessora fecharia um ciclo.')
    assert.equal(predecessorViolation('b', 'a', scope, links), null)
    assert.equal(predecessorViolation('b', 'p', scope, links), null)
  })

  it('começa no dia útil seguinte ao fim da predecessora e ignora o início digitado', () => {
    const scheduled = scheduleTasks(anchor, [
      { id: 'b', durationDays: 3, predecessorId: 'a', manualStart: '2027-01-01' },
    ], new Map([['a', '2026-11-06']]))
    assert.deepEqual(scheduled.get('b'), { startDate: '2026-11-09', endDate: '2026-11-11' })
  })

  it('conta o início como dia 1 e termina em 06/11 uma tarefa de 5 dias úteis', () => {
    const scheduled = scheduleTasks('2026-11-02', [
      { id: 'a', durationDays: 5, predecessorId: null, manualStart: null },
    ])
    assert.deepEqual(scheduled.get('a'), { startDate: '2026-11-02', endDate: '2026-11-06' })
  })

  it('pula o fim de semana ao somar a duração', () => {
    const scheduled = scheduleTasks(anchor, [
      { id: 'a', durationDays: 5, predecessorId: null, manualStart: null },
    ])
    assert.deepEqual(scheduled.get('a'), { startDate: '2026-11-06', endDate: '2026-11-12' })
  })
})
