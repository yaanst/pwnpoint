import { useEffect, useRef, useState } from 'preact/hooks';
import type { Vault } from '../storage/vault';
import { allCategories, DEFAULT_CATEGORIES, MAX_CATEGORY_NAME } from './categories';
import type { Finding, Project } from './model';
import { addCategory, removeCategory } from './repository';

interface Props {
  vault: Vault;
  project: Project;
  findings: Finding[];
  onChange: (project: Project) => void;
  onClose: () => void;
}

/** Lists the categories of a project and lets the user add or remove the project's own. */
export function CategoriesDialog({ vault, project, findings, onChange, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => ref.current?.showModal(), []);

  const builtIn = new Set(DEFAULT_CATEGORIES.map((c) => c.code));
  const count = (c: string) => findings.filter((f) => f.category === c).length;

  const run = async (action: () => Promise<Project>, done: string) => {
    try {
      onChange(await action());
      setErrors([]);
      setMessage(done);
      return true;
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'The change could not be saved.']);
      setMessage('');
      return false;
    }
  };

  const add = async (event: Event) => {
    event.preventDefault();
    const upper = code.trim().toUpperCase();
    const added = await run(
      () => addCategory(vault, project.id, { code: upper, name }),
      `${upper} added.`,
    );
    if (added) {
      setCode('');
      setName('');
    }
  };

  return (
    <dialog
      ref={ref}
      class="dialog"
      aria-labelledby="categories-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2 id="categories-title">Finding categories</h2>
      <div class="dialog-body stack">
        <p>
          A category adds its code to the reference: <code>VLN.NET.01</code> instead of{' '}
          <code>VLN.01</code>. Each category is numbered on its own. Findings without a category
          keep <code>VLN.01</code>, <code>VLN.02</code>…
        </p>
        <table class="findings-table">
          <caption class="visually-hidden">Categories of {project.name}</caption>
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Name</th>
              <th scope="col">Findings</th>
              <th scope="col">
                <span class="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {allCategories(project.categories).map((c) => (
              <tr key={c.code}>
                <td class="ref">{c.code}</td>
                <td>{c.name}</td>
                <td>{count(c.code)}</td>
                <td class="actions">
                  {builtIn.has(c.code) ? (
                    <span class="muted">Built in</span>
                  ) : (
                    <button
                      type="button"
                      class="small danger"
                      aria-label={`Remove category ${c.code}`}
                      onClick={() =>
                        void run(
                          () => removeCategory(vault, project.id, c.code),
                          `${c.code} removed.`,
                        )
                      }
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form class="stack" onSubmit={(e) => void add(e)} noValidate>
          <h3>Add a category to this project</h3>
          <div class="row">
            <label for="category-code">Code</label>
            <input
              id="category-code"
              type="text"
              size={8}
              maxLength={6}
              autocomplete="off"
              spellcheck={false}
              placeholder="CLOUD"
              aria-describedby="category-code-hint"
              value={code}
              onInput={(e) => setCode(e.currentTarget.value.toUpperCase())}
            />
            <label for="category-name">Name</label>
            <input
              id="category-name"
              type="text"
              maxLength={MAX_CATEGORY_NAME}
              placeholder="Cloud services"
              value={name}
              onInput={(e) => setName(e.currentTarget.value)}
            />
            <button type="submit" disabled={!code.trim() || !name.trim()}>
              Add
            </button>
          </div>
          <p id="category-code-hint" class="hint">
            2 to 6 capital letters or digits, starting with a letter.
          </p>
        </form>
        <div role="alert">
          {errors.length > 0 && (
            <ul class="errors">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
        <p role="status" class="muted">
          {message}
        </p>
      </div>
      <div class="dialog-actions">
        <button type="button" class="primary" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}
