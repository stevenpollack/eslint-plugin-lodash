/**
 * @fileoverview Rule to prefer _.noop over an empty function
 */
'use strict'

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const getDocsUrl = require('../util/getDocsUrl')

module.exports = {
    meta: {
        type: 'problem',
        schema: [],
        docs: {
            url: getDocsUrl('prefer-is-nil')
        }
    },

    create(context) {
        const {isNegationExpression, isEquivalentMemberExp} = require('../util/astUtil')
        const {isCallToLodashMethod, getLodashContext} = require('../util/lodashUtil')
        const _ = require('lodash')
        const lodashContext = getLodashContext(context)
        const nilChecks = {
            null: {
                isValue: _.matches({type: 'Literal', value: null}),
                expressionChecks: [getLodashTypeCheckedBy('isNull'), getValueComparedTo('null')]
            },
            undefined: {
                isValue: _.matches({type: 'Identifier', name: 'undefined'}),
                expressionChecks: [getLodashTypeCheckedBy('isUndefined'), getValueComparedTo('undefined'), getValueWithTypeofUndefinedComparison]
            }
        }

        function getLodashTypeCheckedBy(typecheck) {
            return function (node) {
                return isCallToLodashMethod(node, typecheck, lodashContext) && node.arguments[0]
            }
        }

        function getValueComparedTo(nil) {
            return function (node, operator) {
                return node.type === 'BinaryExpression' && node.operator === operator &&
                    ((nilChecks[nil].isValue(node.right) && node.left) || (nilChecks[nil].isValue(node.left) && node.right))
            }
        }


        const getTypeofArgument = _.cond([
            [_.matches({type: 'UnaryExpression', operator: 'typeof'}), _.property('argument')]
        ])

        const isUndefinedString = _.matches({type: 'Literal', value: 'undefined'})

        function getValueWithTypeofUndefinedComparison(node, operator) {
            return node.type === 'BinaryExpression' && node.operator === operator &&
                ((isUndefinedString(node.right) && getTypeofArgument(node.left)) ||
                (isUndefinedString(node.left) && getTypeofArgument(node.right)))
        }

        function checkExpression(nil, operator, node) {
            return _(nilChecks[nil].expressionChecks)
                .map(check => check(node, operator))
                .find()
        }

        function checkNegatedExpression(nil, node) {
            return (isNegationExpression(node) && checkExpression(nil, '===', node.argument)) || checkExpression(nil, '!==', node)
        }

        function getNilCheck(node, isNegated) {
            return _(['null', 'undefined'])
                .map(nil => ({nil, subject: isNegated ? checkNegatedExpression(nil, node) : checkExpression(nil, '===', node)}))
                .find('subject')
        }

        function getOperands(node, operator) {
            return node.type === 'LogicalExpression' && node.operator === operator ?
                [...getOperands(node.left, operator), ...getOperands(node.right, operator)] :
                [node]
        }

        const visitors = lodashContext.getImportVisitors()
        visitors.LogicalExpression = function (node) {
            const {parent, operator} = node
            if (parent.type === 'LogicalExpression' && parent.operator === operator) {
                return
            }
            const pending = []
            const reported = []
            getOperands(node, operator).forEach(operand => {
                const check = getNilCheck(operand, operator !== '||')
                if (!check || reported.some(subject => isEquivalentMemberExp(subject, check.subject))) {
                    return
                }
                const partner = pending.find(p => p.nil !== check.nil && isEquivalentMemberExp(p.subject, check.subject))
                if (partner) {
                    reported.push(check.subject)
                    context.report({
                        node,
                        loc: {start: partner.operand.loc.start, end: operand.loc.end},
                        message: 'Prefer isNil over checking for undefined or null.'
                    })
                } else {
                    pending.push({...check, operand})
                }
            })
        }
        return visitors
    }
}
