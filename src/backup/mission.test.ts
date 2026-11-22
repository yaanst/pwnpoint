import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME } from '../slides/theme';
import { newScenario, findingStep, techniqueStep } from '../scenarios/model';
import { newFinding } from '../findings/model';
import { unzipStored, zip } from '../export/zip';
import { encryptWithPassphrase } from '../storage/crypto';
import { buildMissionFile, openMissionFile, type OpenedMission } from './mission';
import { TINY_PNG } from './testing';
import type { MissionContent } from './validate';

/** The first item, or a test failure. */
function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error('Expected at least one item.');
  return item;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function sample(): MissionContent {
  const finding = { ...newFinding('f1', 'p1', 1, 1000), title: 'SQL injection' };
  const scenario = {
    ...newScenario('s1', 'p1', 1, 1000),
    title: 'Domain takeover',
    steps: [findingStep('st1', 'f1'), { ...techniqueStep('st2'), technique: 'Kerberoasting' }],
  };
  return {
    scope: 'project',
    exportedAt: 0,
    appVersion: '',
    projects: [
      {
        project: {
          id: 'p1',
          name: 'ACME',
          nextFindingNumber: 2,
          nextScenarioNumber: 2,
          createdAt: 1,
        },
        findings: [finding],
        evidence: [
          {
            meta: {
              id: 'e1',
              findingId: 'f1',
              projectId: 'p1',
              caption: 'Login page',
              order: 0,
              width: 1,
              height: 1,
              byteLength: TINY_PNG.length,
              createdAt: 1,
            },
            bytes: TINY_PNG,
          },
        ],
        scenarios: [scenario],
      },
    ],
  };
}

const ok = (o: OpenedMission) => {
  if (o.status !== 'ok') throw new Error(`Expected ok, got ${JSON.stringify(o)}`);
  return o.content;
};
const errors = (o: OpenedMission) => (o.status === 'error' ? o.errors.join(' ') : o.status);

/** Rebuilds a plain file with `data.json` changed by `edit`. */
async function tampered(edit: (data: Record<string, unknown>) => void, images = true) {
  const files = unzipStored(
    await buildMissionFile(sample(), { passphrase: null, appVersion: 't' }),
  );
  const data = JSON.parse(dec.decode(files.get('data.json'))) as Record<string, unknown>;
  edit(data);
  files.set('data.json', enc.encode(JSON.stringify(data)));
  if (!images) files.delete('images/e1.png');
  return zip([...files].map(([name, d]) => ({ name, data: d })));
}

describe('mission file', () => {
  it('round-trips a plain file: readable manifest, data.json and PNG images', async () => {
    const file = await buildMissionFile(sample(), {
      passphrase: null,
      appVersion: '0.2.0',
      now: 5,
    });
    const files = unzipStored(file);
    expect([...files.keys()]).toEqual(['pwnpoint.json', 'data.json', 'images/e1.png']);
    expect(JSON.parse(dec.decode(files.get('pwnpoint.json')))).toEqual({
      format: 'pwnpoint-mission',
      version: 2,
      encrypted: false,
    });
    const content = ok(openMissionFile(file));
    expect(content.appVersion).toBe('0.2.0');
    expect(content.exportedAt).toBe(5);
    expect(content.projects[0]?.findings[0]?.title).toBe('SQL injection');
    expect(content.projects[0]?.evidence[0]?.bytes).toEqual(TINY_PNG);
    expect(content.projects[0]?.scenarios[0]?.steps).toHaveLength(2);
  });

  it('encrypts everything but the manifest, and needs the passphrase to open', async () => {
    const file = await buildMissionFile(sample(), {
      passphrase: 'correct horse battery',
      appVersion: 't',
    });
    const files = unzipStored(file);
    expect([...files.keys()]).toEqual(['pwnpoint.json', 'payload.bin']);
    const manifest = JSON.parse(dec.decode(files.get('pwnpoint.json'))) as {
      encrypted: boolean;
      kdf: unknown;
      cipher: { name: string };
    };
    expect(manifest.encrypted).toBe(true);
    expect(manifest.kdf).toMatchObject({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000 });
    expect(manifest.cipher.name).toBe('AES-GCM');
    // No content in clear anywhere in the file.
    expect(dec.decode(file)).not.toContain('SQL injection');
    expect(dec.decode(file)).not.toContain('ACME');

    const opened = openMissionFile(file);
    if (opened.status !== 'needs-passphrase') throw new Error('expected a passphrase prompt');
    expect(errors(await opened.open('wrong passphrase!'))).toMatch(/Wrong passphrase/);
    expect(ok(await opened.open('correct horse battery')).projects[0]?.project.name).toBe('ACME');
  });

  it('refuses an encrypted file with weak or absurd KDF settings', async () => {
    const file = await buildMissionFile(sample(), {
      passphrase: 'correct horse battery',
      appVersion: 't',
      iterations: 1000,
    });
    expect(errors(openMissionFile(file))).toMatch(/encryption settings are invalid/);
  });

  it('refuses files that are not mission files', async () => {
    expect(errors(openMissionFile(enc.encode('hello')))).toMatch(/not a PwnPoint mission file/);
    expect(
      errors(openMissionFile(zip([{ name: 'pwnpoint.json', data: enc.encode('{}') }]))),
    ).toMatch(/not a PwnPoint mission file/);
    const newer = zip([
      { name: 'pwnpoint.json', data: enc.encode('{"format":"pwnpoint-mission","version":3}') },
    ]);
    expect(errors(openMissionFile(newer))).toMatch(/newer version/);
  });

  it('validates every record and reports readable errors', async () => {
    const bad = await tampered((d) => {
      const f = first(d.findings as Record<string, unknown>[]);
      f.title = 42;
      (f.cvss as Record<string, unknown>).AV = 'X';
      f.status = 'published';
    });
    const e = errors(openMissionFile(bad));
    expect(e).toContain('Finding 1 title must be text');
    expect(e).toContain('Finding 1 CVSS AV must be one of: N, A, L, P.');
    expect(e).toContain('Finding 1 status must be one of: draft, validated.');
  });

  it('checks references between records and that every image is there', async () => {
    expect(errors(openMissionFile(await tampered(() => {}, false)))).toMatch(/Image 1 is missing/);
    const orphan = await tampered((d) => {
      first(d.findings as Record<string, unknown>[]).projectId = 'nope';
    });
    expect(errors(openMissionFile(orphan))).toMatch(/Finding 1 belongs to no project/);
    const dup = await tampered((d) => {
      first(d.scenarios as Record<string, unknown>[]).id = 'f1';
    });
    expect(errors(openMissionFile(dup))).toMatch(/appears twice/);
    const badId = await tampered((d) => {
      first(d.projects as Record<string, unknown>[]).id = '../../etc';
    });
    expect(errors(openMissionFile(badId))).toMatch(/invalid id/);
  });

  it('drops unknown fields and fixes counters that lag behind the numbers in use', async () => {
    const file = await tampered((d) => {
      const p = first(d.projects as Record<string, unknown>[]);
      p.nextFindingNumber = 1;
      p.__proto__evil = '<script>';
      first(d.findings as Record<string, unknown>[]).html = '<img onerror=alert(1)>';
    });
    const p = first(ok(openMissionFile(file)).projects);
    expect(p.project.nextFindingNumber).toBe(2);
    expect(Object.keys(p.project)).not.toContain('__proto__evil');
    expect(Object.keys(first(p.findings))).not.toContain('html');
  });

  it('keeps finding categories and moves each category counter past its numbers', async () => {
    const file = await tampered((d) => {
      const p = first(d.projects as Record<string, unknown>[]);
      p.categories = [{ code: 'CLOUD', name: 'Cloud' }];
      p.categoryCounters = { NET: 2 };
      const f = first(d.findings as Record<string, unknown>[]);
      f.category = 'NET';
      f.number = 7;
      (d.findings as unknown[]).push({ ...f, id: 'f2', category: 'CLOUD', number: 3 });
    });
    const p = first(ok(openMissionFile(file)).projects);
    expect(p.project.categories).toEqual([{ code: 'CLOUD', name: 'Cloud' }]);
    expect(p.project.categoryCounters).toEqual({ NET: 8, CLOUD: 4 });
    expect(p.findings.map((f) => [f.category, f.number])).toEqual([
      ['NET', 7],
      ['CLOUD', 3],
    ]);
  });

  it('refuses unknown or malformed categories', async () => {
    const unknown = await tampered((d) => {
      first(d.findings as Record<string, unknown>[]).category = 'CLOUD';
    });
    expect(errors(openMissionFile(unknown))).toMatch(/category CLOUD, which its project/);
    const malformed = await tampered((d) => {
      const p = first(d.projects as Record<string, unknown>[]);
      p.categories = [
        { code: 'net<script>', name: 'x' },
        { code: 'NET', name: 'Dup' },
      ];
      p.categoryCounters = { 'bad key': 1 };
      first(d.findings as Record<string, unknown>[]).category = 'n';
    });
    const text = errors(openMissionFile(malformed));
    expect(text).toMatch(/Project 1 category 1 has an invalid category code/);
    expect(text).toMatch(/uses the code NET twice/);
    expect(text).toMatch(/category counter has an invalid category code/);
    expect(text).toMatch(/Finding 1 has an invalid category code/);
  });

  it('still reads version 1 files, plain and encrypted', async () => {
    const files = unzipStored(
      await buildMissionFile(sample(), { passphrase: null, appVersion: 't' }),
    );
    const data = JSON.parse(dec.decode(files.get('data.json'))) as Record<string, unknown>;
    data.version = 1;
    const inner = [...files]
      .filter(([name]) => name !== 'pwnpoint.json')
      .map(([name, d]) => ({
        name,
        data: name === 'data.json' ? enc.encode(JSON.stringify(data)) : d,
      }));
    const manifest = (extra: object) =>
      enc.encode(JSON.stringify({ format: 'pwnpoint-mission', version: 1, ...extra }));

    const plain = zip([{ name: 'pwnpoint.json', data: manifest({ encrypted: false }) }, ...inner]);
    expect(first(ok(openMissionFile(plain)).projects).project.name).toBe('ACME');

    // As v0.2.0 wrote it: the ciphertext is bound to "pwnpoint-mission/1".
    const sealed = await encryptWithPassphrase(zip(inner), 'pass phrase', 'pwnpoint-mission/1');
    const encrypted = zip([
      {
        name: 'pwnpoint.json',
        data: manifest({
          encrypted: true,
          kdf: { ...sealed.kdf, salt: btoa(String.fromCharCode(...sealed.kdf.salt)) },
          cipher: { ...sealed.cipher, iv: btoa(String.fromCharCode(...sealed.cipher.iv)) },
        }),
      },
      { name: 'payload.bin', data: sealed.data },
    ]);
    const opened = openMissionFile(encrypted);
    if (opened.status !== 'needs-passphrase') throw new Error('expected a passphrase prompt');
    expect(first(ok(await opened.open('pass phrase')).projects).project.name).toBe('ACME');
  });

  it('keeps valid environmental metrics and refuses invalid ones', async () => {
    const good = await tampered((d) => {
      first(d.findings as Record<string, unknown>[]).cvssEnv = { CR: 'H', MAV: 'A' };
    });
    expect(first(first(ok(openMissionFile(good)).projects).findings).cvssEnv).toEqual({
      CR: 'H',
      MAV: 'A',
    });
    const bad = await tampered((d) => {
      first(d.findings as Record<string, unknown>[]).cvssEnv = { CR: 'X', MZ: 'A' };
    });
    expect(errors(openMissionFile(bad))).toContain('Finding 1 CVSS CR must be one of: H, M, L.');
  });

  it('refuses images that are not PNG', async () => {
    const files = unzipStored(
      await buildMissionFile(sample(), { passphrase: null, appVersion: 't' }),
    );
    files.set('images/e1.png', enc.encode('<svg onload="alert(1)"/>'));
    const file = zip([...files].map(([name, data]) => ({ name, data })));
    expect(errors(openMissionFile(file))).toMatch(/Image 1 is not a PNG/);
  });

  it('carries the slide theme of a full backup', async () => {
    const content = {
      ...sample(),
      scope: 'all' as const,
      theme: { ...DEFAULT_THEME, name: 'ACME' },
    };
    const file = await buildMissionFile(content, { passphrase: null, appVersion: 't' });
    const back = ok(openMissionFile(file));
    expect(back.scope).toBe('all');
    expect(back.theme?.name).toBe('ACME');
  });
});
