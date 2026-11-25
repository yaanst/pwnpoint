import { type Finding, newFinding } from '../findings/model';

/** Demo finding used to preview a theme in Settings. */
export const SAMPLE_FINDING: Finding = {
  ...newFinding('sample', 'sample', 3, 0),
  title: 'SQL injection in the customer portal search',
  assets: ['portal.example.com/search'],
  description:
    'The `q` parameter is concatenated into a SQL query. An **unauthenticated** attacker can read the whole database.',
  impact: '- Theft of customer personal data\n- Access to password hashes',
  cvss: { AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'U', C: 'H', I: 'L', A: 'N' },
};
