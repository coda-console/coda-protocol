import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CODA_STRUCTURE, workflowProblem } from '../workflow.mjs';

const xml = (body, top = '', attrs = '') => `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:coda="https://coda.pub/schema/bpmn/1.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" targetNamespace="test">${top}<process id="p" isExecutable="true" ${attrs}>${body}</process></definitions>`;
const flow = (from, to, id = `${from}-${to}`, condition = '') => `<sequenceFlow id="${id}" sourceRef="${from}" targetRef="${to}">${condition}</sequenceFlow>`;
const job = (id = 'n', extra = '', attrs = '') => `<scriptTask id="${id}" scriptFormat="bash" ${attrs}><script>echo ok</script>${extra}</scriptTask>`;
const ext = body => `<extensionElements>${body}</extensionElements>`;
const one = (node = '<userTask id="n"/>', extra = '', top = '', attrs = '') => xml(`<startEvent id="s"/>${flow('s','n')}${node}${extra}`, top, attrs);
const timer = '<timerEventDefinition><timeDuration>PT1M</timeDuration></timerEventDefinition>';
const startTimer = cycle => `<startEvent id="s"><timerEventDefinition><timeCycle>${cycle}</timeCycle></timerEventDefinition></startEvent>`;
const timed = (cycle, extra = '', attrs = '') => xml(`${startTimer(cycle)}${flow('s','n')}<userTask id="n"/>${extra}`, '', attrs);
const message = '<message id="m" name="repo.push"/>';
const byMessage = (name, body = '<userTask id="n"/>', extra = '', attrs = '') => xml(`<startEvent id="s"><messageEventDefinition messageRef="m"/></startEvent>${flow('s','n')}${body}${extra}`, `<message id="m" name="${name}"/>`, attrs);
const loop = body => `<multiInstanceLoopCharacteristics>${body}</multiInstanceLoopCharacteristics>`;
const wrong = [
  [xml('').replace('<process id="p" isExecutable="true" ></process>', ''), 'workflow.bpmn 须恰好有一个 process，现有 0 个'],
  [one().replace('</definitions>', '<process id="q" isExecutable="true"/></definitions>'), 'workflow.bpmn 须恰好有一个 process，现有 2 个'],
  [one().replace('isExecutable="true"', 'isExecutable="false"'), 'workflow.bpmn 的 process 须写明可执行（isExecutable="true"）'],
  [one('<userTask id="n"/>', '', '<collaboration id="c"/>'), 'workflow.bpmn 里有 Coda 不支持的顶层元素：bpmn:Collaboration'],
  [one('<userTask id="n"/>', '<task id="bad.id"/>'), 'p/bad.id：id 须为字母开头的字母、数字、「_」「-」'],
  [one('<userTask id="n"/>', '<task id="run"/>'), 'p/run：id 不能是 inputs、run、github、vars：表达式按这些名字读运行自带的变量，任务的结果按 id 读'],
  [one('<userTask id="n" coda:expect="PT1H"/>'), 'n：coda:expect 只写在子流程上'],
  [one('<userTask id="n" coda:optional="false"/>'), 'n：coda:optional 只写在最外层的子流程上（事件子流程不是阶段）'],
  [one('<subProcess id="n"><endEvent id="e" coda:notify="true"/></subProcess><callActivity id="work" calledElement="work"/>'), 'e：coda:notify 只写在流程最外层的结束事件上'],
  [one().replace('<startEvent id="s"/>','<startEvent id="s" coda:scope="project"/>'), 's：coda:reportTo、coda:reportOn、coda:scope 只写在定时开始事件上（由会话发起的运行交给发起它的会话）'],
  [one(`<serviceTask id="n">${ext('<coda:script>echo</coda:script>')}</serviceTask>`), 'n：脚本步骤写成 <scriptTask scriptFormat="bash">，脚本放在 <script> 里；serviceTask 只用于 coda:action'],
  [one('<serviceTask id="n"/>'), 'n：serviceTask 是 Coda 自己做的一步，须写 coda:action；脚本步骤写成 scriptTask'],
  [one('<serviceTask id="n" coda:action="workflow-kinds" coda:timeout="1"/>'), 'n：coda:action 的步骤由 Coda 执行，不写脚本与 coda:audience、coda:group、coda:timeout、coda:checkout、coda:retry 等（要为一段占组用 hold-group）'],
  [one('<callActivity id="n" calledElement="UPPER"/>'), 'n：callActivity 的 calledElement 写要调用的能力或流程名（小写字母、数字和「-」，以字母开头）'],
  [one('<scriptTask id="n" scriptFormat="js"><script>echo</script></scriptTask>'), 'n：scriptTask 写 scriptFormat="bash"（脚本由 bash -e 执行）'],
  [one(job('n', ext('<coda:script>echo</coda:script>'))), 'n：脚本放在 scriptTask 的 <script> 里，不写 coda:script'],
  [one('<scriptTask id="n" scriptFormat="bash"><script> </script></scriptTask>'), 'n：scriptTask 需要 <script>'],
  [one(job().replace('echo ok','x'.repeat(20001))), 'n：脚本过长'],
  [one(`<userTask id="n">${ext('<coda:output name="x"/>')}</userTask>`), 'n：coda:output 只写在自动步骤与结束事件上'],
  [one(job('n', ext('<coda:output name="x" value="1"/>'))), 'n：脚本步骤的 coda:output 只写 name，值由脚本写进 $GITHUB_OUTPUT'],
  [one('<userTask id="n"/>', `<endEvent id="e">${ext('<coda:output name="x"/>')}</endEvent>`), 'e 的 coda:output x 需要 value（不超过 4000 字）'],
  [one(`<userTask id="n"><documentation>${'x'.repeat(4001)}</documentation></userTask>`), 'n：documentation 过长'],
  [one(`<userTask id="n">${ext('<coda:field type="text" id="x" label="X"/>')}</userTask>`), 'n：有输入字段（text、secret 或 coda:fields）的任务只交给用户，写 coda:assignee="user"'],
  [one(job('n', '<standardLoopCharacteristics/>')), 'p/n：不支持标准循环（standardLoopCharacteristics）：重复做一件事写成连回去的连线加网关，按集合或次数做多份写多实例'],
  [one('<userTask id="n"/>', `<subProcess id="sub" triggeredByEvent="true">${loop('<loopCardinality>1</loopCardinality>')}</subProcess>`), 'p/sub：多实例只写在任务、子流程与 callActivity 上'],
  [one(job('n', loop(''))), 'p/n：多实例要写做几份：coda:inputCollection（按集合，每份一个元素）或 loopCardinality（次数）'],
  [one(job('n', loop('<loopCardinality>-1</loopCardinality>'))), 'p/n：loopCardinality 写非负整数，或「=」开头的 FEEL 表达式'],
  [one(job('n', loop('<loopCardinality>1</loopCardinality><completionCondition>n.ok</completionCondition>'))), 'p/n：completionCondition 须为「=」开头的 FEEL 表达式，如 =deploy.ok'],
  [one('<userTask id="n"/>', '<adHocSubProcess id="sub"><completionCondition>n.ok</completionCondition></adHocSubProcess>'), 'sub：completionCondition 须为「=」开头的 FEEL 表达式'],
  [one('<userTask id="n"/>', '<adHocSubProcess id="sub"><startEvent id="ss"/></adHocSubProcess>'), 'sub：自由子流程里不写开始、结束事件：里面没有进线的节点都会开始'],
  [one(job('n','<multiInstanceLoopCharacteristics coda:inputCollection="=inputs.items" coda:inputElement="n"/>')), 'p/n：coda:inputElement 不能是节点、消息的 id'],
  [one('<userTask id="n"/>', '<subProcess id="sub" triggeredByEvent="true"><startEvent id="ss" isInterrupting="false"><errorEventDefinition/></startEvent></subProcess>'), 'p/sub/ss：出错开始的事件子流程总是打断它所在的范围，不写 isInterrupting="false"'],
  [one('<userTask id="n"/>', `<subProcess id="sub" triggeredByEvent="true">${startTimer('R/PT6H')}</subProcess>`).replace('id="s"><timer','id="ss"><timer'), 'p/sub/ss：事件子流程的计时器写 timeDuration 或 timeDate，从它所在的范围开始时算起'],
  [one('<userTask id="n"/>', '<intermediateCatchEvent id="w"><messageEventDefinition/></intermediateCatchEvent>'), 'p/w：消息须引用一个有 name 的 <message>（name 是 Coda 的事件名，如 session.facts）'],
  [one('<receiveTask id="n"/>'), 'p/n：receiveTask 须引用一个有 name 的 <message>（name 是 Coda 的事件名，如 session.facts）'],
  [one('<userTask id="n"/>', '<intermediateCatchEvent id="w"><signalEventDefinition/></intermediateCatchEvent>'), 'p/w：信号须引用一个 <signal>，抛出与捕获按它配对'],
  [one('<userTask id="n"/>', '<endEvent id="e"><escalationEventDefinition/></endEvent>'), 'p/e：抛出的升级须引用一个 <escalation>'],
  [one('<userTask id="n"/>', '<intermediateThrowEvent id="w"><linkEventDefinition/></intermediateThrowEvent>'), 'p/w：连接事件须写 name，抛出与捕获按它配对'],
  [one().replace('<sequenceFlow id="s-n" sourceRef="s" targetRef="n"></sequenceFlow>', flow('s','n','s-n','<conditionExpression xsi:type="tFormalExpression" language="javascript">=true</conditionExpression>')), 'p/s-n：条件只支持 FEEL 表达式，不运行脚本'],
  [one('<userTask id="n"/>', '<intermediateCatchEvent id="w"><conditionalEventDefinition><condition>true</condition></conditionalEventDefinition></intermediateCatchEvent>'), 'p/w：条件事件的条件须为「=」开头的 FEEL 表达式，如 =checks.passed'],
  [xml(`<startEvent id="s"/>${flow('s','n','f','<conditionExpression>true</conditionExpression>')}<userTask id="n"/>`), 'p/f：条件须为「=」开头的 FEEL 表达式，如 =check.go'],
  [one('<userTask id="n"/>', '<endEvent id="e"><cancelEventDefinition/></endEvent>'), 'e：取消结束事件只写在事务子流程（transaction）里'],
  [one('<userTask id="n"/>', '<boundaryEvent id="b" attachedToRef="n"><cancelEventDefinition/></boundaryEvent>'), 'b：取消边界事件只挂在事务子流程（transaction）上'],
  [one('<userTask id="n"/>', '<subProcess id="sub" triggeredByEvent="true"/>'), 'sub：事件子流程恰好一个开始事件，由它的事件启动'],
  [one('<userTask id="n"/>', '<subProcess id="sub" triggeredByEvent="true"><startEvent id="ss"><errorEventDefinition/></startEvent></subProcess>'+flow('sub','n')), 'sub：事件子流程不连顺序流，由它开始事件的事件启动'],
  [one('<userTask id="n"/>', '<subProcess id="sub" triggeredByEvent="true"><startEvent id="ss"><errorEventDefinition/></startEvent></subProcess><boundaryEvent id="b" attachedToRef="sub"><errorEventDefinition/></boundaryEvent>'), 'sub：事件子流程上不挂边界事件'],
  [one('<userTask id="n"/>', '<intermediateCatchEvent id="a"><linkEventDefinition name="go"/></intermediateCatchEvent><intermediateCatchEvent id="b"><linkEventDefinition name="go"/></intermediateCatchEvent>'), 'b：同一层里只能有一个名为「go」的连接捕获事件'],
  [one('<userTask id="n"/>', '<intermediateThrowEvent id="a"><linkEventDefinition name="go"/></intermediateThrowEvent>'), 'a：同一层里没有名为「go」的连接捕获事件'],
  [one('<userTask id="n"/>', '<eventBasedGateway id="g"/>'), 'g：事件网关后面至少接两个等待的事件'],
  [one('<userTask id="n"/>', '<eventBasedGateway id="g"/>'+flow('g','n','a','<conditionExpression>=true</conditionExpression>')+flow('g','n','b')), 'g：事件网关的出口不写条件，走哪条由先来的事件决定'],
  [one('<userTask id="n"/>', '<eventBasedGateway id="g"/>'+flow('g','n','a')+flow('g','n','b')), 'g：事件网关的出口只接中间捕获事件（消息、计时器、信号、条件）或 receiveTask'],
  [xml('<userTask id="n"/>'), 'workflow.bpmn 需要一个开始事件'],
  [one('<userTask id="n"/>','<boundaryEvent id="b" attachedToRef="n"><compensateEventDefinition/></boundaryEvent>'+flow('b','n')), 'b：补偿边界事件不连顺序流，用关联（association）连到做补偿的节点'],
  [one('<userTask id="n"/>','<boundaryEvent id="b" attachedToRef="n"><compensateEventDefinition/></boundaryEvent>'), 'b：补偿边界事件用一条关联（association）连到一个标了 isForCompensation="true" 的节点'],
  [one('<userTask id="n" isForCompensation="true"/>'), 'n：做补偿的节点（isForCompensation）不连顺序流，由补偿边界事件的关联引到'],
  [one('<userTask id="n"/>','<task id="undo" isForCompensation="true"/>'), 'undo：没有补偿边界事件用关联引到这个做补偿的节点'],
  [one('<userTask id="n"/>', Array.from({length:51},(_,i)=>job(`j${i}`)+flow('s',`j${i}`)).join('')), 'workflow.bpmn 最多 50 个 scriptTask'],
  [xml('<startEvent id="s"/>'), 'workflow.bpmn 至少要有一个 scriptTask、serviceTask、userTask 或 callActivity'],
  [one('<userTask id="n"/>',job('lost')), '从开始事件走不到这些步骤：lost'],
  [one('<userTask id="n"/>','<userTask id="lost"/>'), '从开始事件走不到这些任务：lost'],
  [timed('R/PT6H',startTimer('R/PT12H').replace('id="s"','id="ss"')), '定时开始只能有一个，现有 s、ss'],
  [timed('R/PT6H').replaceAll('timeCycle','timeDuration'), 's：定时开始写 timeCycle（ISO 8601 重复间隔，如 R/PT6H），不写 timeDuration、timeDate'],
  [timed('=inputs.every'), 's：timeCycle 的表达式只能读插件的设置，如 =vars.maintenance.schedule'],
  [timed('x'.repeat(201)), 's 的 timeCycle 须为 ISO 8601 重复间隔，如 R/PT6H'],
  [timed('tomorrow'), 's 的 timeCycle 不是 ISO 8601 重复间隔：tomorrow（如 R/PT6H）'],
  [timed('R3/PT6H'), 's 的 timeCycle 只接受不限次数、不写结束时间的重复间隔：R/<时长> 或 R/<开始时刻>/<时长>，如 R/PT6H；现为 R3/PT6H'],
  [timed('R/PT0S'), 's 的 timeCycle 的间隔至少 5 分钟：R/PT0S'],
  [timed('R/PT6H','<startEvent id="plain"/>'), '由事件或定时启动的流程，开始事件都要带消息或计时器；要手动发起，订阅 workflow.dispatch'],
  [byMessage('session.opened'), '跟随会话的流程（订阅 session.opened）不能有人工任务：n。它不属于任何会话，任务没有人可交'],
  [one('<userTask id="n"/>','','','coda:agents="codex"'), 'coda:agents 只写在生命周期流程上（开始事件订阅 session.opened）'],
  [byMessage('session.opened','<serviceTask id="n" coda:action="workflow-kinds"/>','','coda:key="fixed"'), '生命周期流程按会话唯一，不能声明 coda:key'],
  [one('<userTask id="n"/>','','','coda:dispatch="false"'), 'coda:dispatch="false" 的流程须由事件或定时启动（开始事件带消息或计时器），否则无法发起'],
  [one('<userTask id="n"/>','',message+message.replace('id="m"','id="m2"')), '<message name="repo.push"> 写了不止一个：一个事件只写一个 <message>，开始事件与等它的节点都引用它'],
  [one('<userTask id="n"/>','','<message id="inputs" name="repo.push"/>'), '<message id="inputs">：id 不能是 inputs、run、github、vars：表达式按这些名字读运行自带的变量，接到的消息按 id 读'],
  [byMessage('user.go'), '用户发出的消息（user.…）不能启动流程，只能在运行中等它'],
  [byMessage('workflow.cancel'), 'workflow.cancel 是要停下运行，不能启动流程；在运行中等它，接到后走自己的收尾'],
  [one('<userTask id="n"/>','<receiveTask id="w" messageRef="m"/>','<message id="m" name="user.UPPER"/>'), '<message name="user.UPPER">：用户发出的消息名为 user. 加小写字母、数字和「-」'],
  [one('<userTask id="n"/>',`<receiveTask id="w" name="${'字'.repeat(41)}" messageRef="m"/>`,'<message id="m" name="user.go"/>'), '等 user.go 的节点名须不超过 40 个字（它是运行页上的按钮）'],
  [one('<userTask id="n"/>','<sequenceFlow id="f"/>'), 'p/f：顺序流须引用流程中的起点与终点'],
  [one('<userTask id="n"/>','<boundaryEvent id="b"><errorEventDefinition/></boundaryEvent>'), 'p/b：边界事件须引用挂靠的活动（attachedToRef）'],
];
for (const [index, [source, expected]] of wrong.entries()) test(`structure rejection ${index + 1}: ${expected}`, async () => {
  assert.equal(await workflowProblem(source), expected);
});

// Exercise every row of the event-position table, including empty events and every disallowed definition.
const definitions = {
  Message: '<messageEventDefinition messageRef="m"/>', Timer: timer,
  Signal: '<signalEventDefinition signalRef="sig"/>', Conditional: '<conditionalEventDefinition><condition>=true</condition></conditionalEventDefinition>',
  Error: '<errorEventDefinition/>', Escalation: '<escalationEventDefinition escalationRef="esc"/>', Terminate: '<terminateEventDefinition/>',
  Link: '<linkEventDefinition name="go"/>', Compensate: '<compensateEventDefinition/>', Cancel: '<cancelEventDefinition/>',
};
function positioned(position, kind) {
  let definition = kind ? definitions[kind] : '', body = '', baseline = '<userTask id="n"/>', start = '<startEvent id="s"/>';
  if (position === 'start') {
    if (kind === 'Timer') definition = '<timerEventDefinition><timeCycle>R/PT5M</timeCycle></timerEventDefinition>';
    start = `<startEvent id="s">${definition}</startEvent>`;
  } else if (position === 'innerStart' || position === 'eventStart') body = `<subProcess id="sub" ${position === 'eventStart' ? 'triggeredByEvent="true"' : ''}><startEvent id="e">${definition}</startEvent></subProcess>`;
  else {
    const type = position.slice(5), tag = type[0].toLowerCase()+type.slice(1);
    body = `<${tag} id="e" ${position === 'bpmn:BoundaryEvent' ? 'attachedToRef="n"' : ''}>${definition}</${tag}>`;
    if (kind === 'Link' && position === 'bpmn:IntermediateThrowEvent') body += '<intermediateCatchEvent id="catch"><linkEventDefinition name="go"/></intermediateCatchEvent>';
    if (kind === 'Cancel' && position === 'bpmn:EndEvent') body = `<transaction id="transaction">${body}</transaction>`;
    if (kind === 'Cancel' && position === 'bpmn:BoundaryEvent') body = body.replace('attachedToRef="n"','attachedToRef="transaction"')+'<transaction id="transaction"/>';
    if (kind === 'Compensate' && position === 'bpmn:BoundaryEvent') body += '<manualTask id="undo" isForCompensation="true"/><association id="a" sourceRef="e" targetRef="undo"/>';
  }
  return xml(`${start}${flow('s','n')}${baseline}${body}`, message+'<signal id="sig"/><escalation id="esc"/>');
}
for (const [position, allowed] of Object.entries(CODA_STRUCTURE.events)) for (const kind of ['', ...Object.keys(definitions)])
  test(`event position ${position}: ${kind || 'none'}`, async () => {
    const problem = await workflowProblem(positioned(position,kind));
    if (kind ? allowed.includes(kind) : !CODA_STRUCTURE.requiredEvents.includes(position)) assert.equal(problem,null);
    else {
      assert.ok(problem);
      assert.match(problem, /^(p\/s|p\/sub\/e|p\/e|p\/transaction\/e)：/);
      assert.ok(problem.includes(CODA_STRUCTURE.eventNames[position]) || problem.includes('只收不发'),problem);
    }
  });

test('every unsupported element retains its explanation', async () => {
  for (const [type, description] of Object.entries(CODA_STRUCTURE.unsupported)) {
    // Choreography-only types cannot be held by a Process: moddle rejects their containment first.
    const name = type.slice(5), tag = name[0].toLowerCase()+name.slice(1);
    const problem = await workflowProblem(one('<userTask id="n"/>',`<${tag} id="bad"/>`));
    assert.ok(problem);
    assert.ok(problem === `p/bad：Coda 不运行 ${name}：${description}` || problem.includes(`unparsable content <${tag}>`),problem);
  }
});

test('scripts, documentation and all native expressions are checked at their actual location', async () => {
  const problem = await workflowProblem(one(job().replace('echo ok', 'echo $NAME你好')));
  assert.equal(problem, 'n 的脚本 里的 `$NAME` 后面紧跟「你」，macOS 的 bash 会把它读进变量名而展开为空：要展开变量写成 `${NAME}你`，要原样输出这几个字写成 `\\$NAME你`（不放在单引号里）；这条检查不区分引号与注释');
  for (const script of ['echo ${NAME}你好', 'echo \\$NAME你好', 'echo $$NAME你好', 'echo $NAME']) assert.equal(await workflowProblem(one(job().replace('echo ok',()=>script))),null);
  assert.match(await workflowProblem(one('<userTask id="n"><documentation>{{ 1 + }}</documentation></userTask>')), /^n 的 documentation：/);
  assert.match(await workflowProblem(one(job().replace('echo ok','${environment.variables.x}'))), /^workflow.bpmn 第 1 行：表达式改用 FEEL/);
  for (const [extra, where] of [[loop('<loopCardinality>=1 +</loopCardinality>'), 'loopCardinality'], [loop('<loopCardinality>1</loopCardinality><completionCondition>=1 +</completionCondition>'),'completionCondition']])
    assert.match(await workflowProblem(one(job('n', extra))),new RegExp(`^p/n 的 ${where}：`));
  for (const field of ['timeDuration','timeDate','timeCycle']) assert.match(await workflowProblem(one('<userTask id="n"/>',`<intermediateCatchEvent id="w"><timerEventDefinition><${field}>=1 +</${field}></timerEventDefinition></intermediateCatchEvent>`)), new RegExp(`^p/w 的 ${field}：`));
});

test('graph traversal accepts cycles, object-owned ids, nested scopes, links, compensation and ad-hoc entries', async () => {
  for (const id of ['constructor','toString','__proto__','hasOwnProperty']) {
    assert.equal(await workflowProblem(one(job(id)).replace('targetRef="n"',`targetRef="${id}"`)),null);
    assert.equal(await workflowProblem(byMessage(id)), null);
  }
  assert.equal(await workflowProblem(one(job(),flow('n','s'))),null);
  assert.equal(await workflowProblem(one('<adHocSubProcess id="n">'+job('inner')+'</adHocSubProcess>')),null);
  assert.equal(await workflowProblem(one('<subProcess id="n" coda:optional="true" coda:expect="PT1H"><startEvent id="ss"/>'+flow('ss','inner')+job('inner')+flow('inner','end')+'<endEvent id="end"/></subProcess>')),null);
  assert.equal(await workflowProblem(one(job('n','<multiInstanceLoopCharacteristics coda:inputCollection="=inputs.items" coda:inputElement="item"><completionCondition>=item.done</completionCondition></multiInstanceLoopCharacteristics>'))),null);
  for (const cycle of ['R/PT5M','R/P1M','R/2026-01-01T00:00:00Z/P1D','=vars.plugin.every']) assert.equal(await workflowProblem(timed(cycle)),null);
  let nested = '<callActivity id="work" calledElement="work"/>';
  for (let i=5000;i>0;i--) nested=`<subProcess id="b${i}">${nested}</subProcess>`;
  assert.equal(await workflowProblem(one('<userTask id="n"/>',nested)),null);
  // No spread into a function call, no recursive DFS. The XML stays under the public size limit.
  const count = 8000;
  const chain = Array.from({length:count},(_,i)=>`<task id="t${i}"/>`+flow(i ? `t${i-1}` : 'n',`t${i}`)).join('');
  assert.equal(await workflowProblem(one('<userTask id="n"/>',chain+flow(`t${count-1}`,'n','back'))),null);
});

test('multiple definitions report the event location, and scopes keep link names separate', async () => {
  assert.equal(await workflowProblem(one('<userTask id="n"/>','<subProcess id="sub" triggeredByEvent="true"><startEvent id="ss"><timerEventDefinition><timeCycle/></timerEventDefinition></startEvent></subProcess>')),
    'p/sub/ss：事件子流程的计时器写 timeDuration 或 timeDate，从它所在的范围开始时算起');
  assert.equal(await workflowProblem(one('<userTask id="n"/>','<boundaryEvent id="b" attachedToRef="n"><errorEventDefinition/>'+timer+'</boundaryEvent>')),
    'p/b：一个事件只带一个事件定义；要等几个事件里先来的一个，在它们前面放一个事件网关（eventBasedGateway）');
  const jump = '<intermediateThrowEvent id="jump"><linkEventDefinition name="go"/></intermediateThrowEvent>';
  const catchIt = '<intermediateCatchEvent id="catch"><linkEventDefinition name="go"/></intermediateCatchEvent>';
  assert.equal(await workflowProblem(one('<userTask id="n"/>',jump+'<subProcess id="sub">'+catchIt+'</subProcess>')), 'jump：同一层里没有名为「go」的连接捕获事件');
  assert.equal(await workflowProblem(one('<userTask id="n"/>',jump+catchIt+flow('catch','job')+job('job'))), '从开始事件走不到这些步骤：job');
  assert.equal(await workflowProblem(one('<userTask id="n"/>',flow('n','jump')+jump+catchIt+flow('catch','job')+job('job'))), null);
  const compensation = '<boundaryEvent id="b" attachedToRef="n"><compensateEventDefinition/></boundaryEvent><association id="a" sourceRef="b" targetRef="undo"/>';
  assert.equal(await workflowProblem(one(job(),compensation+job('undo','','isForCompensation="true"'))),null);
});

test('lifecycle waits hear facts directly, on outer boundaries, or in an event subprocess; sibling scopes do not hear them', async () => {
  const top = '<message id="m" name="session.opened"/><message id="facts" name="session.facts"/>';
  const start = '<startEvent id="s"><messageEventDefinition messageRef="m"/></startEvent>';
  const build = body => xml(start+flow('s','n')+body,top);
  const deaf = '聋状态：流程在 n 等待时收不到 session.facts，会话的事实变了没有人回应。跟随会话的流程（订阅 session.opened）每个等待节点都要能收 session.facts：自己等它，或挂一个等它的消息边界事件（挂在外层子流程上也算）';
  for (const wait of [job(), '<callActivity id="n" calledElement="work"/>','<serviceTask id="n" coda:action="run-workflows"/>']) assert.equal(await workflowProblem(build(wait)),deaf);
  const onBoundary = '<boundaryEvent id="b" attachedToRef="n"><messageEventDefinition messageRef="facts"/></boundaryEvent>';
  assert.equal(await workflowProblem(build(job()+onBoundary)),null);
  const listener = '<subProcess id="listen" triggeredByEvent="true"><startEvent id="ls"><messageEventDefinition messageRef="facts"/></startEvent></subProcess>';
  assert.equal(await workflowProblem(build(job()+listener)),null);
  assert.equal(await workflowProblem(build(job()+'<subProcess id="sibling">'+listener+'</subProcess>')),deaf);
  assert.equal(await workflowProblem(build('<subProcess id="n"><startEvent id="ns"/>'+flow('ns','inner')+job('inner')+'</subProcess>'+onBoundary)),null);
  const direct = '<receiveTask id="n" messageRef="facts"/>';
  assert.equal(await workflowProblem(build(direct+'<serviceTask id="act" coda:action="workflow-kinds"/>'+flow('n','act'))),null);
  const timedAction = '<serviceTask id="n" coda:action="workflow-kinds"/><boundaryEvent id="bt" attachedToRef="n">'+timer+'</boundaryEvent>';
  assert.equal(await workflowProblem(build(timedAction)),deaf);
  assert.equal(await workflowProblem(build(timedAction+listener)),null);
});
