import traverse from 'traverse';
import * as babel from '@babel/core';

import { MitosisComponent } from '../types/mitosis-component';
import { getRefs } from './get-refs';
import { isMitosisNode } from './is-mitosis-node';
import { methodLiteralPrefix } from '../constants/method-literal-prefix';
import { functionLiteralPrefix } from '../constants/function-literal-prefix';
import { babelTransformExpression } from './babel-transform';
import { GETTER, SETTER } from './patterns';

const tsPreset = require('@babel/preset-typescript');

export type RefMapper = (refName: string) => string;

const replaceRefsInString = (code: string, refs: string[], mapper: RefMapper) => {
  return babelTransformExpression(code, {
    Identifier(path: babel.NodePath<babel.types.Identifier>) {
      const name = path.node.name;
      const isRef = refs.includes(name);
      if (isRef) {
        path.replaceWith(babel.types.identifier(mapper(name)));
      }
    },
  });
};

export const mapRefs = (component: MitosisComponent, mapper: RefMapper): void => {
  const refSet = getRefs(component);

  // grab refs not used for bindings
  Object.keys(component.refs).forEach((ref) => refSet.add(ref));
  const refs = Array.from(refSet);

  for (const key of Object.keys(component.state)) {
    const value = component.state[key];
    if (typeof value === 'string') {
      if (value.startsWith(methodLiteralPrefix)) {
        const methodValue = value.replace(methodLiteralPrefix, '');
        const isGet = Boolean(methodValue.match(GETTER));
        const isSet = Boolean(methodValue.match(SETTER));
        component.state[key] =
          methodLiteralPrefix +
          replaceRefsInString(
            methodValue.replace(/^(get |set )?/, 'function '),
            refs,
            mapper,
          ).replace(/^function /, isGet ? 'get ' : isSet ? 'set ' : '');
      } else if (value.startsWith(functionLiteralPrefix)) {
        component.state[key] =
          functionLiteralPrefix +
          replaceRefsInString(value.replace(functionLiteralPrefix, ''), refs, mapper);
      }
    }
  }

  traverse(component).forEach(function (item) {
    if (isMitosisNode(item)) {
      for (const key of Object.keys(item.bindings)) {
        const value = item.bindings[key];
        if (typeof value === 'object' && key !== 'ref') {
          item.bindings[key] = {
            ...value,
            code: replaceRefsInString(value.code as string, refs, mapper),
          };
        }
      }
    }
  });

  for (const key of Object.keys(component.hooks) as (keyof typeof component.hooks)[]) {
    const hooks = component.hooks[key];
    if (Array.isArray(hooks)) {
      hooks.forEach((hook) => {
        if (hook.code) {
          hook.code = replaceRefsInString(hook.code, refs, mapper);
        }

        if (hook.deps) {
          hook.deps = replaceRefsInString(hook.deps, refs, mapper);
        }
      });
    } else {
      const hookCode = hooks?.code;
      if (hookCode) {
        hooks.code = replaceRefsInString(hookCode, refs, mapper);
      }

      if (hooks?.deps) {
        hooks.deps = replaceRefsInString(hooks?.deps, refs, mapper);
      }
    }
  }
};
