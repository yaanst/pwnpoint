import { useEffect, useRef, useState } from 'preact/hooks';
import type { Vault } from '../storage/vault';
import { allCategories, type CategoryKind, DEFAULTS, MAX_CATEGORY_NAME } from './categories';
import type { Project } from './model';
import { addCategory, removeCategory } from './repository';

interface Props {
  vault: Vault;
  project: Project;
  /** The findings or recommendations of the project, to count what uses each code. */
  items: { category?: string }[];
  kind?: CategoryKind;
  onChange: (project: Project) => void;
  onClose: () => void;
}

/** Lists the categories of a project and lets the user add or remove the project's own. */
const TEXT: Record<
  CategoryKind,
  {
    title: string;
    intro: string;
    items: string;
    field: 'categories' | 'recommendationCategories';
    example: [string, string];
  }
> = {
  finding: {
    title: 'Finding categories',
    intro:
      'A category adds its code to the reference: VLN.NET.01 instead of VLN.01. Each category is numbered on its own. Findings without a category keep VLN.01, VLN.02…',
    items: 'Findings',
    field: 'categories',
    example: ['CLOUD', 'Cloud services'],
  },
  recommendation: {
    title: 'Recommendation categories',
    intro:
      'A category adds its code to the reference: REC.ACC.01 instead of REC.01. Each category is numbered on its own. These categories are separate from the finding categories.',
    items: 'Recommendations',
    field: 'recommendationCategories',
    example: ['IAM', 'Identity management'],
  },
};

export function CategoriesDialog({
  vault,
  project,
  items,
  kind = 'finding',
  onChange,
  onClose,
}: Props) {
  const T = TEXT[kind];
  const ref = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => ref.current?.showModal(), []);

  const builtIn = new Set(DEFAULTS[kind].map((c) => c.code));
  const count = (c: string) => items.filter((f) => f.category === c).length;

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
      () => addCategory(vault, project.id, { code: upper, name }, kind),
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
      <h2 id="categories-title">{T.title}</h2>
      <div class="dialog-body stack">
        <p>{T.intro}</p>
        <table class="findings-table">
          <caption class="visually-hidden">Categories of {project.name}</caption>
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Name</th>
              <th scope="col">{T.items}</th>
              <th scope="col">
                <span class="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {allCategories(project[T.field], kind).map((c) => (
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
                          () => removeCategory(vault, project.id, c.code, kind),
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
              placeholder={T.example[0]}
              aria-describedby="category-code-hint"
              value={code}
              onInput={(e) => setCode(e.currentTarget.value.toUpperCase())}
            />
            <label for="category-name">Name</label>
            <input
              id="category-name"
              type="text"
              maxLength={MAX_CATEGORY_NAME}
              placeholder={T.example[1]}
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
