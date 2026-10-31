// Value operations JSON Schema cannot express: defer checking an expression until it is read, measure UTF-16 text
// (with a limit optionally named by a sibling), and validate JSON supplied as text or as a value, bounded in UTF-8 bytes.
// None knows what a card field is. Schemas select the operations and their limits; validation never changes the input.
import { isAbsolute } from 'node:path';

// The byte length of a JSON value, without recursion or serializing the whole object. Stop as soon as the budget is
// exceeded. Only JSON values count: cycles, non-finite numbers and non-JSON objects cannot turn into a different value.
function jsonFits(value, max) {
  let bytes = 0;
  const active = new Set(), stack = [{ value }];
  while (stack.length && bytes <= max) {
    const frame = stack.at(-1);
    if (frame.keys) {
      if (frame.index === frame.keys.length) { active.delete(frame.value); stack.pop(); continue; }
      const key = frame.keys[frame.index++];
      bytes += (frame.index > 1 ? 1 : 0) + Buffer.byteLength(JSON.stringify(key)) + 1;
      stack.push({ value: frame.value[key] });
      continue;
    }
    if (frame.array) {
      if (frame.index === frame.value.length) { active.delete(frame.value); stack.pop(); continue; }
      if (frame.index++) bytes++;
      stack.push({ value: frame.value[frame.index - 1] });
      continue;
    }
    const item = frame.value;
    if (item !== null && typeof item === 'object') {
      if (active.has(item)) return false;
      active.add(item);
      bytes += 2;
      frame.index = 0;
      if (Array.isArray(item)) {
        if (item.length > max) return false;
        frame.array = true;
      } else {
        if (![Object.prototype, null].includes(Object.getPrototypeOf(item))) return false;
        frame.keys = Object.keys(item);
        if (frame.keys.length > max) return false;
      }
    } else {
      if (typeof item === 'number' && !Number.isFinite(item)) return false;
      if (item !== null && !['string', 'number', 'boolean'].includes(typeof item)) return false;
      // JSON escaping cannot shorten a string, so avoid serializing one already over budget.
      if (typeof item === 'string' && item.length > max - bytes) return false;
      bytes += Buffer.byteLength(JSON.stringify(item));
      stack.pop();
    }
  }
  return bytes <= max;
}

export function valueKeywords(ajv, { feelProblem, isExpression }) {
  ajv.addFormat('absolute-path', value => isAbsolute(value.trim()));
  ajv.addFormat('https-url', value => { try { return new URL(value.trim()).protocol === 'https:'; } catch { return false; } });
  ajv.addKeyword({
    keyword: 'x-length', type: 'string', schemaType: ['number', 'object'], errors: true,
    metaSchema: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'object', properties: { property: { type: 'string' } }, required: ['property'], additionalProperties: false }] },
    compile(spec, parentSchema) {
      return function length(value, cxt) {
        const limit = typeof spec === 'number' ? spec : cxt.parentData && Object.hasOwn(cxt.parentData, spec.property) ? cxt.parentData[spec.property] : undefined;
        if (Number.isInteger(limit) && limit >= 0 && value.length <= limit) return true;
        length.errors = [{ keyword: 'x-length', params: { limit }, parentSchema, message: '文字过长' }];
        return false;
      };
    },
  });
  ajv.addKeyword({
    keyword: 'x-deferred', schemaType: ['object', 'boolean'], errors: true,
    compile(schema) {
      const validate = ajv.compile(schema);
      return function deferred(value, cxt) {
        // In a definition every textual value is also read as FEEL. At runtime even an expression-looking result is
        // literal content; only a definition may postpone the wrapped schema's checks.
        if (this?.definition && typeof value === 'string') {
          const problem = feelProblem(value, this.names);
          if (problem) { deferred.errors = [{ keyword: 'x-feel', params: {}, message: problem }]; return false; }
          if (isExpression(value) || value.includes('{{')) return true;
        }
        const valid = validate.call(this, value, cxt);
        deferred.errors = validate.errors;
        return valid;
      };
    },
  });
  ajv.addKeyword({
    keyword: 'x-json', schemaType: 'object', errors: true,
    metaSchema: { type: 'object', properties: { schema: { type: ['object', 'boolean'] }, maxBytes: { type: 'integer', minimum: 0 } }, required: ['schema', 'maxBytes'], additionalProperties: false },
    compile(spec, parentSchema) {
      const validate = ajv.compile(spec.schema);
      return function json(value, cxt) {
        let parsed = value;
        if (typeof value === 'string') try { parsed = JSON.parse(value); }
        catch { json.errors = [{ keyword: 'x-json', params: {}, parentSchema, message: '不是 JSON' }]; return false; }
        if (!jsonFits(parsed, spec.maxBytes)) {
          json.errors = [{ keyword: 'x-json', params: {}, parentSchema: spec.schema, message: `须为不超过 ${spec.maxBytes} 字节的 JSON` }];
          return false;
        }
        const valid = validate.call(this, parsed, cxt);
        json.errors = validate.errors;
        return valid;
      };
    },
  });
}
