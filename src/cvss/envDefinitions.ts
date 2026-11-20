import { METRIC_INFO } from './definitions';
import { type EnvKey, MODIFIES } from './environmental';

/**
 * Environmental metric names and value definitions, quoted (lightly shortened) from the FIRST
 * CVSS v3.1 Specification, section 4.1 (Table 12) and 4.2. Modified metrics reuse the base
 * metric's definitions. https://www.first.org/cvss/v3.1/specification-document
 */
type Info = { name: string; values: Record<string, { label: string; definition: string }> };

const NOT_DEFINED_REQ = {
  label: 'Not defined',
  definition:
    'Insufficient information to choose one of the other values. Same effect on scoring as Medium.',
};

const requirement = (what: string): Info => ({
  name: `${what} Requirement`,
  values: {
    X: NOT_DEFINED_REQ,
    H: {
      label: 'High',
      definition: `Loss of ${what} is likely to have a catastrophic adverse effect on the organization or individuals associated with it (e.g. employees, customers).`,
    },
    M: {
      label: 'Medium',
      definition: `Loss of ${what} is likely to have a serious adverse effect on the organization or individuals associated with it.`,
    },
    L: {
      label: 'Low',
      definition: `Loss of ${what} is likely to have only a limited adverse effect on the organization or individuals associated with it.`,
    },
  },
});

function modified(key: EnvKey): Info {
  const base = MODIFIES[key];
  if (!base) throw new Error(`${key} is not a modified metric.`);
  const info = METRIC_INFO[base];
  return {
    name: `Modified ${info.name}`,
    values: {
      X: {
        label: 'Not defined',
        definition: `Uses the base ${info.name} value. Set another value when this client's environment differs (e.g. a mitigation in place).`,
      },
      ...info.values,
    },
  };
}

export const ENV_INFO: Record<EnvKey, Info> = {
  CR: requirement('Confidentiality'),
  IR: requirement('Integrity'),
  AR: requirement('Availability'),
  MAV: modified('MAV'),
  MAC: modified('MAC'),
  MPR: modified('MPR'),
  MUI: modified('MUI'),
  MS: modified('MS'),
  MC: modified('MC'),
  MI: modified('MI'),
  MA: modified('MA'),
};
