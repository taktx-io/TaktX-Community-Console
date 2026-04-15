/**
 * bpmnDmnBridge.ts
 *
 * Utilities to bridge BPMN process definitions with DMN decision definitions.
 * Parses BPMN XML to extract Zeebe `calledDecision` references from
 * businessRuleTask elements, enabling navigation from a BPMN flow node to
 * its associated DMN decision.
 *
 * Zeebe BPMN businessRuleTask extension structure:
 * <businessRuleTask id="Task_1" name="Evaluate Risk">
 *   <extensionElements>
 *     <zeebe:calledDecision decisionId="riskEvaluation" resultVariable="result"/>
 *   </extensionElements>
 * </businessRuleTask>
 */

export interface CalledDecision {
  /** The DMN decision ID referenced by this task. */
  decisionId: string;
  /** The process variable where the decision result will be stored. */
  resultVariable?: string;
}

/**
 * Parses the given BPMN XML and extracts all `zeebe:calledDecision` references.
 *
 * @param bpmnXml - Raw BPMN 2.0 XML string.
 * @returns A Map from BPMN element ID → CalledDecision. Only businessRuleTask
 *          elements that carry a `zeebe:calledDecision` extension are included.
 */
export function extractCalledDecisions(bpmnXml: string): Map<string, CalledDecision> {
  const result = new Map<string, CalledDecision>();

  if (typeof window === 'undefined') {
    // Server-side: DOMParser is not available — return empty map.
    return result;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(bpmnXml, 'application/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      console.warn('[bpmnDmnBridge] BPMN XML parse error:', parseError.textContent);
      return result;
    }

    const allElements = doc.querySelectorAll('*');

    for (const el of allElements) {
      const localName = el.localName?.toLowerCase();
      if (localName !== 'businessruletask') continue;

      const elementId = el.getAttribute('id');
      if (!elementId) continue;

      // Look for zeebe:calledDecision inside extensionElements
      let calledDecision: Element | null = null;
      for (const child of el.children) {
        if (child.localName?.toLowerCase() === 'extensionelements') {
          for (const grandchild of child.children) {
            if (grandchild.localName?.toLowerCase() === 'calleddecision') {
              calledDecision = grandchild;
              break;
            }
          }
          break;
        }
      }

      if (!calledDecision) continue;

      const decisionId = calledDecision.getAttribute('decisionId');
      if (!decisionId) continue;

      result.set(elementId, {
        decisionId,
        resultVariable: calledDecision.getAttribute('resultVariable') ?? undefined,
      });
    }
  } catch (err) {
    console.warn('[bpmnDmnBridge] Failed to parse BPMN XML for DMN references:', err);
  }

  return result;
}

/**
 * Returns the calledDecision for a specific BPMN element ID, or null if the
 * element is not a businessRuleTask or has no decision reference.
 */
export function getCalledDecision(
  elementId: string,
  calledDecisions: Map<string, CalledDecision>
): CalledDecision | null {
  return calledDecisions.get(elementId) ?? null;
}

