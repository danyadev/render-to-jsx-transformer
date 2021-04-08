/**
* Source: https://github.com/flying-sheep/babel-plugin-transform-react-createelement-to-jsx
*
* What we want to handle here is this CallExpression:
*
* React.createElement(
*   type: StringLiteral|Identifier|MemberExpression,
*   [props: ObjectExpression|Expression],
*   [...children: StringLiteral|Expression]
* )
*/

function transformCreateElementToJSX({ types }) {
  function getJSXNode(node) {
    if (!isReactCreateElement(node)) {
      return null;
    }

    // nodeName and nodeProps may be undefined, getJSX* need to handle that
    const [nodeName, nodeProps, ...childNodes] = node.arguments;

    const name = getJSXName(nodeName);
    if (name === null) {
      // name is required
      return null;
    };

    const props = getJSXProps(nodeProps);
    if (props === null) {
      // no props → []
      // invalid → null
      return null;
    }

    const children = getJSXChildren(childNodes);
    if (children === null) {
      // no children → []
      // invalid → null
      return null;
    }

    const selfClosing = children.length === 0;
    const startTag = types.jSXOpeningElement(name, props, selfClosing);
    const endTag = selfClosing ? null : types.jSXClosingElement(name);

    return types.jSXElement(startTag, endTag, children, selfClosing);
  }

  // Get a JSXIdentifier or JSXMemberExpression from a Node of known type.
  // Returns null if a unknown node type, null or undefined is passed.
  function getJSXName(node) {
    if (node == null) {
      return null;
    }

    const name = getJSXIdentifier(node);
    if (name !== null) {
      return name;
    }

    if (!types.isMemberExpression(node)) {
      return null;
    }

    const object = getJSXName(node.object);
    const property = getJSXName(node.property);

    if (object === null || property === null) {
      return null;
    }

    return types.jSXMemberExpression(object, property);
  }

  // Get a array of JSX(Spread)Attribute from a props ObjectExpression.
  // Handles the _extends Expression babel creates from SpreadElement nodes.
  // Returns null if a validation error occurs.
  function getJSXProps(node) {
    if (node == null || isNullLikeNode(node)) {
      return [];
    }

    if (types.isCallExpression(node) && types.isIdentifier(node.callee, { name: '_extends' })) {
      const props = node.arguments.map(getJSXProps);

      // if calling this recursively works, flatten.
      if (props.every((prop) => prop !== null)) {
        return props.flat();
      }
    }

    if (!types.isObjectExpression(node) && types.isExpression(node)) {
      return [types.jSXSpreadAttribute(node)];
    }

    if (!isPlainObjectExpression(node)) {
      return null;
    }

    return node.properties.map((prop) => (
      types.isObjectProperty(prop)
        ? types.jSXAttribute(getJSXIdentifier(prop.key), getJSXAttributeValue(prop.value))
        : types.jSXSpreadAttribute(prop.argument)
    ));
  }

  function getJSXChild(node) {
    if (types.isStringLiteral(node)) {
      return types.jSXText(node.value);
    }

    if (isReactCreateElement(node)) {
      return getJSXNode(node);
    }

    if (types.isExpression(node)) {
      return types.jSXExpressionContainer(node);
    }

    return null;
  }

  function getJSXChildren(nodes) {
    const children = nodes.filter((node) => !isNullLikeNode(node)).map(getJSXChild);

    if (children.some((child) => child == null)) {
      return null;
    }

    return children;
  }

  function getJSXIdentifier(node) {
    // TODO: JSXNamespacedName

    if (types.isIdentifier(node)) {
      return types.jSXIdentifier(node.name);
    }

    if (types.isStringLiteral(node)) {
      return types.jSXIdentifier(node.value);
    }

    return null;
  }

  function getJSXAttributeValue(node) {
    if (types.isStringLiteral(node) || types.isJSXElement(node)) {
      return node;
    }

    if (types.isExpression(node)) {
      return types.jSXExpressionContainer(node);
    }

    return null;
  }

  const isReactCreateElement = (node) => (
    types.isCallExpression(node) &&
    types.isMemberExpression(node.callee) &&
    types.isIdentifier(node.callee.object, { name: 'React' }) &&
    types.isIdentifier(node.callee.property, { name: 'createElement' }) &&
    !node.callee.computed
  );

  const isNullLikeNode = (node) => (
    types.isNullLiteral(node) ||
    types.isIdentifier(node, { name: 'undefined' })
  );

  const isPlainObjectExpression = (node) => (
    types.isObjectExpression(node) &&
    node.properties.every((prop) => (
      types.isSpreadElement(prop) ||
      (
        types.isObjectProperty(prop, { computed: false }) &&
        getJSXIdentifier(prop.key) !== null &&
        getJSXAttributeValue(prop.value) !== null
      )
    ))
  );

  return {
    visitor: {
      CallExpression(path) {
        const node = getJSXNode(path.node);

        if (node === null) {
          return null;
        }

        path.replaceWith(node);
      }
    }
  };
}

function transformCode(code) {
  return Babel.transform(code, {
    plugins: [transformCreateElementToJSX]
  }).code;
}
