import type { MetricKey } from './cvss31';

/**
 * Metric names and value definitions, quoted (lightly shortened, examples removed) from the
 * FIRST CVSS v3.1 Specification, section 2, Tables 1–8.
 * https://www.first.org/cvss/v3.1/specification-document
 */
export const METRIC_INFO: Record<
  MetricKey,
  { name: string; values: Record<string, { label: string; definition: string }> }
> = {
  AV: {
    name: 'Attack Vector',
    values: {
      N: {
        label: 'Network',
        definition:
          'The vulnerable component is bound to the network stack and the set of possible attackers extends beyond the other options, up to and including the entire Internet.',
      },
      A: {
        label: 'Adjacent',
        definition:
          'The vulnerable component is bound to the network stack, but the attack is limited at the protocol level to a logically adjacent topology (same physical or logical network, or a limited administrative domain).',
      },
      L: {
        label: 'Local',
        definition:
          "The vulnerable component is not bound to the network stack and the attacker's path is via read/write/execute capabilities: local or remote (e.g. SSH) access, or relying on another user to perform actions.",
      },
      P: {
        label: 'Physical',
        definition:
          'The attack requires the attacker to physically touch or manipulate the vulnerable component.',
      },
    },
  },
  AC: {
    name: 'Attack Complexity',
    values: {
      L: {
        label: 'Low',
        definition:
          'Specialized access conditions or extenuating circumstances do not exist. An attacker can expect repeatable success when attacking the vulnerable component.',
      },
      H: {
        label: 'High',
        definition:
          "A successful attack depends on conditions beyond the attacker's control: it cannot be accomplished at will, but requires a measurable amount of effort in preparation or execution.",
      },
    },
  },
  PR: {
    name: 'Privileges Required',
    values: {
      N: {
        label: 'None',
        definition:
          'The attacker is unauthorized prior to attack, and does not require any access to settings or files of the vulnerable system.',
      },
      L: {
        label: 'Low',
        definition:
          'The attacker requires privileges that provide basic user capabilities that could normally affect only settings and files owned by a user, or access to only non-sensitive resources.',
      },
      H: {
        label: 'High',
        definition:
          'The attacker requires privileges that provide significant (e.g. administrative) control over the vulnerable component, allowing access to component-wide settings and files.',
      },
    },
  },
  UI: {
    name: 'User Interaction',
    values: {
      N: {
        label: 'None',
        definition: 'The vulnerable system can be exploited without interaction from any user.',
      },
      R: {
        label: 'Required',
        definition:
          'Successful exploitation requires a user to take some action before the vulnerability can be exploited.',
      },
    },
  },
  S: {
    name: 'Scope',
    values: {
      U: {
        label: 'Unchanged',
        definition:
          'An exploited vulnerability can only affect resources managed by the same security authority.',
      },
      C: {
        label: 'Changed',
        definition:
          'An exploited vulnerability can affect resources beyond the security scope managed by the security authority of the vulnerable component.',
      },
    },
  },
  C: {
    name: 'Confidentiality',
    values: {
      H: {
        label: 'High',
        definition:
          'Total loss of confidentiality: all resources within the impacted component are divulged, or the restricted information obtained presents a direct, serious impact.',
      },
      L: {
        label: 'Low',
        definition:
          'Some loss of confidentiality: the attacker does not control what is obtained, or the loss is limited. No direct, serious loss to the impacted component.',
      },
      N: { label: 'None', definition: 'No loss of confidentiality within the impacted component.' },
    },
  },
  I: {
    name: 'Integrity',
    values: {
      H: {
        label: 'High',
        definition:
          'Total loss of integrity or a complete loss of protection, or a limited modification with a direct, serious consequence to the impacted component.',
      },
      L: {
        label: 'Low',
        definition:
          'Modification of data is possible, but the attacker does not control the consequence, or the amount is limited. No direct, serious impact.',
      },
      N: { label: 'None', definition: 'No loss of integrity within the impacted component.' },
    },
  },
  A: {
    name: 'Availability',
    values: {
      H: {
        label: 'High',
        definition:
          'Total loss of availability: the attacker can fully deny access to resources in the impacted component (sustained or persistent), or a partial denial has a direct, serious consequence.',
      },
      L: {
        label: 'Low',
        definition:
          'Performance is reduced or there are interruptions in resource availability, without a direct, serious consequence to the impacted component.',
      },
      N: { label: 'None', definition: 'No impact to availability within the impacted component.' },
    },
  },
};
