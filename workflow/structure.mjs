// Fixed BPMN topology checks. Local constraints and vocabulary live in structure.json; Coda's event names live in
// dialect.json. No engine compilation or expression evaluation takes place here. Maps keep arbitrary BPMN ids safe.
import { ISOInterval } from '@0dep/piso';
import structure from './structure.json' with { type: 'json' };
import dialect from './dialect.json' with { type: 'json' };

export const CODA_STRUCTURE = structure;
const extras = (node, type) => (node.extensionElements?.values ?? []).filter(v => v.$type === type);
const kinds = node => (node.eventDefinitions ?? []).map(d => d.$type.slice(5).replace(/EventDefinition$/, ''));
const hasEvent = (node, kind) => kinds(node).includes(kind);
const own = (table, key) => Object.hasOwn(table, key) ? table[key] : undefined;
const linkName = node => node.eventDefinitions?.find(d => d.$type === 'bpmn:LinkEventDefinition')?.name?.trim();
const check = (ok, message) => { if (!ok) throw new StructureProblem(message); };
class StructureProblem extends Error {}

// Only scalar values and derived facts go into Ajv, never moddle's cyclic references or a nested subtree.
function facts(n, process) {
  const data = Object.fromEntries(Object.entries(n).filter(([, v]) => v !== undefined && (v === null || typeof v !== 'object')));
  const event = n.eventDefinitions?.[0], loop = n.loopCharacteristics;
  const condition = n.conditionExpression ?? event?.condition;
  return { ...data, type: n.$type, top: n.$parent === process, parentType: n.$parent?.$type,
    subprocess: !!n.$instanceOf('bpmn:SubProcess'), triggeredByEvent: !!n.triggeredByEvent,
    isInterrupting: n.isInterrupting !== false, attachedType: n.attachedToRef?.$type ?? '',
    position: n.$type !== 'bpmn:StartEvent' ? n.$type : n.$parent === process ? 'start' : n.$parent.triggeredByEvent ? 'eventStart' : 'innerStart',
    eventKind: kinds(n)[0] ?? '', messageNamed: !!(event?.messageRef?.name ?? n.messageRef?.name),
    signalReferenced: !!event?.signalRef, escalationReferenced: !!event?.escalationRef, linkNamed: !!linkName(n),
    hasCondition: !!condition, condition: condition?.body, conditionLanguage: condition?.language,
    timeDuration: event?.timeDuration?.body, timeDate: event?.timeDate?.body, timeCycle: event?.timeCycle?.body, hasTimeCycle: !!event?.timeCycle,
    loopType: loop?.$type, collection: loop?.inputCollection, cardinality: loop?.loopCardinality?.body?.trim(),
    loopCompletion: loop?.completionCondition?.body, completion: n.completionCondition?.body,
    hasStartOrEnd: (n.flowElements ?? []).some(e => ['bpmn:StartEvent', 'bpmn:EndEvent'].includes(e.$type)),
    hasScriptExtension: extras(n, 'coda:Script').length > 0, hasOutputs: extras(n, 'coda:Output').length > 0,
    outputHasValue: extras(n, 'coda:Output').some(o => o.value !== undefined),
    documentation: n.$type === 'bpmn:UserTask' ? (n.documentation ?? []).map(d => d.text ?? '').join('\n').trim() : undefined,
    hasInputFields: extras(n, 'coda:Fields').length > 0 || extras(n, 'coda:Field').some(f => structure.inputFields.includes(f.type)),
  };
}

// Shell variable boundaries are lexical, not a shell parser: preserve Coda's treatment of escapes, $$, comments and quotes.
function scriptProblem(script, where) {
  for (let i = 0; i < script.length; i++) {
    if (script[i] === '\\') { i++; continue; }
    if (script[i] !== '$') continue;
    if (script[i + 1] === '$') { i++; continue; }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(script.slice(i + 1))?.[0];
    if (!name) continue;
    const after = i + 1 + name.length;
    if (script.codePointAt(after) > 0x7f) {
      const next = String.fromCodePoint(script.codePointAt(after));
      return `${where} 里的 \`$${name}\` 后面紧跟「${next}」，macOS 的 bash 会把它读进变量名而展开为空：` +
        `要展开变量写成 \`\${${name}}${next}\`，要原样输出这几个字写成 \`\\$${name}${next}\`（不放在单引号里）；这条检查不区分引号与注释`;
    }
    i = after - 1;
  }
  return null;
}
function scheduleCycle(text, where) {
  check(typeof text === 'string' && text.trim() && text.length <= structure.schedule.maxLength, `${where} 须为 ISO 8601 重复间隔，如 R/PT6H`);
  let interval;
  try { interval = new ISOInterval(text.trim()).parse(); }
  catch { check(false, `${where} 不是 ISO 8601 重复间隔：${text}（如 R/PT6H）`); }
  check(interval.repeat === -1 && interval.duration && !interval.end,
    `${where} 只接受不限次数、不写结束时间的重复间隔：R/<时长> 或 R/<开始时刻>/<时长>，如 R/PT6H；现为 ${text}`);
  check(interval.duration.toMilliseconds(new Date()) >= structure.schedule.minMilliseconds, `${where} 的间隔至少 5 分钟：${text}`);
}

export function structureChecker(ajv, { feelProblem, isExpression }) {
  const rules = structure.rules.map(rule => ({ ...rule, validate: ajv.compile(rule.schema), applies: rule.when && ajv.compile(rule.when) }));
  const idPattern = new RegExp(structure.id.pattern), settingsPattern = new RegExp(structure.schedule.settingsPattern);
  return (root, file) => {
    try { validate(root, file); return null; }
    catch (error) { if (error instanceof StructureProblem) return error.message; throw error; }
  };

  function validate(root, file) {
    const roots = root.rootElements ?? [], processes = roots.filter(e => e.$type === 'bpmn:Process');
    check(processes.length === 1, `${file}.bpmn 须恰好有一个 process，现有 ${processes.length} 个`);
    const [process] = processes;
    check(process.isExecutable === true, `${file}.bpmn 的 process 须写明可执行（isExecutable="true"）`);
    const others = roots.filter(e => !structure.topLevel.includes(e.$type));
    check(!others.length, `${file}.bpmn 里有 Coda 不支持的顶层元素：${others.map(e => e.$type).join('、')}`);
    const nodes = new Map(), flows = [], associations = [], entries = [];
    // Stack frames retain the scope rather than constructing every ancestor path up front (quadratic in nesting depth).
    const stack = [{ container: process, index: 0 }];
    while (stack.length) {
      const frame = stack.at(-1), children = frame.container.flowElements ?? [];
      if (frame.index === 0) for (const a of frame.container.artifacts ?? []) if (a.$type === 'bpmn:Association') associations.push(a);
      if (frame.index === children.length) { stack.pop(); continue; }
      const n = children[frame.index++];
      entries.push(n);
      if (n.$type === 'bpmn:SequenceFlow') flows.push(n); else nodes.set(n.id, n);
      if (n.$instanceOf('bpmn:SubProcess')) stack.push({ container: n, index: 0 });
    }
    const path = n => { const parts = []; for (let at = n; at && at !== root; at = at.$parent) parts.push(at.id); return parts.reverse().join('/'); };
    const names = Object.create(null);
    for (const name of dialect.variables) names[name] = null;
    for (const n of roots) if (n.$type === 'bpmn:Message') names[n.id] = null;
    for (const n of entries) names[n.id] = null;
    const ids = new Set(Object.keys(names));
    for (const n of entries) if (n.loopCharacteristics) {
      if (n.loopCharacteristics.inputElement !== undefined) names[n.loopCharacteristics.inputElement] = null;
      names.loopCounter = null;
    }
    const readable = (value, where) => { const problem = feelProblem(value, names); check(!problem, `${where}：${problem}`); };
    for (const n of entries) {
      if (!idPattern.test(n.id ?? '')) check(false, `${path(n)}：${structure.id.description}`);
      if (dialect.variables.includes(n.id)) check(false, `${path(n)}：id 不能是 ${dialect.variables.join('、')}：表达式按这些名字读运行自带的变量，任务的结果按 id 读`);
      const unsupported = own(structure.unsupported, n.$type);
      if (unsupported) check(false, `${path(n)}：Coda 不运行 ${n.$type.slice(5)}：${unsupported}`);
      const data = facts(n, process), allowed = own(structure.events, data.position);
      if (allowed) {
        const definitions = kinds(n), listed = allowed.map(k => structure.kindNames[k]).join('、');
        if (definitions.length > 1) check(false, `${path(n)}：一个事件只带一个事件定义；要等几个事件里先来的一个，在它们前面放一个事件网关（eventBasedGateway）`);
        for (const kind of definitions) {
          if (kind === 'Message' && structure.throwing.includes(data.position)) check(false, `${path(n)}：${structure.unsupported['bpmn:SendTask']}`);
          if (!allowed.includes(kind)) check(false, `${path(n)}：${structure.eventNames[data.position]}${allowed.length ? `只能是${listed}事件` : '不带事件定义'}${own(structure.eventSuffix, data.position) ?? ''}`);
        }
        if (structure.requiredEvents.includes(data.position) && definitions.length !== 1) check(false, `${path(n)}：${structure.eventNames[data.position]}要带一个事件定义（${listed}）`);
      }
      for (const rule of rules) {
        if (rule.on && !rule.on.includes(n.$type) || rule.applies && !rule.applies(data)) continue;
        if (!rule.validate(data)) check(false, `${rule.at === 'path' ? path(n) : n.id}：${rule.description}`);
      }
      for (const spec of structure.readable) if (data[spec.property] !== undefined)
        readable(data[spec.property], spec.where.replace(/^(path|id)/, kind => kind === 'path' ? path(n) : n.id));
      const loopName = n.loopCharacteristics?.inputElement;
      if (loopName !== undefined && ids.has(loopName)) check(false, `${path(n)}：coda:inputElement 不能是节点、消息的 id`);
      if (n.$type === 'bpmn:ScriptTask') { const problem = scriptProblem(n.script, `${n.id} 的脚本`); check(!problem, problem); }
      if (n.$type === 'bpmn:EndEvent') for (const output of extras(n, 'coda:Output'))
        check(output.value !== undefined, `${n.id} 的 coda:output ${output.name} 需要 value（不超过 4000 字）`);
    }
    const list = [...nodes.values()], startEvents = list.filter(n => n.$type === 'bpmn:StartEvent' && n.$parent === process);
    const incoming = new Map(), outgoing = new Map(), attached = new Map();
    const add = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };
    for (const f of flows) {
      if (!nodes.has(f.sourceRef?.id) || !nodes.has(f.targetRef?.id)) check(false, `${path(f)}：顺序流须引用流程中的起点与终点`);
      add(outgoing, f.sourceRef, f); add(incoming, f.targetRef, f);
    }
    for (const n of list) if (n.$type === 'bpmn:BoundaryEvent') {
      if (!nodes.has(n.attachedToRef?.id)) check(false, `${path(n)}：边界事件须引用挂靠的活动（attachedToRef）`);
      add(attached, n.attachedToRef, n);
    }
    for (const n of list) if (n.$type === 'bpmn:SubProcess' && n.triggeredByEvent) {
      check((n.flowElements ?? []).filter(e => e.$type === 'bpmn:StartEvent').length === 1, `${n.id}：事件子流程恰好一个开始事件，由它的事件启动`);
      check(!outgoing.has(n) && !incoming.has(n), `${n.id}：事件子流程不连顺序流，由它开始事件的事件启动`);
      check(!attached.has(n), `${n.id}：事件子流程上不挂边界事件`);
    }
    const catchesByScope = new Map(), links = [];
    for (const n of list) if (n.$type === 'bpmn:IntermediateCatchEvent' && linkName(n)) {
      if (!catchesByScope.has(n.$parent)) catchesByScope.set(n.$parent, new Map());
      const scope = catchesByScope.get(n.$parent), name = linkName(n);
      check(!scope.has(name), `${n.id}：同一层里只能有一个名为「${name}」的连接捕获事件`);
      scope.set(name, n);
    }
    for (const n of list) if (n.$type === 'bpmn:IntermediateThrowEvent' && linkName(n)) {
      const to = catchesByScope.get(n.$parent)?.get(linkName(n));
      check(to, `${n.id}：同一层里没有名为「${linkName(n)}」的连接捕获事件`);
      links.push([n, to]);
    }
    for (const n of list) if (n.$type === 'bpmn:EventBasedGateway') {
      const out = outgoing.get(n) ?? [];
      check(out.length >= 2, `${n.id}：事件网关后面至少接两个等待的事件`);
      check(out.every(f => !f.conditionExpression), `${n.id}：事件网关的出口不写条件，走哪条由先来的事件决定`);
      check(out.every(f => f.targetRef.$type === 'bpmn:ReceiveTask' || f.targetRef.$type === 'bpmn:IntermediateCatchEvent' && !linkName(f.targetRef)),
        `${n.id}：事件网关的出口只接中间捕获事件（消息、计时器、信号、条件）或 receiveTask`);
    }
    check(startEvents.length, `${file}.bpmn 需要一个开始事件`);
    const handlers = new Map(), compensations = [], compensated = new Set();
    for (const a of associations) add(handlers, a.sourceRef, a.targetRef);
    for (const n of list) if (n.$type === 'bpmn:BoundaryEvent' && hasEvent(n, 'Compensate')) {
      check(!outgoing.has(n), `${n.id}：补偿边界事件不连顺序流，用关联（association）连到做补偿的节点`);
      const to = handlers.get(n) ?? [];
      check(to.length === 1 && to[0]?.isForCompensation, `${n.id}：补偿边界事件用一条关联（association）连到一个标了 isForCompensation="true" 的节点`);
      compensations.push([n, to[0]]); compensated.add(to[0]);
    }
    for (const n of list) if (n.isForCompensation) {
      check(!outgoing.has(n) && !incoming.has(n), `${n.id}：做补偿的节点（isForCompensation）不连顺序流，由补偿边界事件的关联引到`);
      check(compensated.has(n), `${n.id}：没有补偿边界事件用关联引到这个做补偿的节点`);
    }
    const scripts = list.filter(n => n.$type === 'bpmn:ScriptTask'), services = list.filter(n => n.$type === 'bpmn:ServiceTask');
    check(scripts.length <= structure.maxScripts, `${file}.bpmn 最多 ${structure.maxScripts} 个 scriptTask`);
    check(list.some(n => structure.steps.includes(n.$type)), `${file}.bpmn 至少要有一个 scriptTask、serviceTask、userTask 或 callActivity`);
    // Reachability includes boundary, link, compensation and scope entry/exit edges. Explicit worklists terminate on cycles.
    const next = new Map();
    for (const f of flows) add(next, f.sourceRef, f.targetRef);
    for (const [n, boundaries] of attached) for (const b of boundaries) add(next, n, b);
    for (const [from, to] of links) add(next, from, to);
    for (const n of list) if (n.$instanceOf('bpmn:SubProcess')) {
      const adHoc = n.$type === 'bpmn:AdHocSubProcess';
      for (const inner of n.flowElements ?? []) {
        const flowing = !['bpmn:BoundaryEvent', 'bpmn:SequenceFlow'].includes(inner.$type) && !inner.isForCompensation;
        if (adHoc ? flowing && !incoming.has(inner) : inner.$type === 'bpmn:StartEvent') add(next, n, inner);
        if (adHoc ? flowing && !outgoing.has(inner) : inner.$type === 'bpmn:EndEvent')
          for (const to of next.get(n) ?? []) if (to.$parent !== n) add(next, inner, to);
      }
    }
    for (const [from, to] of compensations) add(next, from, to);
    const seen = new Set(), todo = list.filter(n => n.$type === 'bpmn:StartEvent' && (n.$parent === process || n.$parent.triggeredByEvent));
    while (todo.length) { const n = todo.pop(); if (seen.has(n)) continue; seen.add(n); for (const to of next.get(n) ?? []) todo.push(to); }
    const unreachable = scripts.concat(services).filter(n => !seen.has(n));
    check(!unreachable.length, `从开始事件走不到这些步骤：${unreachable.map(n => n.id).join('、')}`);
    const unreachableTasks = list.filter(n => n.$type === 'bpmn:UserTask' && !seen.has(n));
    check(!unreachableTasks.length, `从开始事件走不到这些任务：${unreachableTasks.map(n => n.id).join('、')}`);
    const timed = n => hasEvent(n, 'Timer'), timers = startEvents.filter(timed);
    check(timers.length <= 1, `定时开始只能有一个，现有 ${timers.map(n => n.id).join('、')}`);
    if (timers.length) {
      const [timer] = timers, timing = timer.eventDefinitions[0];
      check(!timing.timeDuration && !timing.timeDate && timing.timeCycle?.body?.trim(), `${timer.id}：定时开始写 timeCycle（ISO 8601 重复间隔，如 R/PT6H），不写 timeDuration、timeDate`);
      const cycle = timing.timeCycle.body.trim();
      if (isExpression(cycle)) check(settingsPattern.test(cycle), `${timer.id}：timeCycle 的表达式只能读插件的设置，如 =vars.maintenance.schedule`);
      else scheduleCycle(cycle, `${timer.id} 的 timeCycle`);
    }
    const starts = startEvents.flatMap(n => (n.eventDefinitions ?? []).filter(d => d.$type === 'bpmn:MessageEventDefinition').map(d => d.messageRef.name));
    const roles = dialect.eventRoles;
    check(!(starts.length || timers.length) || startEvents.every(n => n.eventDefinitions?.length), `由事件或定时启动的流程，开始事件都要带消息或计时器；要手动发起，订阅 ${roles.dispatch}`);
    if (starts.includes(roles.lifecycleStart)) {
      const asks = list.filter(n => n.$type === 'bpmn:UserTask');
      check(!asks.length, `跟随会话的流程（订阅 ${roles.lifecycleStart}）不能有人工任务：${asks.map(n => n.id).join('、')}。它不属于任何会话，任务没有人可交`);
      const hears = n => n.messageRef?.name === roles.lifecycleFacts || (n.eventDefinitions ?? []).some(d => d.messageRef?.name === roles.lifecycleFacts);
      const listeningScopes = new Set(list.filter(n => n.$type === 'bpmn:StartEvent' && n.$parent.triggeredByEvent && hears(n)).map(n => n.$parent.$parent));
      const heard = new Map([[process, false]]);
      // Entries are in parent-before-child order, so each ancestor's answer is reused once.
      for (const n of list) heard.set(n, heard.get(n.$parent) || listeningScopes.has(n.$parent) || (attached.get(n) ?? []).some(hears));
      const waits = list.filter(n => structure.lifecycle.waitTypes.includes(n.$type) || n.$type === 'bpmn:ServiceTask' && structure.lifecycle.waitActions.includes(n.action) ||
        !n.$instanceOf('bpmn:SubProcess') && (attached.get(n) ?? []).some(timed));
      const deaf = waits.filter(n => !hears(n) && !heard.get(n));
      check(!deaf.length, `聋状态：流程在 ${deaf.map(n => n.id).join('、')} 等待时收不到 ${roles.lifecycleFacts}，会话的事实变了没有人回应。` +
        `跟随会话的流程（订阅 ${roles.lifecycleStart}）每个等待节点都要能收 ${roles.lifecycleFacts}：自己等它，或挂一个等它的消息边界事件（挂在外层子流程上也算）`);
    }
    check(process.agents === undefined || starts.includes(roles.lifecycleStart), `coda:agents 只写在生命周期流程上（开始事件订阅 ${roles.lifecycleStart}）`);
    check(process.key === undefined || !starts.includes(roles.lifecycleStart), '生命周期流程按会话唯一，不能声明 coda:key');
    check(process.dispatch !== false || starts.length || timers.length, 'coda:dispatch="false" 的流程须由事件或定时启动（开始事件带消息或计时器），否则无法发起');
    const messageNames = new Set();
    for (const m of roots.filter(e => e.$type === 'bpmn:Message')) {
      if (m.name) {
        check(!messageNames.has(m.name), `<message name="${m.name}"> 写了不止一个：一个事件只写一个 <message>，开始事件与等它的节点都引用它`);
        messageNames.add(m.name);
      }
      check(!dialect.variables.includes(m.id), `<message id="${m.id}">：id 不能是 ${dialect.variables.join('、')}：表达式按这些名字读运行自带的变量，接到的消息按 id 读`);
    }
    const caught = new Map();
    for (const n of list) if (n.$type !== 'bpmn:StartEvent' || n.$parent.triggeredByEvent) {
      const names = (n.eventDefinitions ?? []).filter(d => d.$type === 'bpmn:MessageEventDefinition').map(d => d.messageRef.name);
      if (n.messageRef?.name) names.push(n.messageRef.name);
      for (const name of names) add(caught, name, n);
    }
    const userMessage = new RegExp(dialect.userMessage);
    check(!starts.some(name => userMessage.test(name)), '用户发出的消息（user.…）不能启动流程，只能在运行中等它');
    check(!starts.includes(roles.cancel), `${roles.cancel} 是要停下运行，不能启动流程；在运行中等它，接到后走自己的收尾`);
    for (const [name, waiting] of caught) if (name.startsWith(structure.userMessages.prefix)) {
      check(userMessage.test(name), `<message name="${name}">：用户发出的消息名为 user. 加小写字母、数字和「-」`);
      const label = waiting.find(n => n.name?.trim())?.name.trim() ?? name;
      check(label.length <= structure.userMessages.maxLabelLength, `等 ${name} 的节点名须不超过 40 个字（它是运行页上的按钮）`);
    }
  }
}
